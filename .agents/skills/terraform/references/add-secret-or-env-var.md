# Add a Secret or Environment Variable

> Reference for the [`terraform`](../SKILL.md) skill. Load before adding any new secret or env var — ensures all required locations are updated: Terraform variables, AWS Secrets Manager, local `.env` sync, Lambda config, GitHub Actions, and CI wiring. For safe handling of the VALUE itself in tool calls, see [`secrets-handling`](../../secrets-handling/SKILL.md).

## Overview

Secrets and environment variables must be plumbed through several layers of the Legacy Sports ecosystem. Missing any one layer will cause the secret to be unavailable at runtime, or cause the Terraform plan to fail in CI.

This skill walks through every required location in the correct order.

## Taxonomy

| Kind              | Use For                                            | Storage                                                 |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------- |
| **Plain env var** | Non-sensitive config (URLs, feature flags, region) | Terraform `lambda-*.tf` `environment.variables`, `.env` |
| **Secret**        | Passwords, API keys, tokens                        | AWS Secrets Manager via Terraform; local `.env.local`   |

## Full Checklist

**Quick scan first:** Before manually checking all locations, run the automated scanner to see which ones already have the variable:

```bash
make scan-secret VAR=MY_SECRET_NAME
# or: node scripts/secret-location-scanner.js --json MY_SECRET_NAME
```

Then work through all steps in order. Detailed code examples for each step: [add-secret-or-env-var-step-by-step.md](add-secret-or-env-var-step-by-step.md)

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
| 9   | GitHub Actions repository secret (see note ↓)   |       —       |           ✅           |
| 10  | CI workflow `TF_VAR_*` + validation             |       —       |           ✅           |
| 11  | `terraform apply`                               |      ✅       |           ✅           |

> **Step 9 — propagate AWS → GitHub in one call.** Once the secret exists in AWS Secrets Manager (step 4 applied), set the matching GitHub secret with the `secret_sync_to_github` MCP tool — it reads from AWS and writes to GitHub server-side without the value ever appearing in any tool argument or response. Supports all three scopes:
>
> ```
> # Repo Actions secret (default)
> secret_sync_to_github(secretId: "my-api-key", repoSecret: "MY_API_KEY")
>
> # Dependabot
> secret_sync_to_github(secretId: "my-api-key", repoSecret: "MY_API_KEY", scope: "dependabot")
>
> # Environment secret
> secret_sync_to_github(secretId: "prod/my-api-key", repoSecret: "MY_API_KEY", scope: "environment", env: "production")
> ```
>
> See [`secrets-handling`](../../secrets-handling/SKILL.md) Pattern 2 for full details.

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

## Related references

- [`local-apply.md`](local-apply.md) — Apply Terraform infrastructure changes locally
- [`permission-planning.md`](permission-planning.md) — IAM perms for the CI roles when adding Secrets Manager resources
- [`infrastructure/references/sync-env.md`](../../infrastructure/references/sync-env.md) — Pull AWS Parameter Store / Terraform outputs into `.env.local`
- [`infrastructure/references/deploy-lambda.md`](../../infrastructure/references/deploy-lambda.md) — Deploy Lambda code after infrastructure changes
- [`secrets-handling`](../../secrets-handling/SKILL.md) — Safely transit the VALUE through tool calls (file-copy patterns, `secret_sync_to_github`, `valueFile`)
- [`standards`](../../standards/SKILL.md) — Coding standards and config conventions
