---
name: add-secret-or-env-var
description: 'Add a new secret or environment variable to the Legacy Sports ecosystem; covers all required locations: Terraform variable declaration, AWS Secrets Manager resource, sync-env.ps1 + outputs.tf for local .env population, Lambda Terraform environment block, Lambda runtime code, GitHub Actions repository secret, and CI workflow wiring. Load this skill before adding any new secret or env var to the project.'
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

For every new secret/env var, work through these steps in order.

---

### Step 1 — Local Development (`.env` / `.env.local`)

For non-sensitive values, add to `.env` (committed):

```
MY_FEATURE_FLAG=true
```

For secrets, add to `.env.local` (gitignored — never commit):

```
MY_API_KEY=actual-value-here
```

> `.env.local` is loaded by the db Lambda dev server (via `lambdas/db/src/env.ts`) and by Next.js automatically.

---

### Step 2 — Terraform Variable Declaration (`terraform/secrets.tf` or `terraform/variables.tf`)

**For secrets** — declare in `terraform/secrets.tf` with `sensitive = true`:

```hcl
variable "my_api_key" {
  description = "My API key for the Foo service"
  type        = string
  sensitive   = true
}
```

**For plain env vars** — declare in `terraform/variables.tf`:

```hcl
variable "my_feature_flag" {
  description = "Enables the Foo feature"
  type        = string
  default     = "false"
}
```

---

### Step 3 — Local Secrets File (`terraform/secrets.auto.tfvars`)

Add the real value to `terraform/secrets.auto.tfvars` (gitignored):

```hcl
my_api_key = "actual-value-for-local-terraform-runs"
```

Also add a placeholder entry to `terraform/secrets.auto.tfvars.example` (committed) so other developers know what's required:

```hcl
# My API key from the Foo dashboard → Settings → API Keys
my_api_key = "your-foo-api-key-here"
```

---

### Step 4 — AWS Secrets Manager Resource (`terraform/secrets.tf`)

For secrets that Lambda functions read at runtime via the AWS SDK, create a Secrets Manager resource:

```hcl
resource "aws_secretsmanager_secret" "my_api_key" {
  name        = "${var.environment}/my-api-key"
  description = "API key for the Foo service"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "my_api_key" {
  secret_id     = aws_secretsmanager_secret.my_api_key.id
  secret_string = var.my_api_key
}
```

> For plain env vars that do not need to be read from Secrets Manager at runtime, skip this step.

---

### Step 5 — Update `scripts/sync-env.ps1` and `terraform/outputs.tf`

`sync-env.ps1` is the script developers run (`./scripts/sync-env.ps1`) to pull live AWS values into their local `.env` file. It does **not** auto-discover new variables — you must explicitly wire each one.

#### For secrets

Add two lines in `sync-env.ps1`: one to fetch the secret value and one to assign it to `$newEnvVars`.

Locate the block where existing secrets are fetched (search for `aws secretsmanager get-secret-value`) and add alongside them:

```powershell
# Get My API key
$myApiKeySecretName = $terraformOutput.environment_variables_summary.value.my_api_key_secret_name
Write-Host "  My API key from: $myApiKeySecretName" -ForegroundColor Gray
$myApiKey = aws secretsmanager get-secret-value --secret-id $myApiKeySecretName --query "SecretString" --output text
```

Then in the `$newEnvVars` block:

```powershell
$newEnvVars["MY_API_KEY"] = $myApiKey
```

Also expose the secret _name_ (not value) via the `environment_variables_summary` output in `terraform/outputs.tf` so `sync-env` can find it:

```hcl
output "environment_variables_summary" {
  value = {
    # ...existing keys...
    my_api_key_secret_name = aws_secretsmanager_secret.my_api_key.name  # ← add
  }
}
```

#### For plain env vars

Add the value to the `environment_variables_summary` output in `terraform/outputs.tf`:

```hcl
output "environment_variables_summary" {
  value = {
    # ...existing keys...
    my_feature_flag = var.my_feature_flag  # ← add
  }
}
```

Then in `sync-env.ps1`'s `$newEnvVars` block:

```powershell
$newEnvVars["MY_FEATURE_FLAG"] = $terraformOutput.environment_variables_summary.value.my_feature_flag
```

> **Why both files?** `terraform/outputs.tf` surfaces the value from the Terraform state. `sync-env.ps1` reads outputs/secrets and writes them to `.env`. Neither auto-discovers new keys — both must be updated.

---

### Step 6 — Lambda IAM Policy (`terraform/lambda-<name>.tf`)

Add the new secret ARN to the Lambda's Secrets Manager IAM policy `Resource` list:

```hcl
resource "aws_iam_policy" "my_lambda_secrets" {
  # ...existing policy...
  policy = jsonencode({
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = [
          aws_secretsmanager_secret.database_credentials.arn,
          aws_secretsmanager_secret.jwt_secret.arn,
          aws_secretsmanager_secret.my_api_key.arn,   # ← add here
        ]
      }
    ]
  })
}
```

> Skip this step for plain env vars.

---

### Step 7 — Lambda Terraform `environment.variables` Block (`terraform/lambda-<name>.tf`)

Add the variable to the Lambda function's `environment.variables` block.

**For a secret** — pass the Secrets Manager secret name (the Lambda fetches the value at runtime):

```hcl
resource "aws_lambda_function" "my_lambda" {
  # ...
  environment {
    variables = {
      # ...existing vars...
      MY_API_KEY_SECRET_NAME = aws_secretsmanager_secret.my_api_key.name  # ← secret name reference
    }
  }
}
```

**For a plain env var** — pass the value directly:

```hcl
environment {
  variables = {
    # ...existing vars...
    MY_FEATURE_FLAG = var.my_feature_flag  # ← direct value
  }
}
```

---

### Step 8 — Lambda Runtime Code

**For a secret** — fetch from Secrets Manager using the secret name env var:

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

async function getMyApiKey(): Promise<string> {
  const secretName = process.env.MY_API_KEY_SECRET_NAME;
  if (!secretName) throw new Error('MY_API_KEY_SECRET_NAME env var is not set');

  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString ?? '';
}
```

**For a plain env var** — read directly:

```typescript
const myFeatureFlag = process.env.MY_FEATURE_FLAG === 'true';
```

**Tip**: Declare the env var name in the lambda's `Environment.ts` enum to catch typos at compile time:

```typescript
// lambdas/my-lambda/src/Environment.ts
export enum EnvironmentVariable {
  MY_API_KEY_SECRET_NAME = 'MY_API_KEY_SECRET_NAME',
  // ...
}
```

---

### Step 9 — GitHub Actions Repository Secret

1. Go to **GitHub → Repository → Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `MY_API_KEY` (uppercase, underscores)
4. Value: the real secret value

> Only repository admins can add secrets. If you lack access contact the team lead.

---

### Step 10 — CI Workflow Wiring (`.github/workflows/lambda-terraform-apply.yml`)

Wire the GitHub Actions secret as a `TF_VAR_*` environment variable in both the **Plan** and **Apply** steps:

```yaml
- name: Plan Infrastructure Changes
  working-directory: terraform
  env:
    TF_VAR_google_oauth_client_secret: ${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
    TF_VAR_jwt_secret_key: ${{ secrets.JWT_SECRET_KEY }}
    TF_VAR_oauth_proxy_cookie_secret: ${{ secrets.OAUTH_PROXY_COOKIE_SECRET }}
    TF_VAR_jira_credentials: ${{ secrets.JIRA_CREDENTIALS }}
    TF_VAR_my_api_key: ${{ secrets.MY_API_KEY }} # ← add here
  run: terraform plan ...

- name: Apply Infrastructure Changes
  working-directory: terraform
  env:
    # ...existing vars...
    TF_VAR_my_api_key: ${{ secrets.MY_API_KEY }} # ← add here too
  run: terraform apply ...
```

Also add the secret to the **Validate Required Secrets** step so CI fails fast if it's missing:

```bash
if [ -z "${{ secrets.MY_API_KEY }}" ]; then
  MISSING+=("MY_API_KEY")
fi
```

> The Terraform variable name is `my_api_key` → the env var must be `TF_VAR_my_api_key` (Terraform convention).

---

### Step 11 — Apply Infrastructure

After committing and merging to `main`, Terraform applies automatically via the CI workflow. To apply manually in dev:

```powershell
Set-Location terraform
terraform init
terraform plan
terraform apply
```

---

## Summary Checklist

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
- [config-standards](../config-standards/SKILL.md) — Project configuration file conventions
