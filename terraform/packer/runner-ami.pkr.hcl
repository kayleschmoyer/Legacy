packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = "~> 1"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "runner_version" {
  type    = string
  default = "2.333.0"
}

variable "node_version" {
  type    = string
  default = "22"
}

variable "pnpm_version" {
  type    = string
  default = "9.12.1"
}

variable "playwright_version" {
  type    = string
  default = "1.58.2"
}

variable "terraform_version" {
  type    = string
  default = "1.14.0"
}

variable "serve_version" {
  type    = string
  default = "14.2.4"
}

variable "snyk_version" {
  type    = string
  default = "1.1293.1"
}

variable "android_api_level" {
  type    = string
  default = "35"
}

variable "android_build_tools_version" {
  type    = string
  default = "35.0.0"
}

variable "android_ndk_version" {
  type    = string
  default = "27.1.12297006"
}

variable "android_cmdline_tools_build" {
  type        = string
  description = "Build number in the cmdline-tools download URL: commandlinetools-linux-<build>_latest.zip. Find at https://developer.android.com/studio#command-tools"
  default     = "14742923"
}

variable "android_cmdline_tools_sha256" {
  type        = string
  description = "SHA-256 of commandlinetools-linux-<build>_latest.zip. Verify at https://developer.android.com/studio#command-tools"
  # SHA-256 for commandlinetools-linux-14742923_latest.zip
  default = "04453066b540409d975c676d781da1477479dde3761310f1a7eb92a1dfb15af7"
}

variable "docker_version" {
  type    = string
  default = "28.1.1"
}

variable "instance_type" {
  type    = string
  default = "c7a.xlarge"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID for the Packer build instance"
}

variable "subnet_id" {
  type        = string
  description = "Public subnet ID for the Packer build instance (must have IGW route)"
}

source "amazon-ebs" "runner" {
  ami_name      = "legacy-sports-runner-{{timestamp}}"
  instance_type = var.instance_type
  region        = var.region

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
      state               = "available"
    }
    most_recent = true
    owners      = ["099720109477"] # Canonical
  }

  ssh_username                = "ubuntu"
  vpc_id                      = var.vpc_id
  subnet_id                   = var.subnet_id
  associate_public_ip_address = true

  # The Ubuntu 22.04 source AMI ships with an 8 GB root volume — too small for
  # the Android NDK (~8 GB uncompressed) plus Node.js, Playwright, Docker, etc.
  # This resizes the Packer build instance disk only; the runner AMI inherits
  # this size (runners also need the full SDK at runtime).
  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 60
    volume_type           = "gp3"
    delete_on_termination = true
  }

  tags = {
    Name              = "legacy-sports-runner"
    Project           = "legacy-sports"
    ManagedBy         = "packer"
    NodeVersion       = var.node_version
    PnpmVersion       = var.pnpm_version
    RunnerVersion     = var.runner_version
    PlaywrightVersion = var.playwright_version
    TerraformVersion  = var.terraform_version
    AndroidApiLevel   = var.android_api_level
    AndroidNdkVersion = var.android_ndk_version
    DockerInstalled   = "true"
  }
}

build {
  sources = ["source.amazon-ebs.runner"]

  # System updates and base packages
  provisioner "shell" {
    inline = [
      "export DEBIAN_FRONTEND=noninteractive",
      "sudo rm -rf /var/lib/apt/lists/*",
      "sudo apt-get update -qq",
      "sudo apt-get upgrade -y -qq --fix-missing",
      # Refresh package index after upgrade — upgrade can invalidate the index,
      # causing "no installation candidate" for packages like zip/build-essential.
      "sudo apt-get update -qq",
      "sudo apt-get install -y -qq --fix-missing curl jq zip unzip git build-essential libssl-dev",
      "echo 'umask 0022' | sudo tee -a /etc/profile",
      "sudo sed -i 's/^UMASK.*/UMASK\t\t022/' /etc/login.defs",
    ]
  }

  # Node.js + corepack + pnpm
  provisioner "shell" {
    inline = [
      "curl -fsSL https://deb.nodesource.com/setup_${var.node_version}.x | sudo bash -",
      "sudo apt-get install -y -qq nodejs",
      "node --version",
      "sudo npm install -g corepack",
      "sudo corepack enable",
      "sudo corepack prepare pnpm@${var.pnpm_version} --activate",
      "pnpm --version",
    ]
  }

  # Playwright: system dependencies + Chromium browser binary + global CLI
  #
  # IMPORTANT: playwright_version must be kept in sync with the @playwright/test
  # version declared in the root package.json.
  # Playwright requires the browser binary version to exactly match the library
  # version — a mismatch causes CI to re-download the browser on every run.
  #
  # Browsers are installed to /opt/playwright-browsers (world-readable, fixed
  # path) so CI can detect them with a simple directory check rather than the
  # unreliable `playwright install --dry-run` approach.
  provisioner "shell" {
    inline = [
      "sudo npx --yes playwright@${var.playwright_version} install-deps chromium",
      "sudo mkdir -p /opt/playwright-browsers",
      "sudo chmod 755 /opt/playwright-browsers",
      "sudo env PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers npx --yes playwright@${var.playwright_version} install chromium",
      "sudo chmod -R a+rX /opt/playwright-browsers",
      "sudo npm install -g playwright@${var.playwright_version}",
      # Export PLAYWRIGHT_BROWSERS_PATH for login shells
      "echo 'export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers' | sudo tee /etc/profile.d/playwright.sh",
      # Export for GitHub Actions runner process (non-login shell) via /etc/environment
      "echo 'PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers' | sudo tee -a /etc/environment",
    ]
  }

  # Static file server (used by Playwright E2E shards)
  provisioner "shell" {
    inline = [
      "sudo npm install -g serve@${var.serve_version}",
    ]
  }

  # Terraform
  provisioner "shell" {
    inline = [
      "curl -sL https://releases.hashicorp.com/terraform/${var.terraform_version}/terraform_${var.terraform_version}_linux_amd64.zip -o /tmp/terraform_${var.terraform_version}_linux_amd64.zip",
      "curl -sL https://releases.hashicorp.com/terraform/${var.terraform_version}/terraform_${var.terraform_version}_SHA256SUMS -o /tmp/terraform_SHA256SUMS",
      "grep terraform_${var.terraform_version}_linux_amd64.zip /tmp/terraform_SHA256SUMS > /tmp/terraform_checksum",
      "cd /tmp && sha256sum -c terraform_checksum",
      "sudo unzip -q -o /tmp/terraform_${var.terraform_version}_linux_amd64.zip -d /usr/local/bin",
      "rm /tmp/terraform_${var.terraform_version}_linux_amd64.zip /tmp/terraform_SHA256SUMS /tmp/terraform_checksum",
      "terraform --version",
    ]
  }

  # uv (Python package manager for skill linting)
  provisioner "shell" {
    inline = [
      "curl -LsSf https://astral.sh/uv/install.sh -o /tmp/uv-install.sh",
      "sudo env UV_INSTALL_DIR=/usr/local/bin sh /tmp/uv-install.sh",
      "rm /tmp/uv-install.sh",
      "uvx --version",
    ]
  }

  # Snyk CLI (security scanning)
  provisioner "shell" {
    inline = [
      "curl -sfSL https://static.snyk.io/cli/v${var.snyk_version}/snyk-linux -o /tmp/snyk-linux",
      "curl -sfSL https://static.snyk.io/cli/v${var.snyk_version}/snyk-linux.sha256 -o /tmp/snyk-linux.sha256",
      "cd /tmp && sha256sum -c snyk-linux.sha256",
      "sudo mv /tmp/snyk-linux /usr/local/bin/snyk",
      "sudo chmod +x /usr/local/bin/snyk",
      "rm -f /tmp/snyk-linux.sha256",
      "snyk --version",
    ]
  }

  # Docker Engine (required by container-based GitHub Actions like osv-scanner-action)
  # Uses the official Docker APT repo with a pinned version for deterministic builds.
  provisioner "shell" {
    inline = [
      "export DEBIAN_FRONTEND=noninteractive",
      "sudo apt-get install -y -qq ca-certificates gnupg",
      "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg",
      "echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu jammy stable' | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null",
      "sudo apt-get update -qq",
      "sudo apt-get install -y -qq docker-ce=5:${var.docker_version}-1~ubuntu.22.04~jammy docker-ce-cli=5:${var.docker_version}-1~ubuntu.22.04~jammy containerd.io docker-buildx-plugin docker-compose-plugin",
      "sudo usermod -aG docker ubuntu",
      "sudo systemctl enable docker",
      "sudo systemctl start docker",
      "sudo systemctl is-active --quiet docker",
      "sudo docker info",
    ]
  }

  # GitHub CLI (used by CI workflows for PR operations, artifact management, etc.)
  provisioner "shell" {
    inline = [
      "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /tmp/githubcli-archive-keyring.gpg",
      "sudo install -m 644 /tmp/githubcli-archive-keyring.gpg /usr/share/keyrings/githubcli-archive-keyring.gpg",
      "rm -f /tmp/githubcli-archive-keyring.gpg",
      "echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main' | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null",
      "sudo apt-get update -qq",
      "sudo apt-get install -y -qq gh",
      "gh --version",
    ]
  }

  # GitHub Actions runner dependencies (not the agent itself — the module installs that)
  provisioner "shell" {
    inline = [
      "mkdir -p /tmp/runner-install",
      "cd /tmp/runner-install",
      "curl -sL https://github.com/actions/runner/releases/download/v${var.runner_version}/actions-runner-linux-x64-${var.runner_version}.tar.gz -o runner.tar.gz",
      "tar xzf runner.tar.gz",
      "sudo ./bin/installdependencies.sh",
      "rm -rf /tmp/runner-install",
    ]
  }

  # AWS CLI v2
  provisioner "shell" {
    inline = [
      "curl -sL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/awscliv2.zip",
      "unzip -q /tmp/awscliv2.zip -d /tmp",
      "sudo /tmp/aws/install",
      "rm -rf /tmp/awscliv2.zip /tmp/aws",
      "aws --version",
    ]
  }

  # Amazon CloudWatch Agent (required by the github-aws-runners module when
  # enable_cloudwatch_agent = true). The module's start_runner.sh reads the
  # enable_cloudwatch SSM parameter and calls amazon-cloudwatch-agent-ctl to
  # apply the agent config. Without the agent pre-baked, the command exits 127
  # (command not found) and the runner-start-failed error handler aborts the
  # cloud-init script before config.sh ever registers the runner with GitHub.
  provisioner "shell" {
    inline = [
      "curl -sL https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb -o /tmp/amazon-cloudwatch-agent.deb",
      "sudo dpkg -i -E /tmp/amazon-cloudwatch-agent.deb",
      "rm -f /tmp/amazon-cloudwatch-agent.deb",
      "amazon-cloudwatch-agent-ctl -a status || true",
    ]
  }

  # Java 17 (required by sdkmanager — Android SDK command-line tools are JVM-based)
  provisioner "shell" {
    inline = [
      "sudo apt-get install -y -qq openjdk-17-jre-headless",
      "java -version",
    ]
  }

  # Android SDK (pre-installed so CI skips android-actions/setup-android)
  provisioner "shell" {
    environment_vars = [
      "ANDROID_HOME=/opt/android-sdk",
    ]
    inline = [
      "sudo mkdir -p $ANDROID_HOME/cmdline-tools",
      "curl -fSL https://dl.google.com/android/repository/commandlinetools-linux-${var.android_cmdline_tools_build}_latest.zip -o /tmp/cmdline-tools.zip",
      "echo '${var.android_cmdline_tools_sha256}  /tmp/cmdline-tools.zip' | sha256sum -c",
      "sudo unzip -q /tmp/cmdline-tools.zip -d $ANDROID_HOME/cmdline-tools",
      "sudo mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest",
      "rm /tmp/cmdline-tools.zip",
      "yes | sudo $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null 2>&1",
      "sudo $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager 'platform-tools' 'platforms;android-${var.android_api_level}' 'build-tools;${var.android_build_tools_version}' 'ndk;${var.android_ndk_version}'",
      "sudo chmod -R a+rX $ANDROID_HOME",
      # Set ANDROID_HOME globally so login shells and Gradle pick it up
      "echo 'export ANDROID_HOME=/opt/android-sdk' | sudo tee /etc/profile.d/android-sdk.sh",
      "echo 'export PATH=$PATH:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools' | sudo tee -a /etc/profile.d/android-sdk.sh",
      # Also export to the runner process env so non-login GitHub Actions shells get ANDROID_HOME
      "if [ -d /opt/actions-runner ]; then echo 'ANDROID_HOME=/opt/android-sdk' | sudo tee -a /opt/actions-runner/.env; fi",
      "if [ -d /opt/actions-runner ]; then echo 'ANDROID_SDK_ROOT=/opt/android-sdk' | sudo tee -a /opt/actions-runner/.env; fi",
      "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --list_installed",
    ]
  }

  # Cleanup
  provisioner "shell" {
    inline = [
      "sudo apt-get clean",
      "sudo rm -rf /var/lib/apt/lists/*",
      "sudo rm -rf /tmp/*",
    ]
  }
}
