# Self-Hosted Runner AMI Build

## Overview

The self-hosted GitHub Actions runners use a pre-baked Ubuntu 22.04 AMI built with Packer. Pre-baking reduces runner boot time from ~5-7 minutes to ~30 seconds.

### Baked-in tools

| Tool                  | Version                                       | Purpose                                             |
| --------------------- | --------------------------------------------- | --------------------------------------------------- |
| Node.js               | 22                                            | JS runtime                                          |
| pnpm                  | 9.12.1                                        | Package manager                                     |
| Playwright + Chromium | 1.58.2                                        | E2E tests (installed at `/opt/playwright-browsers`) |
| serve                 | 14.2.4                                        | Static file server for Playwright shards            |
| Terraform             | 1.14.0                                        | Infrastructure-as-code                              |
| uv                    | latest                                        | Python package manager (skill linting)              |
| Snyk CLI              | 1.1293.1                                      | Security scanning                                   |
| Docker Engine         | 28.1.1                                        | Container-based Actions (e.g. osv-scanner-action)   |
| GitHub CLI (`gh`)     | latest stable                                 | PR operations, artifact management                  |
| AWS CLI v2            | latest                                        | AWS operations                                      |
| Java 17               | openjdk-17-jre-headless                       | Android SDK tooling (sdkmanager is JVM-based)       |
| Android SDK           | API 35, build-tools 35.0.0, NDK 27.1.12297006 | Mobile CI                                           |

> Some tool versions are pinned in `terraform/runners/packer/runner-ami.pkr.hcl`; entries marked `latest` or `latest stable` are installed at whatever version is current at build time, so the AMI can drift across rebuilds. Keep `playwright_version` in sync with the **resolved** `@playwright/test` version used by the repo — check the lockfile rather than `package.json` if it uses a caret range. A mismatch causes CI to re-download browsers on every run.
>
> `Amazon CloudWatch Agent` is **not** baked into the AMI by the Packer template. When `enable_cloudwatch_agent = true` is set in `github-runners.tf`, the agent is installed during instance boot by the runner module's userdata. Do not list it as a baked-in tool.

## When to Rebuild

Rebuild the AMI when:

- The Packer template changes (`terraform/runners/packer/runner-ami.pkr.hcl`) — e.g., new system packages, version bumps
- A CI job fails due to a missing tool on the runner (add it to the Packer template first, then rebuild)
- Periodic security updates (Ubuntu base image patches)

You do **not** need to rebuild when:

- Application code changes (runners clone fresh each job)
- Terraform infrastructure changes (applied separately via `make runner-apply`)
- GitHub Actions workflow changes

## Prerequisites

1. **AWS SSO authenticated**: check with `aws_sso_status()` (MCP) or `aws sts get-caller-identity` — only run `aws sso login` if credentials are expired
2. **Packer installed and accessible** — see [Windows note](#windows-packer-location) below
3. **VPC and subnet IDs**: the build instance needs a public subnet with an Internet Gateway route

### Windows Packer Location

If Packer is not in the system PATH, find its location first:

```powershell
# PowerShell: find where winget installed packer
Get-Command packer -ErrorAction SilentlyContinue
# or check common winget install location:
where packer
```

Packer installed via `winget` typically lands under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\` or a custom user `bin\` directory. Add its directory to PATH for the session before running `make ami-build`:

```bash
# Example — replace <packer-dir> with the actual directory found above
export PATH="/c/Users/<your-username>/<packer-dir>:$PATH"
packer --version   # verify
```

Or invoke Packer directly via the full path (bypasses `make ami-build`):

```bash
cd terraform/packer
/c/Users/<your-username>/<packer-dir>/packer init runner-ami.pkr.hcl
/c/Users/<your-username>/<packer-dir>/packer build \
  -var "vpc_id=vpc-0e7e5def598aa06ff" \
  -var "subnet_id=subnet-0addb75570c9fc76e" \
  runner-ami.pkr.hcl
```

> LS-2337 tracks adding a CI dispatch workflow that eliminates the local Packer dependency entirely.

### Finding VPC/Subnet IDs

```bash
# VPC
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=*legacy-sports*" \
  --query "Vpcs[0].VpcId" --output text

# First public subnet
aws ec2 describe-subnets --filters "Name=vpc-id,Values=<VPC_ID>" "Name=tag:Name,Values=*public*" \
  --query "Subnets[0].SubnetId" --output text
```

Current values (us-east-1):

- VPC: `vpc-0e7e5def598aa06ff`
- Subnet: `subnet-0addb75570c9fc76e` (us-east-1b, public)

## Build Steps

### Using Make (recommended)

```bash
# Add packer to PATH first (Windows — see above)
export PATH="/c/Users/<your-username>/<packer-dir>:$PATH"

make ami-build VPC_ID=vpc-0e7e5def598aa06ff SUBNET_ID=subnet-0addb75570c9fc76e
```

### Manual

```bash
cd terraform/packer
packer init runner-ami.pkr.hcl
packer build \
  -var "vpc_id=vpc-0e7e5def598aa06ff" \
  -var "subnet_id=subnet-0addb75570c9fc76e" \
  runner-ami.pkr.hcl
```

Build takes ~10-15 minutes (Android NDK alone is ~8 GB uncompressed). Packer will:

1. Launch a temporary `c7a.xlarge` EC2 instance with a 60 GB root volume
2. Run provisioners (install all tools listed above)
3. Create an AMI named `legacy-sports-runner-<timestamp>`
4. Terminate the build instance

### Optional variables

| Variable             | Default    | Description                                   |
| -------------------- | ---------- | --------------------------------------------- |
| `region`             | us-east-1  | AWS region                                    |
| `node_version`       | 22         | Node.js major version                         |
| `pnpm_version`       | 9.12.1     | pnpm version                                  |
| `runner_version`     | 2.333.0    | GitHub Actions runner version                 |
| `playwright_version` | 1.58.2     | Must match `@playwright/test` in package.json |
| `instance_type`      | c7a.xlarge | Build instance type                           |

## Post-Build

### Verify the new AMI

```bash
make ami-list
# or:
aws ec2 describe-images --owners self \
  --filters "Name=name,Values=legacy-sports-runner-*" \
  --query "Images | sort_by(@, &CreationDate) | [-1].{Name:Name,ImageId:ImageId,Created:CreationDate}" \
  --output table
```

### Roll out to runners

The ASG uses a name-based AMI filter (`legacy-sports-runner-*`, most recent) defined in `terraform/runners/github-runners.tf`. **No `terraform apply` is needed** — new runner instances automatically pick up the latest AMI.

Runners are configured as non-ephemeral via `enable_ephemeral_runners = false` in `terraform/runners/github-runners.tf` — they stay online across multiple jobs rather than terminating after each one. To force all runners onto the new AMI:

1. **Wait for natural turnover** — the scale-down Lambda terminates idle runners; new instances launched by the next job trigger will use the new AMI.
2. **Force immediate replacement** (optional) — terminate running instances via AWS Console or CLI. The ASG will launch replacements with the new AMI on the next `workflow_job` webhook event.

### Verify end-to-end

Trigger a CI workflow that runs on self-hosted runners (e.g., `CI Pipeline`) and confirm it completes. For Playwright specifically, the `e2e-testing` action logs `✅ Chromium already installed at /opt/playwright-browsers (AMI cache)` when the baked-in browser is detected correctly.

## Cleanup

Old AMIs accumulate over time. Periodically deregister stale AMIs:

```bash
# List all runner AMIs
make ami-list

# Deregister an old AMI (keep at least the 2 most recent)
aws ec2 deregister-image --image-id ami-0xxxxxxxxxxxx
```

## Troubleshooting

| Issue                                     | Cause                                                                                                       | Fix                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VPCIdNotSpecified`                       | Missing VPC_ID variable                                                                                     | Pass `VPC_ID=vpc-xxx` to make target                                                                                                                                                    |
| `AuthFailure` / `SSOProviderInvalidToken` | AWS SSO expired                                                                                             | Run `aws sso login`                                                                                                                                                                     |
| `packer: command not found`               | Packer not in PATH (Windows)                                                                                | Find packer with `where packer` or `Get-Command packer`, then `export PATH="/c/Users/<your-username>/<packer-dir>:$PATH"` — see [Windows Packer Location](#windows-packer-location)     |
| `Timeout waiting for SSH`                 | Subnet has no IGW route                                                                                     | Use a public subnet                                                                                                                                                                     |
| Build hangs at provisioner                | Package mirror slow                                                                                         | Retry — transient                                                                                                                                                                       |
| New AMI not used by runners               | ASG hasn't launched new instances                                                                           | Wait for next job or terminate existing instances                                                                                                                                       |
| CloudWatch agent errors at boot           | `enable_cloudwatch_agent = true`, but the runner bootstrap path is not installing `amazon-cloudwatch-agent` | The agent is installed at boot via the runner module's userdata, not by the Packer template. Check the runner module's bootstrap/userdata configuration rather than rebuilding the AMI. |
