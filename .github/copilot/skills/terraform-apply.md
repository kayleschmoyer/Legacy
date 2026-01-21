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

## Command

```powershell
# Apply Terraform changes
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

## Expected Output
- **Plan**: List of resources to create, update, or destroy
- **Apply**: Progress of resource changes
- **Success**: "Apply complete! Resources: X added, Y changed, Z destroyed"

## Common Issues

### Issue: State lock error
**Symptom**: "Error acquiring the state lock"
**Solution**: Wait for lock to release or force unlock
```powershell
# Check who has the lock (if multi-user)
terraform force-unlock <lock-id>

# Or use script
pnpm run terraform:unlock
```

### Issue: AWS credentials not configured
**Symptom**: "No valid credential sources found"
**Solution**: Configure AWS credentials
```powershell
# Set environment variables
$env:AWS_ACCESS_KEY_ID = "your-key"
$env:AWS_SECRET_ACCESS_KEY = "your-secret"
$env:AWS_REGION = "us-east-1"

# Or use AWS CLI
aws configure
```

### Issue: Terraform state drift
**Symptom**: Plan shows unexpected changes
**Solution**: Review changes and refresh state
```powershell
# Refresh state from AWS
terraform refresh

# View diff
terraform plan

# If changes are expected, apply them
terraform apply
```

### Issue: Resource already exists
**Symptom**: "Resource already exists"
**Solution**: Import existing resource to state
```powershell
# Import existing resource
terraform import aws_lambda_function.db legacy-sports-dev-db

# Then apply
terraform apply
```

### Issue: Terraform version mismatch
**Symptom**: "Required version constraint"
**Solution**: Use correct Terraform version
```powershell
# Check version
terraform version

# Install correct version or use tfenv
# See required version in terraform/versions.tf
```

## Best Practices
1. **Always run plan first** - Review changes before applying
2. **Use version control** - Commit Terraform files
3. **Never force-unlock** unless sure lock is stale
4. **Backup state** - Keep state file safe
5. **Use workspaces** - Separate dev/staging/prod
6. **Review changes** - Understand what will change
7. **Apply incrementally** - Use -target for large changes

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
.\scripts\deploy-lambda.ps1 -LambdaName new-function
```

## Common Terraform Operations

### View Resources
```powershell
# List all resources
terraform state list

# Show specific resource
terraform state show aws_lambda_function.db

# Show outputs
terraform output
```

### Import Existing Resources
```powershell
# Import existing AWS resource to state
terraform import aws_lambda_function.db legacy-sports-dev-db

# Import with -target
terraform import -target=aws_lambda_function.db \
  aws_lambda_function.db legacy-sports-dev-db
```

### Refresh State
```powershell
# Update state from AWS (no changes)
terraform refresh

# Refresh specific resource
terraform refresh -target=aws_lambda_function.db
```

## Terraform State Management

### State Location
- **Remote**: S3 bucket (configured in backend.tf)
- **Lock**: DynamoDB table for locking
- **Local**: `.terraform/` directory (gitignored)

### State Commands
```powershell
# List resources
terraform state list

# Remove resource from state (doesn't destroy)
terraform state rm aws_lambda_function.old

# Move resource in state
terraform state mv aws_lambda_function.old aws_lambda_function.new
```

## Terraform File Structure

```
terraform/
├── main.tf              # Main configuration
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── backend.tf           # Remote state configuration
├── versions.tf          # Terraform version constraints
├── lambda-*.tf          # Lambda configurations
├── database.tf          # Database resources
├── networking.tf        # VPC, subnets, etc.
└── security.tf          # Security groups, IAM
```

## Sensitive Resources

**Extra caution needed**:
- 🔴 **Database** - Don't destroy accidentally
- 🔴 **State bucket** - Contains all state
- 🔴 **IAM roles** - Can break access
- 🟡 **Lambdas** - Can disrupt service
- 🟡 **API Gateway** - Can break API

## Exit Codes
- **0**: Apply successful
- **Non-zero**: Apply failed (check error message)

## Related Skills
- [Lambda Deployment](deploy-lambda.md) - Deploying Lambda code
- [Database Connection](db-connect.md) - Testing infrastructure
- [Validate Workspace](validate-workspace.md) - Pre-deployment checks

## Related Documentation
- [AWS Infrastructure](../../../docs/deployment/aws-infrastructure.md)
- [Terraform Lambda Deployment](../../../docs/deployment/terraform/terraform-lambda-deployment.md)
- [Terraform State Management](../../../docs/deployment/terraform/terraform-state-solution.md)
- [Deployment Security](../../../docs/deployment/deployment-security.md)

## Security Notes

⚠️ **CRITICAL**:
- Never commit AWS credentials
- Never commit terraform.tfstate (use remote state)
- Review plans carefully before applying
- Use least-privilege IAM permissions
- Backup state before major changes
- Test in dev before production
- Document all infrastructure changes
