# Terraform — Infrastructure as Code

AWS infrastructure for the legacy-sports platform, managed with Terraform.

> **Working locally?** See the [terraform-local-apply skill](../.agents/skills/terraform-local-apply/SKILL.md) for the full workflow, safety model, and troubleshooting guide.

---

## Architecture

```
GitHub Actions (OIDC)
        │
        ▼
  API Gateway ──▶ Lambda Functions ──▶ RDS (PostgreSQL)
        │                │                    │
        │           Secrets Manager      RDS Proxy
        │                │
        ▼                ▼
  CloudWatch Logs   VPC Endpoints
                   (no NAT needed for AWS services)

  NAT Instance ──▶ Google APIs / external services
  (private subnets only)

  Self-hosted Runners (EC2 Spot via github-aws-runners module)
  webhook ──▶ API GW ──▶ Lambda ──▶ EC2 Spot fleet
```

---

## What this config manages

| Component                  | File(s)                  | Notes                                                                                                                |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| VPC, subnets, route tables | `vpc.tf`                 | Public + private Lambda + private DB subnets                                                                         |
| API Gateway (REST)         | `api_gateway.tf`         | Custom domain `api.legacy-fantasy.com`                                                                               |
| Lambda functions           | `lambda*.tf`             | GraphQL, OAuth proxy, stats, game-selection, draft-processor, websocket, jira-proxy, rollbar-discord, stripe-webhook |
| RDS PostgreSQL             | `database.tf`            | Private subnets; RDS Proxy enabled                                                                                   |
| Secrets Manager            | `secrets.tf`             | DB creds, OAuth secrets, webhook secrets                                                                             |
| VPC Endpoints              | `vpc-endpoints.tf`       | Secrets Manager + CloudWatch Logs (Interface); S3 (Gateway) — eliminates NAT for AWS service calls                   |
| NAT instance               | `nat-instance.tf`        | Lightweight EC2 NAT for Google API / external HTTPS from private subnets (~$4/month vs $45 for NAT GW)               |
| GitHub Actions OIDC        | `github-actions-oidc.tf` | Keyless CI auth; inline + supplemental managed policy                                                                |
| GitHub Actions IAM         | `github-actions-iam.tf`  | Additional IAM resources for CI                                                                                      |
| Self-hosted runners        | `github-runners.tf`      | `enable_github_runners = false` locally — see Runner section below                                                   |
| EventBridge rules          | `eventbridge.tf`         | Score alert and waiver claim processing                                                                              |
| SQS queues                 | `sqs.tf`                 | Dead-letter queues for async Lambda processing                                                                       |
| CloudWatch alarms          | `monitoring.tf`          | DLQ depth alarms → SNS → Discord                                                                                     |
| Route 53                   | `route53.tf`             | DNS for `legacy-fantasy.com` and subdomains                                                                          |
| ACM certificates           | `api_gateway.tf`         | TLS cert for `api.legacy-fantasy.com`                                                                                |
| Budgets                    | `budgets.tf`             | Monthly cost alerts                                                                                                  |
| CI artifact S3             | `ci-artifacts.tf`        | Narrow OIDC role for feature-branch artifact uploads                                                                 |

---

## Feature flags (`infra.auto.tfvars`)

This file is **committed to the repo** and read by both local and CI applies.

| Flag                            | Default             | Purpose                              |
| ------------------------------- | ------------------- | ------------------------------------ |
| `enable_rds_proxy`              | `true`              | RDS Proxy for Lambda DB connectivity |
| `enable_github_runners`         | `false`             | See Runner section below             |
| `github_runners_instance_types` | `[c7a.xlarge, ...]` | Spot fleet instance diversity        |
| `github_runners_max_count`      | `20`                | Hard ceiling on runner fleet size    |

---

## Self-hosted runners — management model

Runner infrastructure (autoscaling group, SGs, Lambdas, event bus, S3, IAM) is **intentionally excluded from the normal Terraform apply loop**:

- `enable_github_runners = false` in `infra.auto.tfvars`
- **CI does not override this flag** — `lambda-terraform-apply.yml` reads the file directly and never sets `TF_VAR_enable_github_runners=true`
- Runner resources are **not in Terraform state** — removing them prevents phantom destroy plans on every apply

### How runners actually scale

Runners are fully self-managing once provisioned:

```
GitHub workflow_job webhook
        │
        ▼
API Gateway (runner webhook endpoint)
        │
        ▼
scale-up Lambda ──▶ EC2 Spot fleet (ASG)
        │
        └─▶ scale-down Lambda (cron, every minute) terminates idle runners
```

The EC2 instances register themselves with GitHub as self-hosted runners on boot and deregister on termination. No Terraform apply is needed for day-to-day scaling.

### Making runner config changes

If you need to change runner infrastructure (egress rules, instance types, IAM, module version):

```bash
# 1. Ensure runner secrets are in secrets.auto.tfvars:
#    github_app_id, github_app_key_base64, github_app_webhook_secret

# 2. Preview changes (never apply without reviewing first)
terraform -chdir=terraform plan -var="enable_github_runners=true"

# 3. Apply ONLY runner resources — never apply the full stack with runners enabled
terraform -chdir=terraform apply -var="enable_github_runners=true" \
  -target=module.github_runners
```

> ⚠️ Never run `terraform apply -var="enable_github_runners=true"` without `-target`. A full apply with runners enabled will plan to recreate all runner infrastructure and may disrupt the live fleet.

See [LS-2057](https://bkrupa.atlassian.net/browse/LS-2057) for the work to restore full automated Terraform management of runner infrastructure.

---

## CI/CD apply loop

The `lambda-terraform-apply.yml` workflow runs on every push to `main`:

1. Validates required secrets are present
2. Debounces 30 s to batch concurrent Lambda version SSM updates
3. Runs `terraform init` + `terraform apply -auto-approve`
4. Applies with `enable_github_runners = false` — **runner resources are never touched by CI**

The apply primarily reconciles:

- Lambda function configurations and aliases
- IAM policies (GitHub Actions role, Lambda roles)
- API Gateway deployments
- Secrets Manager resource policies
- VPC endpoint policies

---

## State management

- **Backend**: S3 (`legacy-sports-terraform-state`) + DynamoDB (`terraform-state-locks`)
- **Lock clearing**: `node scripts/terraform-unlock.js` — use before any local plan/apply
- **Runner resources**: intentionally absent from state (see Runner section above)

### Known intentional state omissions

| Resource                          | Reason                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `module.github_runners` resources | Self-scaling fleet; managed separately with `-var="enable_github_runners=true"` |

---

## Sensitive variables (`secrets.auto.tfvars`)

This file is **gitignored** and lives only in the main repo. Copy it to a worktree with:

```bash
make wt-setup WT=<worktree-path>
```

Required keys:

| Variable                    | Source                               |
| --------------------------- | ------------------------------------ |
| `github_app_id`             | GitHub App for runner webhook        |
| `github_app_key_base64`     | GitHub App private key (base64)      |
| `github_app_webhook_secret` | GitHub App webhook HMAC secret       |
| `jira_credentials`          | Jira API token for jira-proxy Lambda |

---

## Local development quickstart

```bash
# 1. Verify AWS credentials
aws sts get-caller-identity

# 2. Clear any stale state lock
node scripts/terraform-unlock.js

# 3. Plan (runners excluded by default)
terraform -chdir=terraform plan

# 4. Apply
terraform -chdir=terraform apply
```

Full workflow, targeting guide, and troubleshooting: [terraform-local-apply skill](../.agents/skills/terraform-local-apply/SKILL.md).
