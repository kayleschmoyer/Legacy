---
name: infrastructure
description: 'AWS authentication, Terraform infrastructure management, Lambda deployment, orphaned resource cleanup, Sentry sourcemap configuration, CloudWatch log querying, and GitHub Actions CI log parsing. Use for any AWS operations, cloud infrastructure changes, deployment tasks, production log debugging, or CI failure diagnosis.'
---

# Skill: Infrastructure

## Overview

Covers all infrastructure operations: AWS authentication, Terraform changes, Lambda deployment, resource cleanup, Sentry sourcemap setup, CloudWatch log querying, and GitHub Actions CI log parsing.

> **Local only** — most infrastructure operations require AWS credentials and Terraform state access, both unavailable in cloud agent environments. Cloud agents should inform the user that these tasks must be performed from a local session.

## Task-Driven Guide

| Task                                | Reference                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| AWS credentials expired             | [references/aws-sso-login.md](references/aws-sso-login.md)                             |
| Deploy Lambda code                  | [references/deploy-lambda.md](references/deploy-lambda.md)                             |
| Terraform infrastructure changes    | [references/terraform-apply.md](references/terraform-apply.md)                         |
| Clean up orphaned AWS resources     | [references/aws-orphan-cleanup.md](references/aws-orphan-cleanup.md)                   |
| Configure Sentry sourcemaps         | [references/configure-sentry-sourcemaps.md](references/configure-sentry-sourcemaps.md) |
| Read CloudWatch Lambda logs         | [references/cloudwatch-logs.md](references/cloudwatch-logs.md)                         |
| Parse GitHub Actions CI logs        | [references/github-actions-logs.md](references/github-actions-logs.md)                 |
| Sync environment variables from AWS | [references/sync-env.md](references/sync-env.md)                                       |
| Rebuild self-hosted runner AMI      | [references/ami-build.md](references/ami-build.md)                                     |

## Critical Rules

1. **Always clear Terraform locks first** — run `node scripts/terraform-unlock.js` before any `terraform plan` or `terraform apply`
2. **Always rebuild with `--skip-nx-cache` before deploy** — stale Nx cache has caused production incidents where new code was missing from the bundle
3. **Plan before apply** — always `terraform plan` first, review changes, then `terraform apply`
4. **Deploy infrastructure before code** — Terraform changes must be applied before Lambda code deployment
5. **Never pipe `terraform apply` output** — truncating filters (e.g., `Select-Object -Last`) kill Terraform mid-operation, orphaning state locks
6. **Never commit AWS credentials** — use SSO, IAM roles, or environment variables

## Quick Reference

### AWS SSO Login

```powershell
aws sso login                    # Re-authenticate when session expires
aws sts get-caller-identity      # Check current auth status
```

### Lambda Deployment (Complete Workflow)

```powershell
pnpm exec nx run db:build --skip-nx-cache   # ALWAYS rebuild fresh
node scripts/terraform-unlock.js             # Clear locks
terraform -chdir=terraform plan              # Check infra changes
terraform -chdir=terraform apply             # Apply if needed
.\scripts\deploy-lambda.ps1 -FunctionName graphql  # Deploy code
```

**Available functions**: `graphql`, `oauth-proxy`, `stats`, `game-selection`, `draft-processor`

### Terraform

```powershell
node scripts/terraform-unlock.js             # Clear locks (always first)
terraform -chdir=terraform plan              # Preview changes
terraform -chdir=terraform apply             # Apply changes
terraform -chdir=terraform apply -target=aws_lambda_function.db  # Target specific resource
```

### Common Terraform Issues

- **State lock error** — `node scripts/terraform-unlock.js`
- **Secrets prompt in worktree** — `make wt-setup WT=<path>` or copy `terraform/secrets.auto.tfvars`
- **S3 package not found** — db Lambda uploads to `db/` prefix but Terraform expects `graphql/`

See [references/terraform-common-issues.md](references/terraform-common-issues.md) and [references/terraform-state-and-operations.md](references/terraform-state-and-operations.md) for detailed troubleshooting.

## Detailed References

- [references/aws-sso-login.md](references/aws-sso-login.md) — SSO authentication, error detection, session management
- [references/deploy-lambda.md](references/deploy-lambda.md) — Lambda deployment prerequisites and workflow
- [references/deployment-guide.md](references/deployment-guide.md) — Deployment troubleshooting, rollback, monitoring
- [references/terraform-apply.md](references/terraform-apply.md) — Terraform commands, workflows, CI/CD IAM
- [references/terraform-common-issues.md](references/terraform-common-issues.md) — State locks, credentials, drift, S3 path issues
- [references/terraform-state-and-operations.md](references/terraform-state-and-operations.md) — State management, file structure, sensitive resources
- [references/aws-orphan-cleanup.md](references/aws-orphan-cleanup.md) — Audit and clean up untracked AWS resources
- [references/configure-sentry-sourcemaps.md](references/configure-sentry-sourcemaps.md) — Sentry sourcemap upload for Vite/esbuild projects
- [references/cloudwatch-logs.md](references/cloudwatch-logs.md) — Query and stream CloudWatch logs for Lambda debugging
- [references/github-actions-logs.md](references/github-actions-logs.md) — Parse GitHub Actions logs to diagnose CI failures
- [references/cloud-github-auth.md](references/cloud-github-auth.md) — GitHub authentication setup and troubleshooting for cloud agent environments
- [references/version-information.md](references/version-information.md) — Build version info for debugging deployments, health endpoints, and adding version metadata to new services
- [references/sync-env.md](references/sync-env.md) — Sync environment variables from AWS Parameter Store to local `.env` files
- [references/ami-build.md](references/ami-build.md) — Build self-hosted runner AMI with Packer, verify rollout, troubleshoot

## Related Documentation

- [AWS Infrastructure](../../../docs/deployment/aws-infrastructure.md)
- [Terraform Lambda Deployment](../../../docs/deployment/terraform/terraform-lambda-deployment.md)
- [Terraform State Management](../../../docs/deployment/terraform/terraform-state-solution.md)
- [Lambda Build Strategy](../../../docs/deployment/lambda-build-strategy.md)
- [Deployment Security](../../../docs/deployment/deployment-security.md)
- [Sentry Sourcemap Upload](../../../docs/deployment/sentry-sourcemap-upload.md)
