# Deployment Guide: Troubleshooting, Process, and Rollback

## Alternative Commands

### Deploy All Lambdas

```powershell
.\scripts\deploy-lambda-all.ps1
```

### Deploy with Options

```powershell
.\scripts\deploy-lambda.ps1 -FunctionName graphql -Environment production
.\scripts\deploy-lambda.ps1 -FunctionName graphql -AwsRegion us-west-2
```

## Common Issues

### Wrong parameter name

**Symptom**: "A parameter cannot be found that matches parameter name"

```powershell
# WRONG
.\scripts\deploy-lambda.ps1 -Lambda stats
.\scripts\deploy-lambda.ps1 -LambdaName db
.\scripts\deploy-lambda.ps1 -Name graphql

# CORRECT
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

### Terraform state locked

```powershell
node scripts/terraform-unlock.js
.\scripts\deploy-lambda.ps1 -FunctionName graphql
```

### Build fails before deployment

```powershell
pnpm exec nx run db:typecheck
pnpm exec nx run db:lint
# Fix errors, then deploy
```

### AWS credentials not configured

```powershell
aws sts get-caller-identity
aws configure  # If not configured
```

### Deployed Lambda is missing new code (stale Nx cache)

**Symptom**: 400 Bad Request errors like `Cannot query field "newMutation"` despite the code existing in source.

```powershell
pnpm exec nx run db:build --skip-nx-cache
Select-String -Path lambdas/db/dist/index.js -Pattern "yourNewFunctionName"
.\scripts\deploy-lambda.ps1 -FunctionName graphql
terraform -chdir=terraform apply -target="aws_lambda_function.graphql" -auto-approve
```

### Lambda package too large

Check `lambdas/<lambda-name>/project.json` includeFiles. Run `pnpm prune` to remove unused deps.

### Permission errors

```powershell
aws sts get-caller-identity
# Ensure: lambda:UpdateFunctionCode, lambda:GetFunction, s3:PutObject
```

### Terraform can't find S3 deployment package

**Symptom**: "Error occurred while GetObject. S3 Error Code: NoSuchKey"
**Root Cause**: The `db` Lambda deploys to `db/` S3 prefix but Terraform expects `graphql/` prefix.

```powershell
$version = aws ssm get-parameter --name "/legacy-sports/dev/lambda/graphql/version" --query 'Parameter.Value' --output text
aws s3 cp `
  s3://legacy-sports-dev-lambdas-cca20ad9/db/db-$version.zip `
  s3://legacy-sports-dev-lambdas-cca20ad9/graphql/graphql-$version.zip
terraform -chdir=terraform apply -auto-approve
```

## Full Deployment Workflow

```powershell
# 1. Verify locally
pnpm exec nx run db:serve   # Test locally
pnpm exec nx run db:test    # Run tests
pnpm exec nx run db:build --skip-nx-cache  # ALWAYS skip cache

# 2. Deploy to dev
.\scripts\deploy-lambda.ps1 -FunctionName graphql -Environment dev

# 3. For db Lambda: Copy to Terraform-expected S3 location
$version = aws ssm get-parameter --name "/legacy-sports/dev/lambda/graphql/version" --query 'Parameter.Value' --output text
aws s3 cp `
  s3://legacy-sports-dev-lambdas-cca20ad9/db/db-$version.zip `
  s3://legacy-sports-dev-lambdas-cca20ad9/graphql/graphql-$version.zip

# 4. Apply Terraform
terraform -chdir=terraform apply -auto-approve

# 5. Test and check logs
.\scripts\aws-logs.ps1 -Function graphql -Since 15m

# 6. If successful, repeat for production
```

### After PR Merge

```powershell
git checkout main; git pull
.\scripts\deploy-lambda.ps1 -FunctionName graphql
acli jira workitem transition --key LS-1234 --status "Done"
```

### Hotfix Deployment

```powershell
git checkout -b hotfix/LS-1234
# ... make fix and test ...
pnpm exec nx build <lambda-name>; pnpm exec nx test <lambda-name>
.\scripts\deploy-lambda.ps1 -FunctionName <lambda-name> -Environment production
gh pr create --title "LS-1234 fix(scope): description" --body-file ".github/tmp-pr-body.md" --base main
```

## Rollback

```powershell
aws lambda list-versions-by-function --function-name legacy-sports-dev-db
aws lambda update-alias --function-name legacy-sports-dev-db --name prod --function-version <previous-version>
```

## Monitoring After Deployment

```powershell
aws logs tail /aws/lambda/legacy-sports-dev-db --follow
aws logs tail /aws/lambda/legacy-sports-dev-db --filter-pattern "ERROR"
aws lambda get-function --function-name legacy-sports-dev-db
```

## Pre-deployment Checklist

- [ ] Code changes tested locally
- [ ] All tests pass (`pnpm exec nx run <lambda>:test`)
- [ ] Fresh build with `--skip-nx-cache`
- [ ] Verified new code is in build output
- [ ] Environment variables updated (if needed)
- [ ] Terraform state current (if infrastructure changed)
- [ ] AWS credentials configured
- [ ] Correct environment targeted
- [ ] (For db Lambda): S3 copy step planned

## Lambda Locations

| Directory                  | Function         |
| -------------------------- | ---------------- |
| `lambdas/db/`              | GraphQL API      |
| `lambdas/oauth-proxy/`     | Authentication   |
| `lambdas/stats-lambda/`    | Stats processing |
| `lambdas/game-selection/`  | Game selection   |
| `lambdas/draft-processor/` | Draft processing |
