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
  default = "1.55.0"
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

  tags = {
    Name              = "legacy-sports-runner"
    Project           = "legacy-sports"
    ManagedBy         = "packer"
    NodeVersion       = var.node_version
    PnpmVersion       = var.pnpm_version
    RunnerVersion     = var.runner_version
    PlaywrightVersion = var.playwright_version
    TerraformVersion  = var.terraform_version
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
  provisioner "shell" {
    inline = [
      "sudo npx --yes playwright@${var.playwright_version} install-deps chromium",
      "export PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/playwright",
      "npx --yes playwright@${var.playwright_version} install chromium",
      "sudo npm install -g playwright@${var.playwright_version}",
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

  # Cleanup
  provisioner "shell" {
    inline = [
      "sudo apt-get clean",
      "sudo rm -rf /var/lib/apt/lists/*",
      "sudo rm -rf /tmp/*",
    ]
  }
}
