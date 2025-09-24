# Infrastructure & Backend

AWS serverless infrastructure managed with Terraform and Lambda functions.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway    │    │   Lambda        │
│   (Web/Mobile)  │───▶│                  │───▶│   Functions     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   CloudWatch     │    │   PostgreSQL    │
                       │   Logs           │    │   RDS           │
                       └──────────────────┘    └─────────────────┘
```

## 🚀 Quick Setup

### Prerequisites

- **AWS CLI**: Configured with appropriate credentials
- **Terraform**: v1.0+
- **Node.js**: v18+ (for Lambda functions)

### Infrastructure Deployment

```bash
# Navigate to terraform directory
cd terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan

# Apply infrastructure
terraform apply
```

## 🔧 Infrastructure Components

### API Gateway

Central entry point for all API requests:

- **Base URL**: `https://u65oy98s9d.execute-api.us-east-1.amazonaws.com/dev`
- **Endpoints**:
  - `/graphql` - GraphQL API
  - `/oauth` - Authentication
  - `/stats` - Statistics processing
  - `/games` - Game selection

### Lambda Functions

| Function           | Purpose                     | Endpoint   |
| ------------------ | --------------------------- | ---------- |
| **GraphQL**        | Main API for data queries   | `/graphql` |
| **OAuth Proxy**    | Google OAuth authentication | `/oauth`   |
| **Stats Lambda**   | Statistics processing       | `/stats`   |
| **Game Selection** | Game data management        | `/games`   |

### Database

- **Type**: PostgreSQL on AWS RDS
- **Environment**: Development
- **Access**: Via Lambda functions only (private subnets)

### Networking

- **VPC**: Custom VPC with public/private subnets
- **Security Groups**: Restrictive access rules
- **Subnets**: Separate for Lambda and RDS

## 📦 Lambda Functions

### GraphQL API (`lambdas/graphql/`)

Main API serving GraphQL queries:

- Player data queries
- Statistics aggregation
- Real-time data updates

```bash
# Deploy GraphQL Lambda
npm run deploy:graphql
```

### OAuth Proxy (`lambdas/oauth-proxy/`)

Handles Google OAuth authentication:

- Login flow management
- Token refresh
- Session management

```bash
# Deploy OAuth Lambda
npm run deploy:oauth
```

### Stats Lambda (`lambdas/stats-lambda/`)

Background processing for statistics:

- Data aggregation
- Performance calculations
- Historical data processing

```bash
# Deploy Stats Lambda
npm run deploy:stats
```

## 🔧 Configuration

### Environment Variables

Set in Terraform and available to all Lambda functions:

```hcl
# terraform/variables.tf
variable "environment" {
  default = "dev"
}

variable "aws_region" {
  default = "us-east-1"
}
```

### Secrets Management

Sensitive data stored in AWS Secrets Manager:

- Database credentials
- OAuth client secrets
- JWT signing keys

### Database Configuration

PostgreSQL RDS instance with:

- Automated backups
- Multi-AZ for production
- Security group restrictions

## 🧪 Testing

### Local Testing

```bash
# Test Lambda functions locally
cd lambdas/graphql
npm run test:local

# Test with SAM CLI
sam local start-api
```

### Integration Testing

```bash
# Test deployed endpoints
npm run test:integration

# Health check all endpoints
npm run health:check
```

## 📊 Monitoring

### CloudWatch

All Lambda functions automatically log to CloudWatch:

- Function execution logs
- Performance metrics
- Error tracking

### Terraform Outputs

View deployed resource information:

```bash
cd terraform
terraform output
```

Key outputs:

- `graphql_endpoint`: GraphQL API URL
- `api_gateway_url`: Base API URL
- Environment variables summary

## 🔍 Troubleshooting

### Common Issues

**Terraform fails to apply**:

- Check AWS credentials and permissions
- Verify region configuration
- Review state file for conflicts

**Lambda deployment fails**:

- Check function size limits
- Verify IAM permissions
- Review CloudWatch logs

**Database connection issues**:

- Check security group rules
- Verify subnet configuration
- Test from Lambda function

### Debugging

**CloudWatch Logs**:

```bash
# View recent logs
aws logs tail /aws/lambda/legacy-sports-dev-graphql --follow

# Search specific timeframe
aws logs filter-log-events --log-group-name /aws/lambda/legacy-sports-dev-graphql --start-time 1609459200000
```

**Function Testing**:

```bash
# Invoke function directly
aws lambda invoke --function-name legacy-sports-dev-graphql response.json
```

## 🚀 Deployment

### CI/CD Pipeline

GitHub Actions automatically deploy:

- **Trigger**: Push to main branch
- **Build**: Package Lambda functions
- **Deploy**: Update infrastructure

### Manual Deployment

```bash
# Deploy all infrastructure
cd terraform
terraform apply

# Deploy specific Lambda
npm run deploy:graphql

# Update environment variables
terraform apply -target=aws_lambda_function.graphql
```

### Environment Management

- **Development**: Current setup
- **Production**: Separate Terraform workspace
- **Staging**: Optional environment

## 📚 Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [PostgreSQL on RDS](https://docs.aws.amazon.com/rds/latest/userguide/CHAP_PostgreSQL.html)

---

For infrastructure issues, check CloudWatch logs and Terraform state.
