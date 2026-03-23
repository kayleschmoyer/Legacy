---
name: add-secret-or-env-var
description: 'Add a new secret or environment variable to the project. Load before adding any secret or env var — ensures all required locations are updated: Terraform, AWS Secrets Manager, local .env sync, Lambda config, GitHub Actions, and CI wiring.'
---

# Skill: Add a Secret or Environment Variable

## Overview

Secrets and environment variables must be plumbed through several layers of the Legacy Sports ecosystem. Missing any one layer will cause the secret to be unavailable at runtime, or cause the Terraform plan to fail in CI.

This skill walks through every required location in the correct order.

## Taxonomy

| Kind              | Use For                                            | Storage                                                 |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------- |
| **Plain env var** | Non-sensitive config (URLs, feature flags, region) | Terraform `lambda-*.tf` `environment.variables`, `.env` |
| **Secret**        | Passwords, API keys, tokens                        | AWS Secrets Manager via Terraform; local `.env.local`   |

## Full Checklist

Work through all steps in order. Detailed code examples for each step: [references/step-by-step-guide.md](references/step-by-step-guide.md)

| #   | Location                                        | Plain Env Var |         Secret         |
| --- | ----------------------------------------------- | :-----------: | :--------------------: |
| 1   | `.env` / `.env.local`                           |      ✅       | ✅ (`.env.local` only) |
| 2   | `terraform/variables.tf` or `secrets.tf`        |      ✅       |           ✅           |
| 3   | `terraform/secrets.auto.tfvars` + example       |       —       |           ✅           |
| 4   | AWS Secrets Manager resource in `secrets.tf`    |       —       |           ✅           |
| 5   | `terraform/outputs.tf` + `scripts/sync-env.ps1` |      ✅       |           ✅           |
| 6   | Lambda IAM policy (Secrets Manager access)      |       —       |           ✅           |
| 7   | Lambda `environment.variables` in `lambda-*.tf` |      ✅       |    ✅ (secret name)    |
| 8   | Lambda runtime code                             |      ✅       |     ✅ (SDK fetch)     |
| 9   | GitHub Actions repository secret                |       —       |           ✅           |
| 10  | CI workflow `TF_VAR_*` + validation             |       —       |           ✅           |
| 11  | `terraform apply`                               |      ✅       |           ✅           |

---

## Troubleshooting

### `Error: No value for required variable`

Terraform can't find a value for a `sensitive` variable. Check that:

- `terraform/secrets.auto.tfvars` has the key (local run)
- GitHub Actions secret is set and the `TF_VAR_*` mapping exists in the workflow (CI run)

### Lambda returns `undefined` / `null` for a secret at runtime

The Lambda environment variable listing the Secrets Manager secret name is not set. Verify:

1. The secret resource exists in `terraform/secrets.tf`
2. The environment variable is in the Lambda's `environment.variables` block in `lambda-*.tf`
3. Terraform was applied after the change

### Lambda throws `AccessDeniedException` when calling Secrets Manager

The Lambda's IAM policy doesn't include the new secret's ARN. Add it to the lambda's `aws_iam_policy` resource and re-apply Terraform.

### Secret value is `null` locally

Add the value to `.env.local` (not `.env`) and restart the dev server.

### CI fails with `Missing required secrets: MY_API_KEY`

The GitHub Actions repository secret hasn't been created yet. Follow Step 8.

---

## Related Skills

- [sync-env](../sync-env/SKILL.md) — Pull AWS Parameter Store variables into `.env.local`
- [terraform-apply](../terraform-apply/SKILL.md) — Apply Terraform infrastructure changes
- [deploy-lambda](../deploy-lambda/SKILL.md) — Deploy Lambda code after infrastructure changes
- [standards](../standards/SKILL.md) — Coding standards and config conventions
