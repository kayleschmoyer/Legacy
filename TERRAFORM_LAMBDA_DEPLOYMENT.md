# Modern Terraform-based Lambda Deployment Guide

This project now uses **Terraform** instead of Serverless Framework for managing AWS Lambda deployments, providing better infrastructure as code practices and integration with existing infrastructure.

## Architecture Overview

- **Build System**: Vite 6.3.5 with SSR configuration for Node.js Lambda targets
- **GraphQL Server**: Apollo Server with Pothos schema builder
- **Infrastructure**: Terraform-managed API Gateway, Lambda, IAM roles, and networking
- **Database**: PostgreSQL with RDS Proxy integration
- **Deployment**: Single `terraform apply` command deploys everything

## Quick Start

### 1. Build and Deploy with Nx

```bash
# Plan the deployment (shows what will change)
nx deploy:plan db

# Deploy infrastructure and Lambda
nx deploy db

# Test the deployed endpoint
nx test-endpoint db

# View live logs
nx logs db
```

### 2. Alternative: Direct Terraform Commands

```bash
# Navigate to terraform directory
cd terraform

# Deploy infrastructure and Lambda
terraform apply -auto-approve
```

The Terraform configuration automatically:

- Builds the Lambda using Vite (via `null_resource`)
- Creates the deployment package (.zip)
- Deploys Lambda with proper VPC, IAM, and environment configuration
- Sets up API Gateway with CORS support
- Configures CloudWatch logging

### 2. Test the Endpoint

```bash
# Test the GraphQL endpoint
curl -X POST "https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hello }"}'

# Expected response:
# {"data":{"hello":"Hello from Pothos + Drizzle!"}}
```

### 3. Update Code and Redeploy

When you make changes to the Lambda code:

```bash
# Using Nx (recommended)
nx deploy db

# Or using Terraform directly
# Terraform automatically detects changes and rebuilds
terraform apply -auto-approve
```

## Available Nx Commands

The project includes several Nx targets for managing the Lambda deployment:

### Core Commands

- `nx deploy db` - Build and deploy the Lambda with Terraform
- `nx deploy:plan db` - Show deployment plan without applying changes
- `nx build db` - Build the Lambda code only (without deployment)

### Testing & Monitoring

- `nx test-endpoint db` - Test the deployed GraphQL endpoint
- `nx logs db` - View live CloudWatch logs from the Lambda
- `nx serve db` - Run the GraphQL server locally for development

### Legacy Commands

- `nx package db` - Legacy command (now shows migration message)

## Key Improvements Over Serverless Framework

### Modern Build Configuration

- **Vite SSR Mode**: Optimized for Node.js Lambda runtime
- **Full Dependency Bundling**: All npm dependencies included in deployment package
- **Source Map Support**: Better debugging in CloudWatch logs
- **Fast Rebuilds**: Incremental builds with dependency tracking

### Infrastructure as Code

- **Unified Management**: All infrastructure in Terraform
- **No VPC Conflicts**: Uses existing Terraform-managed VPC and security groups
- **Proper IAM**: Least-privilege access with specific resource ARNs
- **Cost Optimization**: 14-day CloudWatch log retention

### Developer Experience

- **Single Command Deployment**: `terraform apply`
- **Automatic Detection**: Changes trigger rebuilds automatically
- **Output URLs**: Terraform outputs provide endpoint URLs
- **Error Handling**: Better error messages and rollback capability

## File Structure

```
terraform/
├── lambda-graphql.tf     # Lambda function and IAM configuration
├── api_gateway.tf        # API Gateway with CORS support
├── outputs.tf           # Endpoint URLs and resource ARNs
└── main.tf              # Provider and common configuration

lambdas/db/
├── src/index.ts         # Apollo Server Lambda handler
├── vite.config.mts      # Vite SSR build configuration
├── package.json         # Dependencies and build script
├── project.json         # Nx targets and deployment commands
└── dist/               # Build output (auto-generated)

nx.json                  # Workspace-level Nx configuration
```

## Nx Configuration Details

The deployment is configured through Nx targets in `lambdas/db/project.json`:

```json
{
  "targets": {
    "deploy": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "terraform apply -auto-approve",
        "cwd": "terraform"
      }
    },
    "deploy:plan": {
      "executor": "nx:run-commands",
      "dependsOn": ["build"],
      "options": {
        "command": "terraform plan",
        "cwd": "terraform"
      }
    },
    "test-endpoint": {
      "executor": "nx:run-commands",
      "options": {
        "command": "powershell -Command \"...\""
      }
    },
    "logs": {
      "executor": "nx:run-commands",
      "options": {
        "command": "aws logs tail \"/aws/lambda/legacy-sports-dev-graphql\" --follow"
      }
    }
  }
}
```

The workspace-level `nx.json` includes target defaults to ensure proper dependency resolution and caching behavior.

## Environment Variables

The Lambda automatically receives these environment variables:

- `CREDS_PATH`: Database credentials secret name
- `DB_HOST`: RDS instance or proxy endpoint
- `NODE_ENV`: Environment (dev/staging/prod)

## Monitoring and Debugging

### CloudWatch Logs

```bash
# View real-time logs
aws logs tail "/aws/lambda/legacy-sports-dev-graphql" --follow
```

### Terraform Outputs

```bash
# Get endpoint URLs
terraform output graphql_endpoint
terraform output api_gateway_url
```

### Lambda Function Details

```bash
# Get function info
terraform output graphql_lambda_function_name
terraform output graphql_lambda_function_arn
```

## Migration from Serverless Framework

The old Serverless Framework deployment has been replaced with this Terraform approach:

- ✅ **No VPC conflicts**: Uses existing Terraform-managed networking
- ✅ **Consistent IAM**: Follows project IAM patterns
- ✅ **Unified deployment**: Single terraform apply for all infrastructure
- ✅ **Better error handling**: Terraform rollback capabilities
- ✅ **Cost optimization**: Right-sized resources and log retention

## Next Steps

1. **Add Database Resolvers**: Extend the GraphQL schema with Player and other entity resolvers
2. **Environment Promotion**: Create staging and production environments
3. **CI/CD Integration**: Add GitHub Actions for automated deployments
4. **Monitoring**: Set up CloudWatch alarms and dashboards
5. **Testing**: Add integration tests for the deployed Lambda

## Troubleshooting

### Common Issues

1. **Build Failures**: Check `lambdas/db/vite.config.mts` configuration
2. **Runtime Errors**: Check CloudWatch logs for dependency issues
3. **API Gateway Errors**: Verify CORS configuration in `api_gateway.tf`
4. **Database Connection**: Ensure VPC and security group configuration

### Debug Commands

```bash
# Check build output
ls -la lambdas/db/dist/

# Test local build
cd lambdas/db && npm run build

# Validate Terraform
terraform validate

# Plan changes
terraform plan
```
