---
name: terraform-local-apply
description: 'Run terraform plan/apply locally against the AWS dev environment. Load before any terraform operation — plan, apply, destroy, import, state. Covers the GitHub Runners safety model (infra.auto.tfvars sets enable_github_runners=false), AWS SSO credential checks, state lock clearance, and the correct command sequence for local applies.'
---

# Skill: Terraform Local Apply

## Overview

Run Terraform against the AWS dev environment from a local workstation or worktree.

## GitHub Runners Safety Model

`terraform/infra.auto.tfvars` is **committed to the repo** and explicitly sets:

```hcl
enable_github_runners = false
```

This is an intentional safety guard. Runner infrastructure was provisioned once via a targeted apply and is **not** continuously managed through the Terraform apply loop. Runners are self-managing — a GitHub `workflow_job` webhook triggers a Lambda that scales the EC2 Spot fleet up, and a cron Lambda scales it down. No Terraform apply is needed for day-to-day runner scaling.

**CI does NOT override this flag.** The `lambda-terraform-apply.yml` workflow reads `infra.auto.tfvars` directly and only validates runner secrets when the value is `true`. Runner resources (SGs, ASGs, Lambdas) are intentionally outside the normal plan/apply loop.

**What this means for local and CI applies:**

- A plain `terraform plan` / `terraform apply` (local or CI) is safe — runner resources are never in the diff
- To see a plan that _includes_ runner resources, add `-var="enable_github_runners=true"` — but **do not apply without `-target`** (see Runner Config Changes below)
- See [LS-2057](https://bkrupa.atlassian.net/browse/LS-2057) for the work to restore full automated Terraform management of runner infrastructure

### Making Runner Config Changes

If you need to change runner infrastructure (egress rules, instance types, IAM, module version):

```powershell
# 1. Ensure runner secrets are present in secrets.auto.tfvars:
#    github_app_id, github_app_key_base64, github_app_webhook_secret

# 2. Preview runner changes (always review before applying)
terraform -chdir=terraform plan -var="enable_github_runners=true"

# 3. Apply ONLY runner resources — never apply the full stack with runners enabled
terraform -chdir=terraform apply -var="enable_github_runners=true" `
  -target=module.github_runners
```

> ⚠️ Never run `terraform apply -var="enable_github_runners=true"` without `-target`. A full apply with runners enabled will plan to recreate all runner infrastructure and may disrupt the live fleet.

## Prerequisites

### 1. Check AWS SSO credentials

```powershell
# Verify credentials are active before any terraform command
aws sts get-caller-identity
```

If the command fails or returns an error, credentials are expired:

```powershell
aws sso login --profile <your-profile>
# Then re-verify:
aws sts get-caller-identity
```

> 📎 See [references/aws-sso-login.md](../infrastructure/references/aws-sso-login.md) for the full SSO login flow.

### 2. Clear any state locks

```powershell
# Always run this before plan/apply — a previous interrupted run may hold the lock
node scripts/terraform-unlock.js
```

## Standard Workflow

```powershell
# 1. Clear state lock
node scripts/terraform-unlock.js

# 2. Format and validate
terraform -chdir=terraform fmt
terraform -chdir=terraform validate

# 3. Plan (always review before applying)
terraform -chdir=terraform plan

# 4. Apply after reviewing the plan
terraform -chdir=terraform apply
```

> **Never pipe `terraform apply` through output-truncating filters** (`Select-Object -Last N`, etc.) — this interrupts Terraform before it releases the DynamoDB state lock, leaving it orphaned.

## Targeting Specific Resources

Use `-target` to apply changes to a single resource without touching everything else:

```powershell
terraform -chdir=terraform apply -target=aws_lambda_function.graphql
```

> `-target` uses Terraform resource names (e.g. `aws_lambda_function.graphql`), NOT AWS resource names. Look up the resource label in `terraform/lambda-*.tf`.

| Lambda          | Terraform target                      |
| --------------- | ------------------------------------- |
| graphql / db    | `aws_lambda_function.graphql`         |
| stats           | `aws_lambda_function.stats`           |
| game-selection  | `aws_lambda_function.game_selection`  |
| draft-processor | `aws_lambda_function.draft_processor` |
| oauth-proxy     | `aws_lambda_function.oauth_proxy`     |
| websocket       | `aws_lambda_function.websocket`       |
| jira-proxy      | `aws_lambda_function.jira_proxy`      |
| stripe-webhook  | `aws_lambda_function.stripe_webhook`  |

> This table is not exhaustive. For the full set of Lambda resources and their Terraform targets, see `terraform/lambda-*.tf`.

## Worktree Gotcha: Missing secrets.auto.tfvars

`terraform/secrets.auto.tfvars` is gitignored and lives only in the main repo. A fresh worktree will not have it, causing Terraform to prompt interactively for secret variables.

```powershell
# Fix: re-run wt-setup (preferred — copies secrets automatically)
make wt-setup WT=<path-to-worktree>

# Or copy manually:
Copy-Item D:\code\legacy-sports\terraform\secrets.auto.tfvars `
  <worktree>\terraform\secrets.auto.tfvars
```

`jira_credentials` can be set either in `secrets.auto.tfvars` (see `secrets.auto.tfvars.example`) or via env var if the file is unavailable:

```powershell
$env:TF_VAR_jira_credentials = aws secretsmanager get-secret-value `
  --secret-id "legacy-sports-dev-jira-credentials" `
  --query SecretString --output text
```

## Pre-Apply Checklist

- [ ] `aws sts get-caller-identity` succeeds
- [ ] `node scripts/terraform-unlock.js` ran — no active lock
- [ ] `terraform plan` reviewed — changes are expected and runner resources are NOT in the diff
- [ ] `secrets.auto.tfvars` present in worktree (if running from a worktree)

## Troubleshooting

| Symptom                                       | Fix                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| "Error acquiring the state lock"              | `node scripts/terraform-unlock.js`                                            |
| Prompts for secret variables interactively    | Copy `secrets.auto.tfvars` from main repo or run `make wt-setup`              |
| "No valid credential sources found"           | `aws sso login --profile <profile>`                                           |
| Plan unexpectedly shows runner infrastructure | Check `infra.auto.tfvars` is present and sets `enable_github_runners = false` |
| "Required version constraint"                 | Check `terraform/main.tf` and install matching `terraform` binary             |

> 📎 Full issue catalogue: see [references/terraform-common-issues.md](../infrastructure/references/terraform-common-issues.md)
