# Self-Hosted Runner AMI Build

## Overview

The self-hosted GitHub Actions runners use a pre-baked Ubuntu 22.04 AMI built with Packer. The AMI includes Node.js, pnpm, Playwright system dependencies, GitHub Actions runner dependencies, and AWS CLI v2. Pre-baking these into the AMI reduces runner boot time from ~5-7 minutes to ~30 seconds.

## When to Rebuild

Rebuild the AMI when:

- The Packer template changes (`terraform/packer/runner-ami.pkr.hcl`) — e.g., new system packages, version bumps
- A CI job fails due to missing tools on the runner (the tool needs to be added to the Packer template first)
- Periodic security updates (Ubuntu base image patches)

You do **not** need to rebuild when:

- Application code changes (runners clone fresh each job)
- Terraform infrastructure changes (those are applied separately)
- GitHub Actions workflow changes

## Prerequisites

1. **AWS SSO authenticated**: `aws sso login` (check with `aws sts get-caller-identity`)
2. **Packer installed**: `packer --version` (install via `brew install packer` or [hashicorp.com](https://developer.hashicorp.com/packer/install))
3. **VPC and subnet IDs**: the build instance needs a public subnet with an Internet Gateway route

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

Build takes ~5-10 minutes. Packer will:

1. Launch a temporary `c7a.xlarge` EC2 instance
2. Run provisioners (install packages, Node.js, pnpm, Playwright deps, runner deps, AWS CLI)
3. Create an AMI named `legacy-sports-runner-<timestamp>`
4. Terminate the build instance

### Optional variables

| Variable         | Default    | Description                   |
| ---------------- | ---------- | ----------------------------- |
| `region`         | us-east-1  | AWS region                    |
| `node_version`   | 22         | Node.js major version         |
| `pnpm_version`   | 9.12.1     | pnpm version                  |
| `runner_version` | 2.333.0    | GitHub Actions runner version |
| `instance_type`  | c7a.xlarge | Build instance type           |

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

The ASG uses a name-based AMI filter (`legacy-sports-runner-*`, most recent) defined in `terraform/github-runners.tf`. **No `terraform apply` is needed** — new runner instances automatically use the latest AMI.

To force replacement of existing instances:

1. **Wait for natural turnover** — ephemeral runners terminate after each job, so new instances will use the new AMI within minutes of the next CI run.
2. **Force immediate replacement** (optional) — terminate running instances via AWS Console or CLI. The ASG will launch replacements with the new AMI on the next workflow trigger.

### Verify end-to-end

Trigger a CI workflow that runs on self-hosted runners (e.g., `Upload Lambdas`) and confirm it completes successfully.

## Cleanup

Old AMIs accumulate over time. Periodically deregister stale AMIs:

```bash
# List all runner AMIs
make ami-list

# Deregister an old AMI (keep at least the 2 most recent)
aws ec2 deregister-image --image-id ami-0xxxxxxxxxxxx
```

## Troubleshooting

| Issue                       | Cause                             | Fix                                               |
| --------------------------- | --------------------------------- | ------------------------------------------------- |
| `VPCIdNotSpecified`         | Missing VPC_ID variable           | Pass `VPC_ID=vpc-xxx` to make target              |
| `AuthFailure`               | AWS SSO expired                   | Run `aws sso login`                               |
| `Timeout waiting for SSH`   | Subnet has no IGW route           | Use a public subnet                               |
| Build hangs at provisioner  | Package mirror slow               | Retry — transient                                 |
| New AMI not used by runners | ASG hasn't launched new instances | Wait for next job or terminate existing instances |
