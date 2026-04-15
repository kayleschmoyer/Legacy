---
name: terraform-local-apply
description: 'Run terraform plan/apply locally against the AWS dev environment. Load before any terraform operation — plan, apply, destroy, import, state. Covers the LS-2425 two-state architecture (terraform/main/ for Lambda app infra and terraform/runners/ for self-hosted runners), AWS SSO credential checks, state lock clearance, and the correct command sequence for local applies.'
---

# Skill: Terraform Local Apply

## Overview

Run Terraform against the AWS dev environment from a local workstation or worktree.

## Two-state architecture (LS-2425)

The terraform configuration is split into **two physically separate state files**:

| Path                 | State key                         | Owns                                                                                                                                     |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `terraform/main/`    | `legacy-sports/terraform.tfstate` | Lambda app infra: VPC, RDS, Lambdas, API Gateway, secrets, OIDC IAM role, Lambda alarms, budgets                                         |
| `terraform/runners/` | `legacy-sports/runners.tfstate`   | Self-hosted runner fleet: github-aws-runners module, runner cache, dashboard, runner alarms, AMI builder IAM, runner-specific OIDC perms |

The two states share infrastructure (VPC, subnets, RDS SG) via `data.terraform_remote_state.main` from `runners/`. `main/` does not consume any outputs from `runners/` — the dependency is one-way.

**Why two states?** Before LS-2425, the runner module lived in the same state as the Lambda app but was gated behind `count = var.enable_github_runners ? 1 : 0`. The regular CI workflow ran with `enable_github_runners = false`, which made terraform compute a destroy-everything plan for the runner module on every refresh. State separation makes this bug class structurally impossible — `terraform/main/` cannot see runner resources because they are not in its state file.

## Prerequisites

### 1. Check AWS SSO credentials

```powershell
aws sts get-caller-identity
```

If the command fails, credentials are expired:

```powershell
aws sso login --profile <your-profile>
aws sts get-caller-identity
```

> 📎 See [references/aws-sso-login.md](../infrastructure/references/aws-sso-login.md) for the full SSO login flow.

### 2. Clear any state locks

```powershell
# Touches both terraform/main/ and terraform/runners/ state lock keys
node scripts/terraform-unlock.js
```

## Standard Workflow — Lambda app infra (`terraform/main/`)

```powershell
# 1. Refresh main/secrets.auto.tfvars from env vars
make gen-tfvars

# 2. Clear state lock
node scripts/terraform-unlock.js

# 3. Format and validate
terraform -chdir=terraform/main fmt
terraform -chdir=terraform/main validate

# 4. Plan (always review before applying)
terraform -chdir=terraform/main plan
# or: make terraform-plan

# 5. Apply after reviewing the plan
terraform -chdir=terraform/main apply
# or: make terraform-apply
```

## Standard Workflow — Runner fleet (`terraform/runners/`)

```powershell
# 1. Ensure runner secrets are in terraform/runners/secrets.auto.tfvars:
#    github_app_id, github_app_key_base64, github_app_webhook_secret

# 2. Download Lambda zips that match the github-aws-runners module version
make runner-lambdas-sync

# 3. Clear state lock + plan
node scripts/terraform-unlock.js
make runner-plan

# 4. Apply (with confirmation)
make runner-apply
# Or non-interactively:
make runner-apply NO_CONFIRM=1
```

> **Never pipe `terraform apply` through output-truncating filters** (`Select-Object -Last N`, etc.) — this interrupts Terraform before it releases the DynamoDB state lock, leaving it orphaned.

## Targeting Specific Resources

Use `-target` to apply changes to a single resource without touching everything else. The state file you target depends on which resource you're modifying:

```powershell
# Lambda app resource → use main/
terraform -chdir=terraform/main apply -target=aws_lambda_function.graphql

# Runner module resource → use runners/
terraform -chdir=terraform/runners apply -target=module.github_runners.module.runners.aws_lambda_function.scale_up
```

> `-target` uses Terraform resource names (e.g. `aws_lambda_function.graphql`), NOT AWS resource names. Look up the resource label in `terraform/main/lambda-*.tf` or `terraform/runners/github-runners.tf`.

| Lambda            | State   | Terraform target                                                                      |
| ----------------- | ------- | ------------------------------------------------------------------------------------- |
| graphql / db      | main    | `aws_lambda_function.graphql`                                                         |
| stats             | main    | `aws_lambda_function.stats`                                                           |
| game-selection    | main    | `aws_lambda_function.game_selection`                                                  |
| draft-processor   | main    | `aws_lambda_function.draft_processor`                                                 |
| oauth-proxy       | main    | `aws_lambda_function.oauth_proxy`                                                     |
| websocket         | main    | `aws_lambda_function.websocket`                                                       |
| jira-proxy        | main    | `aws_lambda_function.jira_proxy`                                                      |
| stripe-webhook    | main    | `aws_lambda_function.stripe_webhook`                                                  |
| runner scale-up   | runners | `module.github_runners.module.runners.aws_lambda_function.scale_up`                   |
| runner scale-down | runners | `module.github_runners.module.runners.aws_lambda_function.scale_down`                 |
| runner webhook    | runners | `module.github_runners.module.webhook.module.eventbridge.aws_lambda_function.webhook` |

## Worktree Gotcha: Missing secrets.auto.tfvars

`terraform/main/secrets.auto.tfvars` and `terraform/runners/secrets.auto.tfvars` are both gitignored and live only in the main repo. A fresh worktree will not have them, causing Terraform to prompt interactively for secret variables.

```powershell
# Fix: re-run wt-setup (copies both secrets files from main repo automatically)
make wt-setup WT=<path-to-worktree>
```

## Pre-Apply Checklist

- [ ] `make gen-tfvars` ran (or `make wt-setup` did) — both `secrets.auto.tfvars` files are current
- [ ] `aws sts get-caller-identity` succeeds
- [ ] `node scripts/terraform-unlock.js` ran — no active lock
- [ ] `terraform plan` reviewed — changes match expectation
- [ ] You're applying the **right** state file (main/ for Lambda app, runners/ for runner fleet)

## Troubleshooting

| Symptom                                                | Fix                                                                                                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Error acquiring the state lock"                       | `node scripts/terraform-unlock.js`                                                                                                                                                                   |
| Prompts for secret variables interactively             | Run `make wt-setup WT=<path>` (copies both gitignored secrets files)                                                                                                                                 |
| "No valid credential sources found"                    | `aws sso login --profile <profile>`                                                                                                                                                                  |
| Plan unexpectedly shows runner infrastructure in main/ | LS-2425 incident — runner resources should not be in `main/` state. Run `terraform -chdir=terraform/main state list \| grep github_runners` to confirm; if any are present, escalate before applying |
| "Required version constraint"                          | Check `terraform/main/main.tf` (or `terraform/runners/backend.tf`) and install matching `terraform` binary                                                                                           |
| `runners/` plan shows VPC/SG creates                   | Cross-state outputs missing in `terraform/main/outputs.tf` — re-run `terraform -chdir=terraform/main apply` to publish them, then re-init `terraform/runners/`                                       |

> 📎 Full issue catalogue: see [references/terraform-common-issues.md](../infrastructure/references/terraform-common-issues.md)

## MCP State Management Tools

The `legacy-sports-make` MCP server exposes 6 terraform state tools. Prefer these over raw `terraform state` shell commands — they validate inputs, are Windows-safe, and return structured JSON output for successful operations. Some validation and command failures may still return plain-text error messages, so do not assume every response is JSON.

All tools accept:

- `dir` — terraform working directory, relative to repo root (e.g. `"terraform/main"`, `"terraform/runners"`) or an absolute path
- `worktreePath` (optional) — repo/worktree root for resolving relative `dir` values (defaults to repo root)

| Tool                       | Equivalent CLI                               | When to use                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `terraform_state_pull`     | `terraform -chdir=<dir> state pull`          | Inspect current state JSON; always pull before a push to get the latest serial number                                                                                                            |
| `terraform_state_push`     | `terraform -chdir=<dir> state push <file>`   | Restore or overwrite remote state; use after manual repairs. Pass `force: true` only when the serial number mismatch is intentional                                                              |
| `terraform_state_list`     | `terraform -chdir=<dir> state list [<addr>]` | List all tracked resources; optionally filter by address prefix (e.g. `"module.github_runners"`)                                                                                                 |
| `terraform_state_rm`       | `terraform -chdir=<dir> state rm <addr>`     | Remove a resource from state tracking without deleting the real AWS resource. Always run with `dryRun: true` first to confirm the address                                                        |
| `terraform_state_mv_batch` | multiple `terraform state mv` calls          | Rename or restructure many resources at once (up to 200 pairs). Pass `moves: [{ from, to }]` — single-element works for one resource too. Runs sequentially and returns per-pair success/failure |

> **Caution:** Terraform state JSON often includes sensitive values (provider credentials, secrets). Do not share or paste tool output from `terraform_state_pull`.

### Common patterns

**Inspect what's in state before surgery:**

```
terraform_state_list({ dir: "terraform/main" })
```

**Rename a resource (e.g. after a .tf refactor):**

```
terraform_state_mv_batch({
  dir: "terraform/main",
  moves: [{ from: "aws_lambda_function.old_name", to: "aws_lambda_function.new_name" }]
})
```

**Bulk module restructure:**

```
terraform_state_mv_batch({
  dir: "terraform/runners",
  moves: [
    { from: "module.old_runners.aws_iam_role.runner", to: "module.new_runners.aws_iam_role.runner" },
    { from: "module.old_runners.aws_lambda_function.scale_up", to: "module.new_runners.aws_lambda_function.scale_up" }
  ]
})
```

**Orphan a resource (stop tracking without destroying):**

```
// Preview first
terraform_state_rm({ dir: "terraform/main", address: "aws_s3_bucket.legacy", dryRun: true })
// Then remove
terraform_state_rm({ dir: "terraform/main", address: "aws_s3_bucket.legacy" })
```

**Repair corrupted remote state:**

```
// 1. Pull current state
terraform_state_pull({ dir: "terraform/main" })
// 2. Edit the JSON (Claude Code Edit tool)
// 3. Push repaired state
terraform_state_push({ dir: "terraform/main", stateJson: "<edited JSON>" })
```
