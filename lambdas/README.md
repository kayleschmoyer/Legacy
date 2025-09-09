# Lambda Deployment Guide

This guide covers the modern Terraform-based deployment workflow for all Lambda functions in the Legacy Sports application.

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Terraform initialized** in the `terraform/` directory
3. **Node.js and npm** installed
4. **Nx CLI** available globally or via npx

## Lambda Functions Overview

The application includes 4 Lambda functions managed via Terraform:

| Lambda             | Function Name                      | API Path   | Purpose                        |
| ------------------ | ---------------------------------- | ---------- | ------------------------------ |
| **db**             | `legacy-sports-dev-graphql`        | `/graphql` | GraphQL API with Apollo Server |
| **oauth-proxy**    | `legacy-sports-dev-oauth-proxy`    | `/oauth/*` | OAuth authentication proxy     |
| **stats-lambda**   | `legacy-sports-dev-stats`          | `/stats/*` | Statistics processing          |
| **game-selection** | `legacy-sports-dev-game-selection` | `/games/*` | Game selection logic           |

## Deployment Workflow

### Individual Lambda Deployment

Each lambda supports these Nx commands:

```bash
# Build and package the lambda
nx build <lambda-name>
nx package <lambda-name>

# Plan deployment (see what will change)
nx deploy:plan <lambda-name>

# Deploy to AWS
nx deploy <lambda-name>

# Test the deployed endpoint
nx test-endpoint <lambda-name>

# View CloudWatch logs
nx logs <lambda-name>
```

### Examples

```bash
# Deploy the GraphQL lambda
nx deploy db

# Deploy OAuth proxy
nx deploy oauth-proxy

# Deploy stats processing
nx deploy stats-lambda

# Deploy game selection
nx deploy game-selection
```

### Deploy All Lambdas

To deploy all lambdas at once:

```bash
# Build all lambdas
nx run-many -t build -p db,oauth-proxy,stats-lambda,game-selection

# Deploy all lambdas
nx run-many -t deploy -p db,oauth-proxy,stats-lambda,game-selection
```

## Architecture Details

### Build System

- **Vite 6.3.5** with SSR configuration for Node.js Lambda environment
- **Complete dependency bundling** (noExternal: true) for reliability
- **Node.js 20.x** runtime target
- **CommonJS output** format for Lambda compatibility

### Infrastructure

- **Terraform-managed** infrastructure as code
- **VPC networking** with private subnets and security groups
- **API Gateway** with CORS configuration and Lambda proxy integration
- **CloudWatch** logging with 14-day retention
- **IAM roles** with least-privilege access policies

### API Gateway Endpoints

All lambdas are accessible through a single API Gateway:

- **Base URL**: `https://{api-id}.execute-api.us-east-1.amazonaws.com/dev`
- **GraphQL**: `{base-url}/graphql`
- **OAuth**: `{base-url}/oauth/*`
- **Stats**: `{base-url}/stats/*`
- **Games**: `{base-url}/games/*`

## Development Workflow

### Local Development

```bash
# Run lambda locally for development
nx serve <lambda-name>

# Run tests
nx test <lambda-name>

# Lint code
nx lint <lambda-name>
```

### Deployment Pipeline

1. **Build**: Vite compiles TypeScript and bundles all dependencies
2. **Package**: Create deployment ZIP file in `dist/` directory
3. **Deploy**: Terraform applies infrastructure changes
4. **Validate**: API Gateway deployment updated to include new version

### Monitoring

```bash
# View real-time logs
nx logs <lambda-name>

# Or use AWS CLI directly
aws logs tail /aws/lambda/legacy-sports-dev-<function-name> --follow --region us-east-1
```

## Configuration

### Environment Variables

All lambdas receive these environment variables:

- `DB_HOST`: RDS cluster endpoint
- `DB_NAME`: Database name
- `DB_SECRET_ARN`: ARN for database credentials in Secrets Manager
- `ENVIRONMENT`: Current environment (dev/staging/prod)
- `AWS_NODEJS_CONNECTION_REUSE_ENABLED`: Connection pooling optimization

### Dependencies

Key libraries bundled in each lambda:

- **@nx/vite**: Nx build integration
- **Vite plugins**: TypeScript paths and Nx monorepo support
- **Database clients**: Drizzle ORM, node-postgres
- **AWS SDK**: Native AWS service integration

## Troubleshooting

### Common Issues

1. **Build Failures**: Check Vite configuration and dependency compatibility
2. **Deployment Errors**: Verify Terraform state and AWS permissions
3. **Runtime Errors**: Check CloudWatch logs for missing dependencies or configuration

### Debug Commands

```bash
# Check lambda status
aws lambda get-function --function-name legacy-sports-dev-<function-name> --region us-east-1

# Test lambda directly
aws lambda invoke --function-name legacy-sports-dev-<function-name> --payload '{}' response.json --region us-east-1

# View API Gateway configuration
aws apigateway get-rest-apis --region us-east-1
```

## Migration from Serverless Framework

This deployment system replaces the previous Serverless Framework setup:

- ✅ **Terraform**: Infrastructure as code with state management
- ✅ **Vite**: Modern build system with full dependency bundling
- ✅ **Nx integration**: Monorepo-aware deployment workflow
- ✅ **Unified API Gateway**: Single endpoint for all services

The old `serverless.yml` files have been removed and replaced with Terraform configurations in the `terraform/` directory.
