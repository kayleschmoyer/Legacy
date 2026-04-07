# Terraform — Infrastructure as Code

AWS infrastructure for the legacy-sports platform, managed with Terraform across **two separate state files** (LS-2425).

> **Working locally?** See the [terraform-local-apply skill](../.agents/skills/terraform-local-apply/SKILL.md) for the full workflow, safety model, and troubleshooting guide.

---

## Two-state architecture

```
terraform/
├── main/                                 # Lambda app infrastructure state
│   ├── backend.tf                        # → s3://legacy-sports-terraform-state/legacy-sports/terraform.tfstate
│   ├── lambda-*.tf, vpc.tf, database.tf, security_groups.tf, ...
│   ├── github-actions-oidc.tf            # OIDC role + Lambda app permissions
│   ├── monitoring.tf                     # Lambda alarms (runner alarms moved out)
│   └── outputs.tf                        # Cross-state outputs consumed by runners/
│
└── runners/                              # Self-hosted runner fleet state
    ├── backend.tf                        # → s3://legacy-sports-terraform-state/legacy-sports/runners.tfstate
    ├── data.tf                           # data.terraform_remote_state.main reference
    ├── github-runners.tf                 # The github-aws-runners module call
    ├── runner-cache.tf                   # Pnpm S3 cache bucket
    ├── runner-dashboard.tf               # CloudWatch dashboard
    ├── runner-rotation-reminder.tf       # Quarterly secret-rotation EventBridge rule
    ├── runner-monitoring.tf              # Runner Lambda alarms + queue depth + cost anomaly
    ├── runner-iam-additional.tf          # IAM policy attached to main/'s github_actions role
    ├── runner-ami-builder-iam.tf         # OIDC role for Packer AMI builds (LS-2429)
    ├── runner-ami.auto.tfvars            # Source of truth for runner AMI Playwright version
    └── packer/runner-ami.pkr.hcl         # Packer build config
```

### Why two states?

Before LS-2425, the runner module lived in the same state file as the Lambda app infrastructure but was gated behind `count = var.enable_github_runners ? 1 : 0`. The regular `Apply Lambda Infrastructure` workflow ran with `enable_github_runners = false`, which meant terraform saw "state has 70 runner resources, config has 0" and computed a destroy-everything plan for the runner module on every refresh. This was masked for months by missing IAM permissions on refresh; LS-2424 fixed those perms and immediately exposed the destroy bug, partially destroying the runner fleet before permission denials stopped further damage.

State separation makes the bug structurally impossible: `terraform/main/` cannot see runner resources because they're not in its state file, and `terraform/runners/` cannot see Lambda app resources for the same reason. Neither apply can plan a destroy of the other's resources, regardless of variable settings.

### How the two states share data

`runners/` reads values it needs from `main/` via a `terraform_remote_state` data source (see `runners/data.tf`). Specifically:

| Value                                            | Used for                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `vpc_id`, `vpc_cidr_block`                       | Runner SG ingress/egress rules                                                                     |
| `public_subnet_ids`, `public_subnet_cidr_blocks` | Where runners spawn (the github-aws-runners module is told `subnet_ids = local.public_subnet_ids`) |
| `security_group_rds_id`                          | Cross-state references for runner→RDS connectivity                                                 |
| `nat_instance_security_group_id`                 | Cross-reference for SG ingress rules                                                               |
| `ops_alerts_topic_arn`                           | Runner CloudWatch alarms publish to the same SNS topic as Lambda alarms                            |

`main/` does not consume any outputs from `runners/`. The dependency is one-way.

### How the two states share IAM

The `legacy-sports-dev-github-actions` OIDC role is defined in `terraform/main/github-actions-oidc.tf`. Both states use this role:

- `terraform/main/`'s policies (`github_actions_additional`, `github_actions_supplemental`) cover Lambda app operations.
- `terraform/runners/runner-iam-additional.tf` declares an `aws_iam_policy` and an `aws_iam_role_policy_attachment` that attaches by **role name string** (`role = "${local.name_prefix}-github-actions"`) — not by resource reference, since the role lives in a different state.

This means:

- Renaming the role requires updating both states.
- The `runners/` policy can be applied or destroyed independently of the role itself.

---

## What lives where

### `terraform/main/` (Lambda app infrastructure)

| Component                  | File(s)                  | Notes                                                                                                                |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| VPC, subnets, route tables | `vpc.tf`                 | Public + private Lambda + private DB subnets                                                                         |
| API Gateway (REST)         | `api_gateway.tf`         | Custom domain `api.legacy-fantasy.com`                                                                               |
| Lambda functions           | `lambda*.tf`             | GraphQL, OAuth proxy, stats, game-selection, draft-processor, websocket, jira-proxy, rollbar-discord, stripe-webhook |
| RDS PostgreSQL             | `database.tf`            | Private subnets; RDS Proxy enabled                                                                                   |
| Secrets Manager            | `secrets.tf`             | DB creds, OAuth secrets, webhook secrets                                                                             |
| VPC Endpoints              | `vpc-endpoints.tf`       | Secrets Manager + CloudWatch Logs (Interface); S3 (Gateway)                                                          |
| NAT instance               | `nat-instance.tf`        | Lightweight EC2 NAT for external HTTPS from private subnets                                                          |
| GitHub Actions OIDC        | `github-actions-oidc.tf` | Keyless CI auth; inline + supplemental managed policy                                                                |
| GitHub Actions IAM         | `github-actions-iam.tf`  | Additional IAM resources for CI                                                                                      |
| EventBridge rules          | `eventbridge.tf`         | Score alert and waiver claim processing                                                                              |
| SQS queues                 | `sqs.tf`                 | Dead-letter queues for async Lambda processing                                                                       |
| CloudWatch alarms (Lambda) | `monitoring.tf`          | DLQ depth alarms → SNS → Discord                                                                                     |
| Route 53                   | `route53.tf`             | DNS for `legacy-fantasy.com` and subdomains                                                                          |
| Budgets                    | `budgets.tf`             | Monthly cost alerts                                                                                                  |
| CI artifact S3             | `ci-artifacts.tf`        | Narrow OIDC role for feature-branch artifact uploads                                                                 |

### `terraform/runners/` (self-hosted runner fleet)

| Component                    | File(s)                       | Notes                                                      |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------- |
| GitHub runners module        | `github-runners.tf`           | `github-aws-runners/github-runner/aws` v7.5.0              |
| Pnpm S3 cache                | `runner-cache.tf`             | Speeds up cold-start `pnpm install` (~3-5 min → <30s)      |
| Performance dashboard        | `runner-dashboard.tf`         | CloudWatch dashboard for queue depth + Lambda metrics      |
| Secret rotation reminder     | `runner-rotation-reminder.tf` | Quarterly EventBridge rule                                 |
| Runner alarms                | `runner-monitoring.tf`        | Lambda error alarms (4) + queue depth + cost anomaly       |
| AMI builder OIDC role        | `runner-ami-builder-iam.tf`   | Packer build role (LS-2429)                                |
| AMI version pin              | `runner-ami.auto.tfvars`      | Source of truth for `runner_ami_playwright_version`        |
| github-actions IAM extension | `runner-iam-additional.tf`    | Runner-module-specific perms attached to main/'s OIDC role |
| Packer build config          | `packer/runner-ami.pkr.hcl`   | Pre-bakes Node, pnpm, Playwright into the AMI              |

---

## Apply loops

### Regular CI apply (Lambda app)

The `.github/workflows/lambda-terraform-apply.yml` workflow runs on every Lambda upload event and applies `terraform/main/`. It does NOT touch the runner fleet.

```bash
# Equivalent local invocation:
make terraform-init      # → terraform -chdir=terraform/main init
make terraform-plan      # → terraform -chdir=terraform/main plan
make terraform-apply     # → terraform -chdir=terraform/main apply
```

### Runner CI apply

The `.github/workflows/runner-terraform-apply.yml` workflow runs on push-to-main path-filtered changes under `terraform/runners/` and on the post-merge of any AMI rebuild PR. It applies `terraform/runners/`.

```bash
# Equivalent local invocation:
make runner-init   # → terraform -chdir=terraform/runners init
make runner-plan   # → terraform -chdir=terraform/runners plan
make runner-apply  # → terraform -chdir=terraform/runners plan + apply (with confirmation)
```

`make runner-apply NO_CONFIRM=1` skips the interactive confirmation for non-interactive use.

---

## State management

- **Backend**: S3 (`legacy-sports-terraform-state`) + DynamoDB (`terraform-state-locks`)
  - `terraform/main/` → `legacy-sports/terraform.tfstate`
  - `terraform/runners/` → `legacy-sports/runners.tfstate`
  - Lock table is shared (different `LockID` rows)
- **Lock clearing**: `node scripts/terraform-unlock.js` — use before any local plan/apply
- **Bootstrap**: `terraform/main/backend-setup.tf` declares the state bucket and lock table with `prevent_destroy = true`. It must stay in `terraform/main/` because `aws_s3_bucket_policy.terraform_state` references the github-actions IAM role defined in `terraform/main/github-actions-iam.tf`.

---

## Sensitive variables (`secrets.auto.tfvars`)

Each state file has its own gitignored `secrets.auto.tfvars`. Copy them to a worktree with:

```bash
make wt-setup WT=<worktree-path>
```

Required keys:

### `terraform/main/secrets.auto.tfvars`

| Variable                                                                    | Source                                     |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| `mlb_data_api_key`                                                          | API key for the licensed MLB data provider |
| `jwt_secret_key`, `oauth_proxy_cookie_secret`, `google_oauth_client_secret` | Auth secrets                               |
| `stripe_secret_key`, `stripe_webhook_secret`                                | Stripe integration                         |
| `discord_*_webhook_url`, `discord_client_secret`                            | Discord notifications                      |
| `rollbar_access_token`, `rollbar_webhook_secret`                            | Rollbar                                    |

### `terraform/runners/secrets.auto.tfvars`

| Variable                    | Source                          |
| --------------------------- | ------------------------------- |
| `github_app_id`             | GitHub App for runner webhook   |
| `github_app_key_base64`     | GitHub App private key (base64) |
| `github_app_webhook_secret` | GitHub App webhook HMAC secret  |

---

## Local development quickstart

```bash
# 1. Verify AWS credentials
aws sts get-caller-identity

# 2. Clear any stale state lock (touches both state files automatically)
node scripts/terraform-unlock.js

# 3a. Plan main/ (Lambda app infrastructure)
terraform -chdir=terraform/main plan

# 3b. Plan runners/ (self-hosted runner fleet)
terraform -chdir=terraform/runners plan

# 4. Apply
make terraform-apply        # Lambda app
make runner-apply           # Runner fleet (with confirmation)
```

Full workflow, targeting guide, and troubleshooting: [terraform-local-apply skill](../.agents/skills/terraform-local-apply/SKILL.md).
