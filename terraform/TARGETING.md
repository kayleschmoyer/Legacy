# Terraform Targeting Quick Reference

This document provides examples of how to deploy specific parts of the Legacy Sports infrastructure using Terraform targeting.

## Basic Usage

### PowerShell (Windows)

```powershell
# Deploy everything
.\deploy.ps1

# Deploy only specific resource categories
.\deploy.ps1 -TargetResources vpc,secrets

# Deploy specific individual resources
.\deploy.ps1 -TargetResources aws_vpc.main,aws_security_group.lambda

# List all available targets
.\deploy.ps1 -ListTargets

# Plan only (don't apply)
.\deploy.ps1 -PlanOnly

# Skip building Lambda packages
.\deploy.ps1 -SkipBuild
```

### Bash (Linux/Mac)

```bash
# Deploy everything
./deploy.sh

# Deploy only specific resource categories
./deploy.sh --target vpc,secrets

# Deploy specific individual resources
./deploy.sh --target aws_vpc.main,aws_security_group.lambda

# List all available targets
./deploy.sh --list-targets

# Plan only (don't apply)
./deploy.sh --plan-only

# Skip building Lambda packages
./deploy.sh --skip-build
```

## Common Deployment Scenarios

### 1. Initial Infrastructure Setup (Foundation First)

Deploy core networking and security components first:

**PowerShell:**

```powershell
# Step 1: VPC and networking
.\deploy.ps1 -TargetResources vpc

# Step 2: Security groups
.\deploy.ps1 -TargetResources security-groups

# Step 3: Secrets
.\deploy.ps1 -TargetResources secrets
```

**Bash:**

```bash
# Step 1: VPC and networking
./deploy.sh --target vpc

# Step 2: Security groups
./deploy.sh --target security-groups

# Step 3: Secrets
./deploy.sh --target secrets
```

### 2. Database Only

Deploy just the database infrastructure:

**PowerShell:**

```powershell
.\deploy.ps1 -TargetResources database
```

**Bash:**

```bash
./deploy.sh --target database
```

### 3. Lambda Functions Only

Deploy just the Lambda functions (requires VPC, security groups, and IAM roles to exist):

**PowerShell:**

```powershell
# Deploy Lambda IAM roles first
.\deploy.ps1 -TargetResources lambda-iam

# Then deploy Lambda functions
.\deploy.ps1 -TargetResources lambda-functions,lambda-logs
```

**Bash:**

```bash
# Deploy Lambda IAM roles first
./deploy.sh --target lambda-iam

# Then deploy Lambda functions
./deploy.sh --target lambda-functions,lambda-logs
```

### 4. API Gateway Only

Deploy just the API Gateway (requires Lambda functions to exist):

**PowerShell:**

```powershell
.\deploy.ps1 -TargetResources api-gateway,api-gateway-methods,api-gateway-integrations,lambda-permissions
```

**Bash:**

```bash
./deploy.sh --target api-gateway,api-gateway-methods,api-gateway-integrations,lambda-permissions
```

### 5. Development Workflow

For development, you might want to update only Lambda functions:

**PowerShell:**

```powershell
# Update Lambda functions without rebuilding packages
.\deploy.ps1 -SkipBuild -TargetResources lambda-functions
```

**Bash:**

```bash
# Update Lambda functions without rebuilding packages
./deploy.sh --skip-build --target lambda-functions
```

## Resource Categories

| Category                   | Description                          | Resources Included                                  |
| -------------------------- | ------------------------------------ | --------------------------------------------------- |
| `vpc`                      | Virtual Private Cloud and networking | VPC, subnets, NAT gateways, route tables            |
| `security-groups`          | Security group definitions           | Lambda, RDS, RDS Proxy, API Gateway security groups |
| `secrets`                  | AWS Secrets Manager secrets          | Database creds, JWT secret, OAuth secrets           |
| `database`                 | RDS PostgreSQL and proxy             | RDS instance, RDS proxy, subnet groups, IAM roles   |
| `sqs`                      | SQS queue for stats processing       | Main queue, dead letter queue, policies             |
| `s3`                       | S3 bucket for Lambda packages        | Deployment bucket with encryption and policies      |
| `lambda-layer`             | Lambda layer for Node.js PostgreSQL  | Shared layer for database connectivity              |
| `lambda-iam`               | IAM roles for Lambda functions       | Execution roles and policies                        |
| `lambda-functions`         | Lambda function definitions          | All 6 Lambda functions and SQS event mapping        |
| `lambda-logs`              | CloudWatch log groups                | Log groups for all Lambda functions                 |
| `api-gateway`              | API Gateway core resources           | REST API, deployment, stage, resources              |
| `api-gateway-methods`      | API Gateway methods                  | HTTP methods for all endpoints                      |
| `api-gateway-integrations` | API Gateway integrations             | Lambda integrations and CORS                        |
| `lambda-permissions`       | Lambda invoke permissions            | Permissions for API Gateway to invoke Lambda        |

## Dependencies

Some resources depend on others. Deploy in this order for best results:

1. **Foundation**: `vpc`, `security-groups`, `secrets`, `s3`
2. **Database**: `database`
3. **Compute**: `lambda-layer`, `lambda-iam`, `lambda-logs`, `lambda-functions`
4. **API**: `api-gateway`, `api-gateway-methods`, `api-gateway-integrations`, `lambda-permissions`
5. **Messaging**: `sqs`

## Direct Terraform Commands

You can also use Terraform directly for more control:

```bash
# Target specific resources directly
terraform plan -target=aws_vpc.main -target=aws_security_group.lambda

terraform apply -target=aws_lambda_function.graphql -auto-approve

# Target entire modules (if using modules)
terraform apply -target=module.database

# Apply everything except specific resources
terraform apply -target='!aws_lambda_function.stats_load_career'
```

## Troubleshooting

### Resource Dependencies

If you get dependency errors, add the dependent resources to your target list:

```bash
# If targeting Lambda functions fails due to missing IAM roles
./deploy.sh --target lambda-iam,lambda-functions
```

### Checking What Will Be Created

Always use `-PlanOnly` or `--plan-only` first to see what will be created:

```powershell
.\deploy.ps1 -PlanOnly -TargetResources vpc
```

### Updating Existing Resources

To update existing resources without creating new ones:

```bash
terraform apply -target=aws_lambda_function.graphql -refresh-only
```
