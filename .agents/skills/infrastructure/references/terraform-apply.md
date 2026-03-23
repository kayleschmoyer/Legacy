---
name: terraform-apply
description: 'Apply Terraform infrastructure changes to manage AWS resources; use when deploying new infrastructure or modifying existing cloud resources.'
---

# Skill: Terraform Infrastructure Management

## Overview

Apply infrastructure changes using Terraform to manage AWS resources.

## When to Use

- Creating new AWS resources
- Updating infrastructure configuration
- Modifying Lambda settings
- Changing database parameters
- Updating security groups
- Managing Route53 DNS records

## CRITICAL: Always Check for State Lock First

**Before running any terraform command**, check if the state is locked:

```powershell
# STEP 1: Check and clear any state locks
node scripts/terraform-unlock.js

# STEP 2: Then proceed with terraform commands
cd terraform
terraform plan
```

## Standard Command

```powershell
# Apply Terraform changes (from project root)
node scripts/terraform-unlock.js  # Clear any locks first
cd terraform
terraform apply
```

## Alternative Commands

### Plan Changes First (Recommended)

```powershell
# See what will change without applying
cd terraform
terraform plan

# Save plan to file
terraform plan -out=tfplan

# Apply saved plan
terraform apply tfplan
```

### Apply Specific Resource

```powershell
# Apply changes to specific resource only
terraform apply -target=aws_lambda_function.db

# Apply multiple specific resources
terraform apply -target=aws_lambda_function.db -target=aws_lambda_function.oauth_proxy
```

> **`-target` uses Terraform resource names, NOT AWS function names.**
> The resource name is the second label in `resource "aws_lambda_function" "<name>"` in the .tf file.
> Example: `aws_lambda_function.stats` (NOT `aws_lambda_function.stats_lambda`).
>
> **Lambda resource names** (look up in `terraform/lambda-*.tf` if unsure):
> | Deploy name | Terraform resource | Target |
> |---|---|---|
> | `stats` | `aws_lambda_function.stats` | `-target=aws_lambda_function.stats` |
> | `graphql` | `aws_lambda_function.graphql` | `-target=aws_lambda_function.graphql` |
> | `game-selection` | `aws_lambda_function.game_selection` | `-target=aws_lambda_function.game_selection` |
> | `draft-processor` | `aws_lambda_function.draft_processor` | `-target=aws_lambda_function.draft_processor` |
> | `oauth-proxy` | `aws_lambda_function.oauth_proxy` | `-target=aws_lambda_function.oauth_proxy` |
> | `websocket` | `aws_lambda_function.websocket` | `-target=aws_lambda_function.websocket` |
> | `db` | `aws_lambda_function.db` | `-target=aws_lambda_function.db` |

### Terraform Init

```powershell
# Initialize Terraform (first time or after config changes)
cd terraform
terraform init

# Upgrade providers
terraform init -upgrade
```

### Check State

```powershell
# View current state
terraform show

# List resources in state
terraform state list

# View specific resource
terraform state show aws_lambda_function.db
```

## Complete Deployment Workflow

When deploying infrastructure AND Lambda code:

```powershell
# 1. Clear any state locks
node scripts/terraform-unlock.js

# 2. Plan infrastructure changes
cd terraform
terraform plan

# 3. Apply infrastructure (if changes look good)
terraform apply

# 4. Deploy Lambda code (return to project root first)
cd ..
.\scripts\deploy-lambda.ps1 -FunctionName graphql

# 5. Verify deployment
pnpm exec nx run web:build
```

**Note**: Always deploy infrastructure (terraform) BEFORE Lambda code.

## Expected Output

- **Plan**: List of resources to create, update, or destroy
- **Apply**: Progress of resource changes
- **Success**: "Apply complete! Resources: X added, Y changed, Z destroyed"

> **Common issues** (state lock, AWS credentials, state drift, resource exists, version mismatch, worktree secrets, piped output lock, S3 package not found): see [terraform-common-issues.md](terraform-common-issues.md)

## Best Practices

1. **Always run plan first** - Review changes before applying
2. **Use version control** - Commit Terraform files
3. **Never force-unlock** unless sure lock is stale
4. **Backup state** - Keep state file safe
5. **Use workspaces** - Separate dev/staging/prod
6. **Review changes** - Understand what will change
7. **Apply incrementally** - Use -target for large changes
8. **Update CI/CD IAM when adding new resource types** — see section below

## CI/CD IAM Permission Checklist

When Terraform changes introduce a **new AWS resource type** (e.g., ACM certificates, API Gateway custom domains), the GitHub Actions IAM role may lack permissions for it.

**File**: `terraform/github-actions-oidc.tf` — inline policy `github_actions_additional`

**Checklist when adding resources**:

1. **Check existing statements** — does the policy already cover the service?
2. **Add actions** — create a new `statement` block for the service (e.g., `acm:*`, `route53:ChangeResourceRecordSets`)
3. **Add resource ARNs** — add the new resource ARN patterns to both read and write resource lists as needed
4. **Principle of least privilege** — scope to the specific resources, not `*`

**Common additions and their required permissions**:

| Resource Type   | Actions Needed                                                                                                                                                                                  | Resource ARN Pattern                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ACM Certificate | `acm:RequestCertificate`, `acm:DescribeCertificate`, `acm:DeleteCertificate`, `acm:ListCertificates`, `acm:ListTagsForCertificate`, `acm:AddTagsToCertificate`, `acm:RemoveTagsFromCertificate` | `arn:aws:acm:*:ACCOUNT:certificate/*`                                                  |
| Route53 Write   | `route53:ChangeResourceRecordSets`, `route53:GetChange`                                                                                                                                         | `arn:aws:route53:::hostedzone/*`, `arn:aws:route53:::change/*`                         |
| API GW Domain   | (add to existing apigateway resource paths)                                                                                                                                                     | `arn:aws:apigateway:REGION::/domainnames`, `arn:aws:apigateway:REGION::/domainnames/*` |

## Pre-apply Checklist

- [ ] AWS credentials configured
- [ ] Terraform initialized (`terraform init`)
- [ ] Plan reviewed (`terraform plan`)
- [ ] Changes expected and understood
- [ ] Backup of state (if critical changes)
- [ ] Correct workspace selected (if using workspaces)

## Terraform Workflow

### Making Infrastructure Changes

```powershell
# 1. Navigate to terraform directory
cd terraform

# 2. Edit .tf files
# Make your infrastructure changes

# 3. Format and validate
terraform fmt
terraform validate

# 4. Plan changes
terraform plan

# 5. Review plan carefully
# Ensure changes are expected

# 6. Apply if plan looks good
terraform apply

# 7. Commit changes
git add .
git commit -m "infra: add new Lambda function"
```

### Updating Existing Resources

```powershell
# 1. Modify terraform configuration
# Edit terraform/*.tf files

# 2. Plan to see what will change
terraform plan

# 3. If only updating one resource
terraform apply -target=aws_lambda_function.db

# 4. Verify in AWS Console
# Check resource is updated correctly
```

### Destroying Resources (Careful!)

```powershell
# Plan destruction
terraform plan -destroy

# Destroy specific resource
terraform destroy -target=aws_lambda_function.old_function

# Destroy everything (VERY CAREFUL!)
terraform destroy
```

## Integration with Workflow

### After PR Merge with Terraform Changes

```powershell
# 1. Pull latest changes
git checkout main
git pull

# 2. Initialize (if provider changes)
cd terraform
terraform init

# 3. Plan changes
terraform plan

# 4. Apply if plan looks good
terraform apply

# 5. Verify resources in AWS Console
```

### Adding New Lambda Function

```powershell
# 1. Create Lambda .tf file
# New file: terraform/lambda-new-function.tf

# 2. Define resource
# Write terraform configuration

# 3. Plan
terraform plan

# 4. Apply
terraform apply

# 5. Deploy Lambda code
.\scripts\deploy-lambda.ps1 -FunctionName new-function
```

> **Terraform operations & state management** (view/import/refresh resources, state management, file structure, sensitive resources): see [terraform-state-and-operations.md](terraform-state-and-operations.md)

## Exit Codes

- **0**: Apply successful
- **Non-zero**: Apply failed (check error message)

## Related Skills

- [Lambda Deployment](deploy-lambda.md) - Deploying Lambda code
- [Database Connection](../../db-connect/SKILL.md) - Testing infrastructure
- [Validate Workspace](../../validate-workspace/SKILL.md) - Pre-deployment checks

## Related Documentation

- [AWS Infrastructure](../../../../docs/deployment/aws-infrastructure.md)
- [Terraform Lambda Deployment](../../../../docs/deployment/terraform/terraform-lambda-deployment.md)
- [Terraform State Management](../../../../docs/deployment/terraform/terraform-state-solution.md)
- [Deployment Security](../../../../docs/deployment/deployment-security.md)

## Security Notes

CRITICAL:

- Never commit AWS credentials
- Never commit terraform.tfstate (use remote state)
- Review plans carefully before applying
- Use least-privilege IAM permissions
- Backup state before major changes
- Test in dev before production
- Document all infrastructure changes
