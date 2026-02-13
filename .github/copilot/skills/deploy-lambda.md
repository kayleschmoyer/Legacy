# Skill: Lambda Deployment

## Overview

Deploy AWS Lambda functions to cloud environment using deployment scripts.

## ⚠️ CRITICAL: Deployment Prerequisites

**ALWAYS follow this order**:

1. **Clear Terraform locks** (if deploying infrastructure)
2. **Deploy infrastructure first** (if terraform changes exist)
3. **Then deploy Lambda code**

```powershell
# Complete deployment workflow:
node scripts/terraform-unlock.js    # Clear any locks
cd terraform
terraform plan                      # Check infrastructure changes
terraform apply                     # Apply if needed
cd ..
.\scripts\deploy-lambda.ps1 -FunctionName graphql  # Deploy code
```

## When to Use

- After Lambda code changes are merged
- Deploying hotfixes to production
- Initial Lambda setup
- Updating Lambda configuration
- Rolling back to previous version

## Standard Command

```powershell
# Deploy specific Lambda function (MOST COMMON)
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

**Available Functions**: `graphql`, `oauth-proxy`, `stats`, `game-selection`, `draft-processor`

**Note**: The `graphql` function is built from the `lambdas/db` directory (the db project contains the GraphQL Lambda).

## Alternative Commands

### Deploy All Lambdas

```powershell
# Deploy all Lambda functions
.\scripts\deploy-lambda-all.ps1
```

### Deploy Single Lambda

```powershell
# Deploy specific Lambda (db/graphql Lambda)
.\scripts\deploy-lambda.ps1 -FunctionName graphql
# Other Lambdas
.\scripts\deploy-lambda.ps1 -FunctionName oauth-proxy
.\scripts\deploy-lambda.ps1 -FunctionName stats
.\scripts\deploy-lambda.ps1 -FunctionName game-selection
.\scripts\deploy-lambda.ps1 -FunctionName draft-processor
```

### Deploy with Options

```powershell
# Deploy to specific environment
.\scripts\deploy-lambda.ps1 -FunctionName graphql -Environment production

# Deploy with different AWS region
.\scripts\deploy-lambda.ps1 -FunctionName graphql -AwsRegion us-west-2
```

## Expected Output

- **Build**: "Building Lambda function..."
- **Package**: "Creating deployment package..."
- **Upload**: "Uploading to AWS..."
- **Deploy**: "Lambda function updated successfully"
- **Version**: New Lambda version number

## Common Issues

### Issue: Wrong parameter name ❌

**Symptom**: "A parameter cannot be found that matches parameter name"
**Cause**: Using wrong parameter name like `-Lambda`, `-LambdaName`, or `-Name`
**Solution**: Use `-FunctionName` (the only correct parameter name)

```powershell
# ❌ WRONG - all of these will fail
.\scripts\deploy-lambda.ps1 -Lambda stats
.\scripts\deploy-lambda.ps1 -LambdaName db
.\scripts\deploy-lambda.ps1 -Name graphql

# ✅ CORRECT
.\scripts\deploy-lambda.ps1 -FunctionName graphql
.\scripts\deploy-lambda.ps1 -FunctionName stats
.\scripts\deploy-lambda.ps1 -FunctionName game-selection
```

### Issue: Terraform state locked

**Symptom**: Deployment fails with "Error acquiring the state lock"
**Cause**: Previous terraform operation was interrupted
**Solution**: Clear the lock first

```powershell
# Clear lock, then retry deployment
node scripts/terraform-unlock.js
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

### Issue: Build fails before deployment

**Symptom**: "Build failed" or TypeScript compilation errors
**Cause**: Code doesn't compile or has lint errors
**Solution**: Fix errors before deploying

```powershell
# Check for errors
pnpm exec nx run db:typecheck
pnpm exec nx run db:lint

# Fix errors, then deploy
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

### Issue: AWS credentials not configured

**Symptom**: "Unable to locate credentials"
**Solution**: Configure AWS credentials

```powershell
# Configure AWS CLI
aws configure

# Or set environment variables
$env:AWS_ACCESS_KEY_ID = "your-key"
$env:AWS_SECRET_ACCESS_KEY = "your-secret"
$env:AWS_REGION = "us-east-1"

# Verify
aws sts get-caller-identity
```

### Issue: Build fails before deployment

**Symptom**: TypeScript errors or build errors
**Solution**: Fix build issues locally first

```powershell
# Test build locally
pnpm exec nx build <lambda-name>

# Fix any errors
pnpm exec nx affected -t typecheck
pnpm exec nx affected -t lint --fix

# Then deploy
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

### Issue: Lambda package too large

**Symptom**: "Deployment package exceeds size limit"
**Solution**: Check dependencies and exclude unnecessary files

```powershell
# Check package contents
# Ensure only necessary files included
# Check lambdas/<lambda-name>/project.json includeFiles

# Remove unused dependencies
pnpm prune

# Then rebuild and deploy
```

### Issue: Permission errors during deployment

**Symptom**: "Access denied" or insufficient permissions
**Solution**: Verify IAM permissions

```powershell
# Check current IAM identity
aws sts get-caller-identity

# Ensure you have:
# - lambda:UpdateFunctionCode
# - lambda:GetFunction
# - s3:PutObject (if using S3)
# Contact DevOps if missing permissions
```

### Issue: Environment variables not updated

**Symptom**: Lambda has old environment variables
**Solution**: Update Lambda environment separately

```powershell
# Use AWS Console or CLI to update env vars
# Or use Terraform to manage configuration
cd terraform
terraform apply
```

### Issue: Terraform can't find S3 deployment package

**Symptom**: "Error occurred while GetObject. S3 Error Code: NoSuchKey"
**Solution**: Verify S3 path matches Terraform expectations

**Root Cause**: The `db` Lambda deploys to `db/` S3 prefix but Terraform expects `graphql/` prefix with filename `graphql-{version}.zip`

```powershell
# 1. Check what was uploaded
$version = aws ssm get-parameter --name "/legacy-sports/dev/lambda/graphql/version" --query 'Parameter.Value' --output text
aws s3 ls s3://legacy-sports-dev-lambdas-cca20ad9/graphql/ | Select-String $version

# 2. If file not found at graphql/ prefix, copy from db/
aws s3 cp `
  s3://legacy-sports-dev-lambdas-cca20ad9/db/db-$version.zip `
  s3://legacy-sports-dev-lambdas-cca20ad9/graphql/graphql-$version.zip

# 3. Now run terraform apply
cd terraform
terraform apply -auto-approve
```

**Prevention**: After deploying db Lambda, always verify S3 location before running Terraform

```powershell
# Complete deployment workflow for db Lambda:
# 1. Build and deploy
.\scripts\deploy-lambda.ps1 -FunctionName graphql

# 2. Get version that was just deployed
$version = aws ssm get-parameter --name "/legacy-sports/dev/lambda/graphql/version" --query 'Parameter.Value' --output text

# 3. Copy to correct S3 location for Terraform
aws s3 cp `
  s3://legacy-sports-dev-lambdas-cca20ad9/db/db-$version.zip `
  s3://legacy-sports-dev-lambdas-cca20ad9/graphql/graphql-$version.zip

# 4. Apply Terraform changes
cd terraform
terraform apply -auto-approve
cd ..
```

## Best Practices

1. **Test locally first** - Run Lambda locally before deploying
2. **Deploy to dev first** - Test in dev environment before production
3. **Backup before deploy** - Note current version for rollback
4. **Monitor after deploy** - Check CloudWatch logs for errors
5. **Use versioning** - Keep track of deployed versions

## Pre-deployment Checklist

- [ ] Code changes tested locally
- [ ] All tests pass (`pnpm exec nx run <lambda>:test`)
- [ ] Build succeeds (`pnpm exec nx build <lambda>`)
- [ ] Environment variables updated (if needed)
- [ ] Terraform state current (if infrastructure changed)
- [ ] AWS credentials configured
- [ ] Correct environment targeted
- [ ] **(For db Lambda)**: S3 copy step planned (db/ → graphql/ prefix)

## Deployment Process

### Full Deployment Workflow

```powershell
# 1. Verify changes locally
pnpm exec nx run db:serve  # Test locally
pnpm exec nx run db:test   # Run tests
pnpm exec nx build db      # Test build

# 2. Deploy to dev environment
.\scripts\deploy-lambda.ps1 -FunctionName graphql -Environment dev

# 3. For db Lambda: Copy to Terraform-expected S3 location
$version = aws ssm get-parameter --name "/legacy-sports/dev/lambda/graphql/version" --query 'Parameter.Value' --output text
aws s3 cp `
  s3://legacy-sports-dev-lambdas-cca20ad9/db/db-$version.zip `
  s3://legacy-sports-dev-lambdas-cca20ad9/graphql/graphql-$version.zip

# 4. Apply Terraform to update Lambda function
cd terraform
terraform apply -auto-approve
cd ..

# 5. Test in dev environment
# Make API calls to dev endpoint
# Check CloudWatch logs

# 6. If successful, repeat for production
.\scripts\deploy-lambda.ps1 -FunctionName graphql -Environment production
# ... repeat S3 copy and terraform apply for production
```

### Deploy All Lambdas

```powershell
# Deploy all Lambda functions at once
.\scripts\deploy-lambda-all.ps1

# This deploys:
# - db (GraphQL API)
# - oauth-proxy (Authentication)
# - stats-lambda (Statistics processing)
# - game-selection (Game selection logic)
# - draft-processor (Draft processing)
```

## Integration with Workflow

### After PR Merge

```powershell
# 1. Pull latest changes
git checkout main
git pull

# 2. Deploy Lambda that changed
.\scripts\deploy-lambda.ps1 -FunctionName graphql

# 3. Update Jira ticket
acli jira workitem transition --key LS-1234 --status "Done"
acli jira workitem comment create --key LS-1234 \
  --body "Deployed to production: Lambda version 123"
```

### Hotfix Deployment

```powershell
# 1. Create hotfix branch
git checkout -b hotfix/LS-1234

# 2. Make fix and test
# ... code changes ...

# 3. Build and test
pnpm exec nx build <lambda-name>
pnpm exec nx test <lambda-name>

# 4. Deploy directly (if urgent)
.\scripts\deploy-lambda.ps1 -FunctionName <lambda-name> -Environment production

# 5. Create PR afterward
twig github pr create-pr
```

## Rollback

### Rolling Back a Deployment

```powershell
# 1. Find previous version
aws lambda list-versions-by-function --function-name legacy-sports-dev-db

# 2. Update alias to previous version
aws lambda update-alias \
  --function-name legacy-sports-dev-db \
  --name prod \
  --function-version <previous-version>

# 3. Verify rollback successful
# Test API endpoints
```

## Monitoring After Deployment

### Check Lambda Logs

```powershell
# View recent logs
aws logs tail /aws/lambda/legacy-sports-dev-db --follow

# View errors only
aws logs tail /aws/lambda/legacy-sports-dev-db --filter-pattern "ERROR"
```

### Check Lambda Status

```powershell
# Get Lambda configuration
aws lambda get-function --function-name legacy-sports-dev-db

# Check invocation metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=legacy-sports-dev-db \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## Lambda Locations

```
lambdas/
├── db/                  # GraphQL API Lambda
├── oauth-proxy/         # Authentication Lambda
├── stats-lambda/        # Statistics processing
├── game-selection/      # Game selection logic
├── draft-processor/     # Draft processing
└── notifications/       # Notifications (if added)
```

## Deployment Artifacts

After deployment, artifacts stored in:

- **S3 Bucket**: Deployment packages
- **Lambda**: Updated function code
- **CloudWatch**: Deployment logs
- **Terraform State**: Infrastructure state

## Exit Codes

- **0**: Deployment successful
- **Non-zero**: Deployment failed (check error message)

## Related Skills

- [Building](build.md) - Building Lambda before deploy
- [Testing](test.md) - Testing Lambda before deploy
- [Terraform Apply](terraform-apply.md) - Infrastructure changes

## Related Documentation

- [Lambda Build Strategy](../../../docs/deployment/lambda-build-strategy.md)
- [AWS Infrastructure](../../../docs/deployment/aws-infrastructure.md)
- [Deployment Security](../../../docs/deployment/deployment-security.md)

## Security Notes

⚠️ **Important**:

- Never commit AWS credentials
- Use IAM roles with least privilege
- Test in dev before production
- Monitor logs after deployment
- Keep deployment scripts secure
- Rotate credentials regularly
