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
  default = "2.333.1"
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
  type        = string
  description = "Playwright version to install in the AMI. MUST match the resolved playwright-core version in pnpm-lock.yaml — CI enforces this in .github/workflows/runner-ami-drift-check.yml. The value here is also baked into the AMI name (legacy-sports-runner-pw<version>-<timestamp>) so terraform's name filter in github-runners.tf can select the correct AMI without an explicit AMI ID."
  default     = "1.59.1"
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
  type = string
  # Must cover apps/app's Expo SDK compileSdkVersion/targetSdkVersion. Expo SDK
  # 54 (apps/app/package.json "expo": "^54") requires android-36. The Android
  # Gradle Plugin cannot auto-install a missing platform at job time because
  # /opt/android-sdk is root-owned + read-only to the runner user (LS-5032).
  default = "36"
}

variable "android_build_tools_version" {
  type = string
  # Primary build-tools version — used for the PATH export, the AMI tag, the
  # /etc/legacy-sports-runner-version embed, and the verify-env-contract
  # landmark. Forward-looking 36.0.0.
  default = "36.0.0"
}

variable "android_build_tools_version_compat" {
  type = string
  # Expo SDK 54 / AGP pins buildToolsVersion = 35.0.0 even though
  # compileSdkVersion = 36 (the two are independent). LS-5032 swapped 35.0.0
  # out for 36.0.0 and broke the Android build — AGP requested build-tools
  # 35.0.0 and couldn't self-install into the read-only /opt/android-sdk
  # (LS-5033). We bake BOTH: 35.0.0 (what AGP pins today) and 36.0.0
  # (forward-looking). Drop this compat var once Expo's AGP pin moves to 36.0.0.
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

variable "gradle_version" {
  type        = string
  description = "Gradle distribution version pre-baked into ~/.gradle/wrapper/dists/. MUST match the version pinned in apps/app/android/gradle/wrapper/gradle-wrapper.properties — if it drifts, the wrapper will redownload at build time (cache miss, ~150MB). Bump together with the gradle-wrapper.properties pin."
  default     = "8.14.3"
}

variable "android_cmdline_tools_sha256" {
  type        = string
  description = "SHA-256 of commandlinetools-linux-<build>_latest.zip. Verify at https://developer.android.com/studio#command-tools"
  # SHA-256 for commandlinetools-linux-14742923_latest.zip
  default = "04453066b540409d975c676d781da1477479dde3761310f1a7eb92a1dfb15af7"
}

variable "pnpm_sha256" {
  type        = string
  description = "SHA-256 of pnpm-linux-x64 release binary for the matching pnpm_version. The pnpm project does NOT ship per-asset .sha256 companion files on GitHub releases (LS-4958), so we have to pin the hash here and bump it together with pnpm_version. Recompute with: curl -sL https://github.com/pnpm/pnpm/releases/download/v<version>/pnpm-linux-x64 | sha256sum"
  # SHA-256 for pnpm-linux-x64 at v9.12.1
  default = "9be00ae5ae8fad0e0b6f49cf0a09795ddcc3c202e7313a7bdd1273f360902304"
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

variable "ssh_source_cidr" {
  type        = string
  description = "CIDR block allowed to SSH into the Packer build instance via the auto-created temporary security group. The build runs inside the legacy-sports VPC and Packer connects via private IP, so this is the VPC CIDR rather than 0.0.0.0/0 (LS-4920)."
  default     = "10.0.0.0/16"
}

# NOTE: The AMI name must begin with "legacy-sports-runner-pw<playwright_version>-"
# because terraform/github-runners.tf filters by this exact prefix to select the AMI
# without an explicit AMI ID. Changing this prefix requires a coordinated update to
# the filter block in github-runners.tf and the drift-check workflow.
#
# Rebuild history (most recent first):
# - LS-4957 — carry the LS-4949 pnpm fix (standalone binary, no corepack)
#   into a freshly baked AMI. LS-4949 itself only changed this Packer file;
#   without a rebuild, runners kept booting from the pre-LS-4949 AMI with
#   pnpm 11.3.0 (corepack drift). See `.agents/skills/infrastructure/
#   references/ami-build.md` for the carrier-PR + rebuild-runner-ami label
#   process this PR exercises.
source "amazon-ebs" "runner" {
  ami_name      = "legacy-sports-runner-pw${var.playwright_version}-{{timestamp}}"
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

  # SSH from the self-hosted runner (which runs inside this VPC) to the build
  # instance's private IP, not the public IP. The runner's egress SG only allows
  # port 22 to the VPC CIDR — talking to the public IP would force an IGW hairpin
  # and trip "no public SSH" egress rules (LS-4920). The instance keeps its public
  # IP for outbound provisioning (apt, npm, etc.).
  ssh_interface                         = "private_ip"
  temporary_security_group_source_cidrs = [var.ssh_source_cidr]

  # Tag the temporary EC2 build instance and its volumes with a deterministic
  # Name prefix so the runner-ami-builder IAM role's tag-scoped
  # ec2:TerminateInstances condition (Name LIKE "Packer Builder*") matches.
  # The amazon-ebs builder does NOT apply a default Name tag when run_tags is
  # unset, which previously caused failed builds to leak EC2 instances and
  # security groups (LS-4921) because cleanup TerminateInstances was denied.
  # See terraform/runners/runner-ami-builder-iam.tf for the matching policy.
  run_tags = {
    Name      = "Packer Builder - legacy-sports-runner"
    Project   = "legacy-sports"
    ManagedBy = "packer"
  }
  run_volume_tags = {
    Name      = "Packer Builder - legacy-sports-runner"
    Project   = "legacy-sports"
    ManagedBy = "packer"
  }

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
    GradleVersion     = var.gradle_version
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

  # Node.js + pnpm (LS-4949)
  #
  # pnpm is installed as a standalone release binary, NOT via corepack. The
  # previous flow used `corepack prepare pnpm@${var.pnpm_version} --activate`
  # which left a corepack shim at /usr/bin/pnpm. That shim resolves the actual
  # pnpm version from corepack's lastKnownGood state, which proved drift-prone
  # on the live AMI (LS-4947 D-4 observed pnpm 11.3.0 instead of the pinned
  # 9.12.1). Corepack's COREPACK_DEFAULT_TO_LATEST behavior, combined with
  # corepack upgrades pulled in by node apt updates, can silently bump the
  # resolved version, and there is no system-wide corepack config file we can
  # drop to lock it.
  #
  # Installing pnpm as a real binary at /usr/local/bin/pnpm bypasses corepack
  # entirely. /usr/local/bin precedes /usr/bin on the default PATH the actions
  # runner inherits, so this binary wins even if some later step (apt upgrade
  # of nodejs, a workflow's `corepack enable`) re-creates a shim at
  # /usr/bin/pnpm. The verify-env-contract post-provisioner below asserts
  # `pnpm --version` equals ${var.pnpm_version} on a clean PATH so any future
  # regression here fails the build instead of leaking into the live fleet.
  provisioner "shell" {
    inline = [
      "curl -fsSL https://deb.nodesource.com/setup_${var.node_version}.x | sudo bash -",
      "sudo apt-get install -y -qq nodejs",
      "node --version",
      "curl -fsSL https://github.com/pnpm/pnpm/releases/download/v${var.pnpm_version}/pnpm-linux-x64 -o /tmp/pnpm",
      # Verify the downloaded binary against a hash pinned in var.pnpm_sha256.
      # The pnpm project does NOT ship per-asset .sha256 companion files on
      # GitHub releases (this was the LS-4958 root cause — the previous code
      # tried to curl pnpm-linux-x64.sha256 and got 404, breaking every AMI
      # build). Bump var.pnpm_sha256 together with var.pnpm_version on any
      # future pnpm update.
      "echo '${var.pnpm_sha256}  /tmp/pnpm' | sha256sum -c -",
      "sudo install -m 0755 -o root -g root /tmp/pnpm /usr/local/bin/pnpm",
      "rm /tmp/pnpm",
      "command -v pnpm",
      "pnpm --version",
    ]
  }

  # Playwright: system dependencies + Chromium browser binary + global CLI
  #
  # IMPORTANT: playwright_version must be kept in sync with the @playwright/test
  # version declared in the root package.json. CI enforces this via the
  # runner-ami-drift-check workflow — any drift between pnpm-lock.yaml's
  # resolved playwright-core version and this variable's default fails CI.
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
      # Explicitly install chromium-headless-shell. `playwright install chromium`
      # is supposed to include this variant but in 1.58.2+ the chromium_headless_shell-*
      # directory was intermittently missing from rebuilt AMIs, forcing CI to fall
      # back to a runtime install. This line is belt-and-suspenders: cheap insurance
      # against future Playwright releases regressing the bundled behavior. (LS-2429)
      "sudo env PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers npx --yes playwright@${var.playwright_version} install chromium-headless-shell",
      "sudo chmod -R a+rX /opt/playwright-browsers",
      # Debug: dump the installed browser directories into the Packer build log
      # so future AMI builds have verifiable evidence that both chromium-<rev>
      # and chromium_headless_shell-<rev> directories exist. If this regresses
      # again, the Packer log is the first place to look.
      "ls -la /opt/playwright-browsers/",
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
      # Pre-create the runner install dir so subsequent provisioners can seed
      # /opt/actions-runner/.env with system-wide env vars (JAVA_HOME, ANDROID_HOME, …).
      # The terraform-aws-github-runner module installs the runner agent into this
      # directory at boot via user-data; the runner release tarball does NOT ship a
      # .env file, so our pre-baked .env is preserved and read by the runner on
      # startup (it is the canonical mechanism for injecting env into job steps).
      # Without this, the .env writes below get silently skipped (LS-4936).
      # AMI rebuild trigger: LS-4942 — refresh live runners to pick up this fix.
      "sudo mkdir -p /opt/actions-runner",
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

  # Java 17 (required by sdkmanager — Android SDK command-line tools are JVM-based).
  # The JDK (not JRE) is required so Gradle's Android build can locate javac/aapt2
  # toolchain bits; baking JAVA_HOME into the runner env lets us skip
  # actions/setup-java on self-hosted runners and saves ~60s per Android build.
  provisioner "shell" {
    inline = [
      "sudo apt-get install -y -qq openjdk-17-jdk-headless",
      "java -version",
      # JAVA_HOME lives at a stable path on Ubuntu 22.04 for the openjdk-17 package.
      "echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' | sudo tee /etc/profile.d/java.sh",
      "echo 'export PATH=$JAVA_HOME/bin:$PATH' | sudo tee -a /etc/profile.d/java.sh",
      # Also export to the runner process env so non-login GitHub Actions shells get JAVA_HOME.
      # /opt/actions-runner is pre-created in the runner-deps provisioner above.
      "echo 'JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' | sudo tee -a /opt/actions-runner/.env",
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
      # Install BOTH build-tools versions: the compat one Expo/AGP pins today
      # (35.0.0) and the forward-looking primary (36.0.0). See the
      # android_build_tools_version_compat variable comment (LS-5033).
      "sudo $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager 'platform-tools' 'platforms;android-${var.android_api_level}' 'build-tools;${var.android_build_tools_version}' 'build-tools;${var.android_build_tools_version_compat}' 'ndk;${var.android_ndk_version}'",
      "sudo chmod -R a+rX $ANDROID_HOME",
      # Set ANDROID_HOME globally so login shells and Gradle pick it up
      "echo 'export ANDROID_HOME=/opt/android-sdk' | sudo tee /etc/profile.d/android-sdk.sh",
      "echo 'export PATH=$PATH:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/build-tools/${var.android_build_tools_version}' | sudo tee -a /etc/profile.d/android-sdk.sh",
      # Also export to the runner process env so non-login GitHub Actions shells get ANDROID_HOME.
      # /opt/actions-runner is pre-created in the runner-deps provisioner above.
      "echo 'ANDROID_HOME=/opt/android-sdk' | sudo tee -a /opt/actions-runner/.env",
      "echo 'ANDROID_SDK_ROOT=/opt/android-sdk' | sudo tee -a /opt/actions-runner/.env",
      "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --list_installed",
    ]
  }

  # Gradle wrapper distribution pre-bake (LS-4933 added; LS-4934 verified the AMI rebuild + Android job confirms no Gradle download)
  #
  # Android builds use the wrapper pinned in apps/app/android/gradle/wrapper/gradle-wrapper.properties
  # (currently gradle-${var.gradle_version}-bin.zip, ~150MB). On a fresh runner the wrapper
  # downloads it on first build — pre-extracting it here saves that round-trip.
  #
  # Layout the wrapper expects (PathAssembler.getHash in the gradle wrapper sources):
  #   $GRADLE_USER_HOME/wrapper/dists/gradle-<version>-bin/<hash>/
  #     gradle-<version>-bin.zip
  #     gradle-<version>-bin.zip.ok      (marker — wrapper trusts the extracted dir when present)
  #     gradle-<version>/                (extracted distribution)
  # where <hash> = BigInteger(1, MD5(distributionUrl)).toString(36).
  #
  # The GitHub Actions runner runs as the `ubuntu` user (HOME=/home/ubuntu),
  # which makes $GRADLE_USER_HOME default to /home/ubuntu/.gradle. We write
  # there directly so `gradlew` finds the dist without a download.
  provisioner "shell" {
    environment_vars = [
      "GRADLE_VERSION=${var.gradle_version}",
    ]
    inline = [
      <<-EOT
        set -e
        GRADLE_URL="https://services.gradle.org/distributions/gradle-$${GRADLE_VERSION}-bin.zip"
        HASH=$(python3 - <<'PY'
        import hashlib, os
        url = "https://services.gradle.org/distributions/gradle-" + os.environ["GRADLE_VERSION"] + "-bin.zip"
        n = int(hashlib.md5(url.encode()).hexdigest(), 16)
        s = ""
        digits = "0123456789abcdefghijklmnopqrstuvwxyz"
        while n:
            s = digits[n % 36] + s
            n //= 36
        print(s or "0")
        PY
        )
        DIST_DIR="/home/ubuntu/.gradle/wrapper/dists/gradle-$${GRADLE_VERSION}-bin/$${HASH}"
        echo "Pre-baking Gradle $${GRADLE_VERSION} wrapper dist at $${DIST_DIR}"
        sudo install -d -o ubuntu -g ubuntu -m 0755 "/home/ubuntu/.gradle"
        sudo install -d -o ubuntu -g ubuntu -m 0755 "/home/ubuntu/.gradle/wrapper"
        sudo install -d -o ubuntu -g ubuntu -m 0755 "/home/ubuntu/.gradle/wrapper/dists"
        sudo -u ubuntu mkdir -p "$${DIST_DIR}"
        sudo -u ubuntu curl -fSL "$${GRADLE_URL}" -o "$${DIST_DIR}/gradle-$${GRADLE_VERSION}-bin.zip"
        sudo -u ubuntu unzip -q "$${DIST_DIR}/gradle-$${GRADLE_VERSION}-bin.zip" -d "$${DIST_DIR}"
        sudo -u ubuntu touch "$${DIST_DIR}/gradle-$${GRADLE_VERSION}-bin.zip.ok"
        ls -la "$${DIST_DIR}"
      EOT
    ]
  }

  # Embed AMI tag values into an on-disk contract file (LS-4947 D-6).
  #
  # The AMI's tags advertise a "contract" (NodeVersion, PnpmVersion, etc.),
  # but the runner instance role does not have ec2:DescribeImages, so a
  # job-time drift check cannot read its own tags. Writing the same K=V pairs
  # to /etc/legacy-sports-runner-version makes the contract self-contained:
  # the runner reads its own version file with no IAM dependency, and any
  # future drift-detection job can `source` it directly.
  #
  # This file is the single source of truth that the verify-env-contract
  # post-provisioner below asserts against.
  #
  # `inline_shebang = "/bin/bash -e"` is required because the embedded
  # heredoc uses `set -euo pipefail` (bash-only — dash, Ubuntu's default
  # /bin/sh, rejects `-o pipefail` with "Illegal option"). Packer's default
  # inline shebang is /bin/sh -e, which is dash on Ubuntu.
  provisioner "shell" {
    inline_shebang = "/bin/bash -e"
    environment_vars = [
      "NODE_VERSION=${var.node_version}",
      "PNPM_VERSION=${var.pnpm_version}",
      "RUNNER_VERSION=${var.runner_version}",
      "PLAYWRIGHT_VERSION=${var.playwright_version}",
      "TERRAFORM_VERSION=${var.terraform_version}",
      "ANDROID_API_LEVEL=${var.android_api_level}",
      "ANDROID_BUILD_TOOLS_VERSION=${var.android_build_tools_version}",
      "ANDROID_NDK_VERSION=${var.android_ndk_version}",
      "GRADLE_VERSION=${var.gradle_version}",
      "DOCKER_VERSION=${var.docker_version}",
      "SERVE_VERSION=${var.serve_version}",
      "SNYK_VERSION=${var.snyk_version}",
    ]
    inline = [
      <<-EOT
        set -euo pipefail
        sudo tee /etc/legacy-sports-runner-version > /dev/null <<EOF
        # Auto-generated by Packer — see terraform/runners/packer/runner-ami.pkr.hcl
        # This file mirrors the AMI tags so the runner can read its own version
        # contract without ec2:DescribeImages. Consumed by:
        #   - .github/workflows/runner-env-dump.yml (diagnostic)
        #   - the verify-env-contract Packer post-provisioner (LS-4947)
        NodeVersion=$${NODE_VERSION}
        PnpmVersion=$${PNPM_VERSION}
        RunnerVersion=$${RUNNER_VERSION}
        PlaywrightVersion=$${PLAYWRIGHT_VERSION}
        TerraformVersion=$${TERRAFORM_VERSION}
        AndroidApiLevel=$${ANDROID_API_LEVEL}
        AndroidBuildToolsVersion=$${ANDROID_BUILD_TOOLS_VERSION}
        AndroidNdkVersion=$${ANDROID_NDK_VERSION}
        GradleVersion=$${GRADLE_VERSION}
        DockerVersion=$${DOCKER_VERSION}
        ServeVersion=$${SERVE_VERSION}
        SnykVersion=$${SNYK_VERSION}
        EOF
        sudo chmod 644 /etc/legacy-sports-runner-version
        cat /etc/legacy-sports-runner-version
      EOT
    ]
  }

  # Verify env contract (LS-4947 Phase 2).
  #
  # This is the defensive assertion against the LS-4902 / LS-4934 / LS-4936
  # class of bugs — "Packer writes env to a surface that doesn't reach jobs."
  # The Packer build instance has a full /etc/profile.d/ + /etc/environment +
  # /opt/actions-runner/.env environment available, so a naive `which terraform`
  # at build time always passes even when the same tool is unreachable from a
  # live runner. To catch that, we simulate the runner-agent's job-step shell:
  #
  #   - No /etc/profile sourcing (the runner systemd unit does not log in)
  #   - No /etc/environment via PAM (the unit has no PAMName=)
  #   - PATH reset to the system default the actions runner agent inherits
  #   - /opt/actions-runner/.env contents NOT pre-loaded (the agent's
  #     config.sh clobbers our writes at instance boot — see drift D-2 in
  #     docs/runners/ami-env-drift.md)
  #
  # Under that hostile context we then assert:
  #
  #   1. Each tool declared in /etc/legacy-sports-runner-version resolves on
  #      PATH and its --version output matches the declared version.
  #   2. The AMI tag values (set on the source block) match the same
  #      /etc/legacy-sports-runner-version values — drift between the tag
  #      block and the variable defaults fails the build at this step instead
  #      of being discovered weeks later.
  #
  # Failing this check fails the Packer build, which means a broken AMI
  # never reaches the runner fleet. New drift cases extend the table below;
  # this is the single source of truth for the build-time contract.
  #
  # `inline_shebang = "/bin/bash -e"` — same reason as the embed-runner-version
  # provisioner above: the heredoc uses `set -euo pipefail` and bash arrays/
  # functions, neither of which work under dash.
  provisioner "shell" {
    inline_shebang = "/bin/bash -e"
    environment_vars = [
      "EXPECT_NODE_MAJOR=${var.node_version}",
      "EXPECT_PNPM=${var.pnpm_version}",
      "EXPECT_PLAYWRIGHT=${var.playwright_version}",
      "EXPECT_TERRAFORM=${var.terraform_version}",
      "EXPECT_SNYK=${var.snyk_version}",
      "EXPECT_DOCKER=${var.docker_version}",
      "EXPECT_GRADLE=${var.gradle_version}",
      # AMI tag block values (kept in sync manually — the assertion catches drift)
      "TAG_NODE_VERSION=${var.node_version}",
      "TAG_PNPM_VERSION=${var.pnpm_version}",
      "TAG_RUNNER_VERSION=${var.runner_version}",
      "TAG_PLAYWRIGHT_VERSION=${var.playwright_version}",
      "TAG_TERRAFORM_VERSION=${var.terraform_version}",
      "TAG_ANDROID_API_LEVEL=${var.android_api_level}",
      "TAG_ANDROID_NDK_VERSION=${var.android_ndk_version}",
      "TAG_GRADLE_VERSION=${var.gradle_version}",
    ]
    inline = [
      <<-EOT
        set -euo pipefail

        echo "=== verify-env-contract: simulating runner-agent shell context ==="

        # Reset to the minimal PATH the actions-runner systemd service inherits.
        # This deliberately excludes everything /etc/profile.d/ would add
        # (java bin, android tooling dirs) — that's the whole point.
        export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"

        FAIL=0
        fail() { echo "DRIFT: $*" >&2; FAIL=1; }
        ok()   { echo "OK   : $*"; }

        # ----- (1) Tool version assertions under the simulated context -----

        check_version() {
          local label="$1" cmd="$2" expected="$3" regex="$4"
          local actual
          if ! command -v "$cmd" >/dev/null 2>&1; then
            fail "$label: '$cmd' not on PATH for job-step shell"
            return
          fi
          actual=$($cmd --version 2>&1 | head -n 1 || true)
          if echo "$actual" | grep -qE "$regex"; then
            ok "$label: $cmd -> $actual"
          else
            fail "$label: $cmd -> '$actual' does not match expected '$expected' (regex: $regex)"
          fi
        }

        # Node major version only — the AMI tag advertises the major (`22`).
        # Regexes are anchored where possible so a substring match like "1.59.1"
        # appearing inside an unrelated field (e.g. a build hash) doesn't
        # accidentally pass the check.
        # Note: there is deliberately NO check_version call for `gradle` here —
        # gradle is wrapper-only by design (see `ami-env-drift.md` and the
        # file-system landmark check below for /home/ubuntu/.gradle/wrapper/dists/
        # gradle-<version>-bin). Adding `check_version "GradleVersion" gradle ...`
        # would fail because the AMI deliberately does not install a system
        # gradle — only the wrapper-managed dist.
        check_version "NodeVersion"       node       "$${EXPECT_NODE_MAJOR}"  "^v$${EXPECT_NODE_MAJOR}\\."
        check_version "PnpmVersion"       pnpm       "$${EXPECT_PNPM}"        "^$${EXPECT_PNPM}$"
        check_version "PlaywrightVersion" playwright "$${EXPECT_PLAYWRIGHT}"  "^Version $${EXPECT_PLAYWRIGHT}$"
        check_version "TerraformVersion"  terraform  "$${EXPECT_TERRAFORM}"   "^Terraform v$${EXPECT_TERRAFORM}$"
        check_version "SnykVersion"       snyk       "$${EXPECT_SNYK}"        "^$${EXPECT_SNYK}$"
        check_version "DockerVersion"     docker     "$${EXPECT_DOCKER}"      "^Docker version $${EXPECT_DOCKER},"

        # ----- (2) AMI-tag <-> runner-version-file consistency -----
        #
        # The source block's tag map and /etc/legacy-sports-runner-version are
        # set from the same Packer variables, so they should always agree.
        # This check guards against a future edit that touches only one side.
        check_tag() {
          local key="$1" expected="$2"
          local actual
          actual=$(grep "^$${key}=" /etc/legacy-sports-runner-version | cut -d= -f2-)
          if [[ "$actual" == "$expected" ]]; then
            ok "AMI tag $key=$expected matches runner-version file"
          else
            fail "AMI tag $key=$expected != /etc/legacy-sports-runner-version $${key}=$actual"
          fi
        }
        check_tag NodeVersion       "$${TAG_NODE_VERSION}"
        check_tag PnpmVersion       "$${TAG_PNPM_VERSION}"
        check_tag RunnerVersion     "$${TAG_RUNNER_VERSION}"
        check_tag PlaywrightVersion "$${TAG_PLAYWRIGHT_VERSION}"
        check_tag TerraformVersion  "$${TAG_TERRAFORM_VERSION}"
        check_tag AndroidApiLevel   "$${TAG_ANDROID_API_LEVEL}"
        check_tag AndroidNdkVersion "$${TAG_ANDROID_NDK_VERSION}"
        check_tag GradleVersion     "$${TAG_GRADLE_VERSION}"

        # ----- (3) Pre-baked file-system landmarks -----
        for path in \
          /opt/playwright-browsers \
          /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager \
          /opt/android-sdk/platform-tools/adb \
          /opt/actions-runner \
          /home/ubuntu/.gradle/wrapper/dists/gradle-$${EXPECT_GRADLE}-bin \
          /usr/lib/jvm/java-17-openjdk-amd64 \
          /etc/legacy-sports-runner-version; do
          if [[ -e "$path" ]]; then
            ok "landmark present: $path"
          else
            fail "landmark MISSING: $path"
          fi
        done

        if [[ "$FAIL" -ne 0 ]]; then
          echo ""
          echo "verify-env-contract failed — the AMI does not satisfy the"
          echo "runner-agent shell-context contract. See docs/runners/ami-env-drift.md"
          echo "for the inventory and the known drift classes (D-1..D-6)."
          exit 1
        fi

        echo ""
        echo "=== verify-env-contract: all checks passed ==="
      EOT
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
