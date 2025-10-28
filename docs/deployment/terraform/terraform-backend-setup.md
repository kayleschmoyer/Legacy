# Terraform Backend Setup Guide

This guide explains how to set up Terraform state management for the legacy-sports project.

## Problem We're Solving

Without a backend configuration, Terraform stores state locally. In GitHub Actions, this means:

- Each run starts with no state file
- Terraform thinks all resources need to be created
- Tries to re-apply everything, even though resources already exist

## Solution: Remote State in S3

We use an S3 bucket to store Terraform state and a DynamoDB table for state locking. This allows:

- ✅ Terraform tracks what's already deployed
- ✅ GitHub Actions can access the same state
- ✅ Lambda deployments happen via SSM parameter updates (no Terraform code changes)
- ✅ Multiple team members can work without conflicts

## One-Time Bootstrap Process

### Step 1: Comment Out Backend Block

Temporarily comment out the `backend` block in `terraform/main.tf`:

```hcl
terraform {
  required_version = ">= 1.0"

  # backend "s3" {
  #   bucket         = "legacy-sports-terraform-state"
  #   key            = "legacy-sports/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-state-locks"
  # }

  required_providers {
    # ...
  }
}
```

### Step 2: Initialize Terraform Locally

```powershell
cd terraform
terraform init
```

### Step 3: Create Backend Resources

```powershell
# Create only the backend infrastructure
terraform apply -target=aws_s3_bucket.terraform_state -target=aws_s3_bucket_versioning.terraform_state -target=aws_s3_bucket_server_side_encryption_configuration.terraform_state -target=aws_s3_bucket_public_access_block.terraform_state -target=aws_dynamodb_table.terraform_locks
```

Review the plan and type `yes` to create:

- S3 bucket: `legacy-sports-terraform-state`
- DynamoDB table: `terraform-state-locks`

### Step 4: Uncomment Backend Block

Restore the `backend` block in `terraform/main.tf` (undo Step 1).

### Step 5: Migrate State to S3

```powershell
terraform init -migrate-state
```

Terraform will ask: `Do you want to copy existing state to the new backend?`
Type `yes` to migrate your local state file to S3.

### Step 6: Verify State Migration

```powershell
# List state
terraform state list

# Check S3 bucket
aws s3 ls s3://legacy-sports-terraform-state/legacy-sports/
```

You should see `terraform.tfstate` in the S3 bucket.

### Step 7: Import Existing Resources (If Needed)

If you already have resources in AWS that aren't in your state, import them:

```powershell
# Example: Import existing Lambda function
terraform import aws_lambda_function.graphql legacy-sports-dev-graphql

# Example: Import existing S3 bucket
terraform import aws_s3_bucket.lambda_deployments legacy-sports-dev-lambdas-cca20ad9
```

Repeat for all existing resources.

## How It Works After Setup

### When Terraform Code Changes

```bash
cd terraform
terraform plan    # See what will change
terraform apply   # Apply infrastructure changes
```

State is automatically saved to S3.

### When Lambda Code Changes (GitHub Actions)

Your existing workflow continues to work:

1. **Build Lambda**: `pnpm exec nx build db`
2. **Package**: Create zip file with timestamp
3. **Upload to S3**: `aws s3 cp graphql-${VERSION}.zip s3://bucket/`
4. **Update SSM**: `aws ssm put-parameter --name "/legacy-sports/dev/lambda/graphql/version" --value "$VERSION"`
5. **Apply Terraform**: `terraform apply -target=aws_lambda_function.graphql`

Because `source_code_hash = data.aws_ssm_parameter.graphql_lambda_version.value`, Terraform sees the SSM parameter changed and updates only the Lambda function—no other infrastructure changes!

## GitHub Actions Configuration

Your workflows already use OIDC authentication, so they'll automatically have access to:

- ✅ S3 bucket (for reading state)
- ✅ DynamoDB table (for state locking)
- ✅ All other AWS resources

The IAM role `legacy-sports-dev-github-actions` should have these permissions (add if missing):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::legacy-sports-terraform-state/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::legacy-sports-terraform-state"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DeleteItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/terraform-state-locks"
    }
  ]
}
```

## Troubleshooting

### Error: "Backend configuration changed"

Run `terraform init -reconfigure`

### Error: "Failed to acquire state lock"

Someone else is running Terraform. Wait for them to finish, or if it's stuck:

```powershell
terraform force-unlock <LOCK_ID>
```

### Error: "Resource already exists"

Import the existing resource into state:

```powershell
terraform import <resource_type>.<resource_name> <resource_id>
```

## State Management Best Practices

1. ✅ **Never edit state files directly** - Use `terraform state` commands
2. ✅ **Always use state locking** - Prevents concurrent modifications
3. ✅ **Keep state files encrypted** - S3 encryption enabled by default
4. ✅ **Version your state files** - S3 versioning enabled automatically
5. ✅ **Separate Lambda code from infrastructure** - Use SSM parameters for version tracking

## Summary

After this one-time setup:

- ✅ Terraform state is stored in S3 (not locally)
- ✅ GitHub Actions can access the state
- ✅ Lambda deployments work without Terraform code changes
- ✅ Infrastructure changes are tracked properly
- ✅ No more "trying to re-apply everything" issues!
