# S3-Based Lambda Deployment

This document describes the new S3-based Lambda deployment approach that eliminates the need for committing build artifacts back to the repository.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CI/CD Build   │───▶│   S3 Bucket      │───▶│   Lambda        │
│   (GitHub)      │    │   (Versioned)    │    │   Functions     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   SSM Params    │    │   Terraform      │    │   AWS Lambda    │
│   (Versions)    │    │   (Infrastructure)│    │   (Execution)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🔄 Deployment Flow

### 1. Build Phase (CI/CD)
- Build Lambda function code
- Create versioned ZIP package (`function-YYYYMMDD-HHMMSS-githash.zip`)
- Upload package to S3 with versioned key
- Update SSM parameter with new version

### 2. Deploy Phase (Terraform)
- Read current version from SSM parameter
- Reference S3 object in Lambda function configuration
- Apply infrastructure changes

## 📦 Components

### S3 Bucket Structure
```
legacy-sports-dev-lambdas-{random}/
├── graphql/
│   ├── graphql-20240912-143022-abc123.zip
│   └── graphql-20240912-144305-def456.zip
├── stats/
│   ├── stats-20240912-143022-abc123.zip
│   └── stats-20240912-144305-def456.zip
└── oauth-proxy/
    ├── oauth-proxy-20240912-143022-abc123.zip
    └── oauth-proxy-20240912-144305-def456.zip
```

### SSM Parameters
```
/legacy-sports/dev/s3/lambda-deployments-bucket
/legacy-sports/dev/lambda/graphql/version
/legacy-sports/dev/lambda/stats/version
/legacy-sports/dev/lambda/oauth-proxy/version
/legacy-sports/dev/lambda/game-selection/version
```

## 🚀 Usage

### Manual Deployment

```bash
# Deploy single function
./scripts/deploy-lambda.sh graphql

# Deploy all functions
./scripts/deploy-lambda-all.sh

# Then apply infrastructure changes
cd terraform
terraform plan
terraform apply
```

### PowerShell (Windows)
```powershell
# Deploy single function
.\scripts\deploy-lambda.ps1 -FunctionName graphql

# Deploy all functions
.\scripts\deploy-lambda-all.ps1

# Then apply infrastructure changes
cd terraform
terraform plan
terraform apply
```

### CI/CD Deployment

GitHub Actions workflows automatically:
1. Build Lambda packages
2. Upload to S3 with versioned names
3. Update SSM parameters
4. Apply Terraform changes

## 🎯 Benefits

### ✅ Advantages
- **No commits back to repo**: Clean git history
- **Versioned artifacts**: Easy rollback capability
- **Audit trail**: S3 versioning shows deployment history
- **Faster deployments**: No rebuilding in Terraform
- **Parallel builds**: Build once, deploy to multiple environments
- **Infrastructure as Code**: Terraform focuses on infrastructure, not builds

### 🔧 Configuration

#### Lambda Function (Terraform)
```hcl
data "aws_ssm_parameter" "graphql_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/graphql/version"
}

resource "aws_lambda_function" "graphql" {
  s3_bucket         = aws_s3_bucket.lambda_deployments.bucket
  s3_key           = "graphql/graphql-${data.aws_ssm_parameter.graphql_lambda_version.value}.zip"
  source_code_hash = data.aws_ssm_parameter.graphql_lambda_version.value
  # ... other configuration
}
```

#### CI/CD Workflow
```yaml
- name: Deploy Lambda
  run: |
    VERSION="${TIMESTAMP}-${COMMIT_SHA}"
    zip -r "function-${VERSION}.zip" dist/
    aws s3 cp "function-${VERSION}.zip" "s3://${S3_BUCKET}/function/"
    aws ssm put-parameter --name "/lambda/function/version" --value "$VERSION" --overwrite
    terraform apply -target=aws_lambda_function.function -auto-approve
```

## 🔍 Troubleshooting

### Common Issues

**SSM Parameter not found**:
- Ensure Terraform is applied to create SSM parameters
- Check parameter name format matches environment

**S3 bucket access denied**:
- Verify IAM permissions for S3 and SSM
- Check bucket policy and CORS settings

**Lambda deployment fails**:
- Verify ZIP package structure
- Check CloudWatch logs for execution errors
- Ensure environment variables are set correctly

### Rollback Process

```bash
# Get previous version
PREV_VERSION=$(aws ssm get-parameter-history --name "/legacy-sports/dev/lambda/graphql/version" --max-items 2 --query "Parameters[1].Value" --output text)

# Update SSM parameter to previous version
aws ssm put-parameter --name "/legacy-sports/dev/lambda/graphql/version" --value "$PREV_VERSION" --overwrite

# Apply Terraform to rollback
cd terraform
terraform apply -target=aws_lambda_function.graphql -auto-approve
```

## 📚 Migration from Previous Setup

1. ✅ **Terraform files updated**: Local file references → S3 references
2. ✅ **SSM parameters created**: Version tracking infrastructure
3. ✅ **Scripts created**: Manual deployment capabilities
4. ✅ **CI/CD updated**: GitHub Actions workflows updated
5. ✅ **Nx configuration updated**: Project.json files updated

### Next Steps After Implementation

1. **Apply Terraform changes**:
   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

2. **Initial deployment**:
   ```bash
   ./scripts/deploy-lambda-all.sh
   ```

3. **Update CI/CD**:
   - Test GitHub Actions workflows
   - Verify S3 uploads and SSM updates

## 🎉 Result

- ✅ No more commits back to repository
- ✅ Proper infrastructure as code
- ✅ Versioned artifact management
- ✅ Easy rollback capabilities
- ✅ Clean separation of build and deploy phases