# Quick Reference: Terraform Backend Setup

## TL;DR - The Problem & Solution

**Problem:** Terraform trying to re-apply everything in GitHub Actions
**Root Cause:** No backend configured → state stored locally → fresh container = no state
**Solution:** Add S3 backend for persistent state storage

## Files Changed

| File                               | Change                                |
| ---------------------------------- | ------------------------------------- |
| `terraform/main.tf`                | ✅ Added S3 backend configuration     |
| `terraform/backend-setup.tf`       | ✅ Created S3 bucket + DynamoDB table |
| `terraform/github-actions-oidc.tf` | ✅ Added state access permissions     |
| `docs/terraform-backend-setup.md`  | 📘 Step-by-step setup guide           |
| `docs/terraform-state-solution.md` | 📘 Complete explanation               |

## Quick Setup (5 minutes)

### 1. Bootstrap Backend Infrastructure

```powershell
cd terraform

# Temporarily comment out the backend block in main.tf (lines 4-10)

terraform init

# Create backend resources
terraform apply `
  -target=aws_s3_bucket.terraform_state `
  -target=aws_s3_bucket_versioning.terraform_state `
  -target=aws_s3_bucket_server_side_encryption_configuration.terraform_state `
  -target=aws_s3_bucket_public_access_block.terraform_state `
  -target=aws_dynamodb_table.terraform_locks `
  -target=aws_ssm_parameter.terraform_state_bucket `
  -target=aws_ssm_parameter.terraform_lock_table

# Uncomment the backend block in main.tf

# Migrate state to S3
terraform init -migrate-state
# Type "yes" when prompted
```

### 2. Verify Setup

```powershell
# Check state is in S3
aws s3 ls s3://legacy-sports-terraform-state/legacy-sports/

# List resources
terraform state list
```

### 3. Test Lambda Deployment

```powershell
# Make a code change to a Lambda
cd ../lambdas/db
# ... make changes ...

# Build
pnpm exec nx build db

# The GitHub Actions workflow will:
# 1. Upload new code to S3
# 2. Update SSM parameter with new version
# 3. Run terraform apply -target=aws_lambda_function.graphql
# 4. Only Lambda updates, nothing else! ✅
```

## How Lambda Deployments Work

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Code Change: Edit lambdas/db/src/handler.ts              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. GitHub Actions: Build & Package                          │
│    - pnpm exec nx build db                                         │
│    - zip -r graphql-20251013-abc123.zip dist/               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Upload to S3                                              │
│    s3://bucket/graphql/graphql-20251013-abc123.zip          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Update SSM Parameter                                      │
│    /legacy-sports/dev/lambda/graphql/version                │
│    = "20251013-abc123"                                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Terraform Detects Change                                  │
│    source_code_hash = data.aws_ssm_parameter.*.value        │
│    (SSM value changed → Lambda needs update)                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Terraform Applies                                         │
│    terraform apply -target=aws_lambda_function.graphql      │
│    ✅ Updates Lambda function only                          │
│    ✅ No other resources touched                            │
└─────────────────────────────────────────────────────────────┘
```

## Key Configuration

**Lambda Resource** (`terraform/lambda-graphql.tf`):

```hcl
data "aws_ssm_parameter" "graphql_lambda_version" {
  name = "/legacy-sports/dev/lambda/graphql/version"
}

resource "aws_lambda_function" "graphql" {
  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = "graphql/graphql-${data.aws_ssm_parameter.graphql_lambda_version.value}.zip"

  # ⭐ This is the magic line - changes when SSM parameter changes
  source_code_hash = data.aws_ssm_parameter.graphql_lambda_version.value

  # ... rest of config
}
```

**Backend** (`terraform/main.tf`):

```hcl
terraform {
  backend "s3" {
    bucket         = "legacy-sports-terraform-state"
    key            = "legacy-sports/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-locks"
  }
}
```

## Benefits

✅ **No more re-apply everything** - Terraform knows what exists  
✅ **Lambda updates stay simple** - Just upload code + update SSM  
✅ **Infrastructure in Git** - All configs tracked and reviewed  
✅ **Team collaboration** - Shared state, no conflicts  
✅ **State locking** - Prevents concurrent runs

## Common Commands

```powershell
# Check what would change
terraform plan

# Apply infrastructure changes
terraform apply

# Apply only specific resource
terraform apply -target=aws_lambda_function.graphql

# List all resources
terraform state list

# Show specific resource
terraform state show aws_lambda_function.graphql

# Import existing resource
terraform import aws_lambda_function.graphql legacy-sports-dev-graphql

# Unlock stuck state
terraform force-unlock <LOCK_ID>
```

## Troubleshooting

| Error                              | Solution                                   |
| ---------------------------------- | ------------------------------------------ |
| "Backend configuration changed"    | `terraform init -reconfigure`              |
| "Failed to acquire state lock"     | Wait or `terraform force-unlock <LOCK_ID>` |
| "Resource already exists"          | `terraform import <resource> <id>`         |
| "Permission denied" on S3/DynamoDB | Check GitHub Actions IAM role permissions  |

## Next Steps

1. ✅ Run the bootstrap process (see above)
2. ✅ Test a Lambda deployment
3. ✅ Verify only Lambda updates, nothing else
4. ✅ Celebrate! 🎉

## Documentation

- 📘 **Full Setup Guide:** `docs/terraform-backend-setup.md`
- 📘 **Complete Solution:** `docs/terraform-state-solution.md`
- 📘 **This Cheat Sheet:** `docs/terraform-quick-reference.md`
