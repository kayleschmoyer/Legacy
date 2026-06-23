# Add Secret or Env Var — Step-by-Step Guide

## Step 1 — Local Development (`.env` / `.env.local`)

For non-sensitive values, add to `.env` (committed):

```
MY_FEATURE_FLAG=true
```

For secrets, add to `.env.local` (gitignored — never commit):

```
MY_API_KEY=actual-value-here
```

> `.env.local` is loaded by the db Lambda dev server (via `lambdas/db/src/env.ts`) and by Next.js automatically.

## Step 2 — Terraform Variable Declaration (`terraform/secrets.tf` or `terraform/variables.tf`)

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

## Step 3 — Local Secrets File (`terraform/secrets.auto.tfvars`)

Add the real value to `terraform/secrets.auto.tfvars` (gitignored):

```hcl
my_api_key = "actual-value-for-local-terraform-runs"
```

Also add a placeholder to `terraform/secrets.auto.tfvars.example` (committed):

```hcl
# My API key from the Foo dashboard → Settings → API Keys
my_api_key = "your-foo-api-key-here"
```

## Step 4 — AWS Secrets Manager Resource (`terraform/secrets.tf`)

For secrets that Lambda functions read at runtime:

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

> Skip this step for plain env vars.

## Step 5 — Update `scripts/sync-env.ps1` and `terraform/outputs.tf`

### For secrets

In `sync-env.ps1`, fetch the secret value:

```powershell
$myApiKeySecretName = $terraformOutput.environment_variables_summary.value.my_api_key_secret_name
Write-Host "  My API key from: $myApiKeySecretName" -ForegroundColor Gray
$myApiKey = aws secretsmanager get-secret-value --secret-id $myApiKeySecretName --query "SecretString" --output text
```

Add to `$newEnvVars`:

```powershell
$newEnvVars["MY_API_KEY"] = $myApiKey
```

Expose the secret _name_ in `terraform/outputs.tf`:

```hcl
output "environment_variables_summary" {
  value = {
    # ...existing keys...
    my_api_key_secret_name = aws_secretsmanager_secret.my_api_key.name
  }
}
```

### For plain env vars

Add to `terraform/outputs.tf`:

```hcl
output "environment_variables_summary" {
  value = {
    # ...existing keys...
    my_feature_flag = var.my_feature_flag
  }
}
```

In `sync-env.ps1`:

```powershell
$newEnvVars["MY_FEATURE_FLAG"] = $terraformOutput.environment_variables_summary.value.my_feature_flag
```

> **Why both files?** `outputs.tf` surfaces the value from Terraform state. `sync-env.ps1` reads outputs/secrets and writes to `.env`.

## Step 6 — Lambda IAM Policy (`terraform/lambda-<name>.tf`)

Add the secret ARN to the Lambda's Secrets Manager IAM policy:

```hcl
Resource = [
  aws_secretsmanager_secret.database_credentials.arn,
  aws_secretsmanager_secret.jwt_secret.arn,
  aws_secretsmanager_secret.my_api_key.arn,   # ← add here
]
```

> Skip for plain env vars.

## Step 7 — Lambda `environment.variables` Block (`terraform/lambda-<name>.tf`)

**Secret** — pass the secret name (Lambda fetches value at runtime):

```hcl
MY_API_KEY_SECRET_NAME = aws_secretsmanager_secret.my_api_key.name
```

**Plain env var** — pass the value directly:

```hcl
MY_FEATURE_FLAG = var.my_feature_flag
```

## Step 8 — Lambda Runtime Code

**Secret** — fetch from Secrets Manager:

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

**Plain env var** — read directly:

```typescript
const myFeatureFlag = process.env.MY_FEATURE_FLAG === 'true';
```

**Tip**: Declare env var names in the lambda's `Environment.ts` enum for compile-time safety.

## Step 9 — GitHub Actions Repository Secret

1. Go to **GitHub → Repository → Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `MY_API_KEY` (uppercase, underscores)
4. Value: the real secret value

> Only repository admins can add secrets.

## Step 10 — CI Workflow Wiring (`.github/workflows/lambda-terraform-apply.yml`)

Wire as `TF_VAR_*` in both Plan and Apply steps:

```yaml
env:
  TF_VAR_my_api_key: ${{ secrets.MY_API_KEY }}
```

Add to the **Validate Required Secrets** step:

```bash
if [ -z "${{ secrets.MY_API_KEY }}" ]; then
  MISSING+=("MY_API_KEY")
fi
```

> The Terraform variable name is `my_api_key` → env var must be `TF_VAR_my_api_key`.

## Step 11 — Apply Infrastructure

After merging to `main`, Terraform applies automatically via CI. For manual dev apply:

```powershell
Set-Location terraform
terraform init
terraform plan
terraform apply
```
