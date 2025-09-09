# Legacy Sports Terraform Infrastructure

This directory contains Terraform configuration files to deploy the Legacy Sports application infrastructure on AWS.

## Architecture Overview

The infrastructure includes:

- **VPC**: Custom VPC with public and private subnets across 3 availability zones
- **RDS**: PostgreSQL database with RDS Proxy for connection pooling
- **Lambda Functions**:
  - OAuth proxy functions (Google Auth, Local Auth)
  - GraphQL API function
  - Stats loading function (SQS-triggered)
- **API Gateway**: REST API exposing Lambda functions publicly
- **SQS**: FIFO queue for processing stats loading requests
- **Secrets Manager**: Secure storage for database credentials, JWT secrets, OAuth secrets
- **S3**: Bucket for Lambda deployment packages
- **CloudWatch**: Log groups for Lambda functions

## Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **Terraform** >= 1.0 installed
3. **Lambda deployment packages** built and available:
   - `oauth-proxy-google.zip`
   - `oauth-proxy-local.zip`
   - `graphql.zip`
   - `stats-lambda.zip`
   - `node-pg.zip` (Lambda layer)

## Deployment Steps

### 1. Build Lambda Packages

Before deploying, you need to build and package the Lambda functions:

```bash
# Build OAuth proxy functions
cd lambdas/oauth-proxy
npx nx build
npx serverless package
cp .serverless/legacy-sports-oauth-proxy.zip ../../terraform/oauth-proxy-google.zip
cp .serverless/legacy-sports-oauth-proxy.zip ../../terraform/oauth-proxy-local.zip

# Build GraphQL function
cd ../db
npx nx build
npx serverless package
cp .serverless/legacy-sports-graphql.zip ../../terraform/graphql.zip

# Build Stats lambda
cd ../stats-lambda
npx nx build
npx serverless package
cp .serverless/legacy-sports-stats-lambda.zip ../../terraform/stats-lambda.zip

# Create node-pg layer (you'll need to create this based on the layers/node-pg directory)
cd ../layers
zip -r ../../terraform/node-pg.zip node-pg/
```

### 2. Configure Variables

Update `terraform.tfvars` with your specific configuration:

```hcl
# Update these values as needed
aws_region     = "us-east-1"
environment    = "dev"
project_name   = "legacy-sports"

# Database settings
db_instance_class = "db.t3.micro"  # Use larger instance for production
db_allocated_storage = 20          # Increase for production

# OAuth settings
google_oauth_client_id = "your-actual-google-oauth-client-id"
```

### 3. Deploy Infrastructure

```bash
cd terraform

# Initialize Terraform
terraform init

# Review the plan
terraform plan

# Apply the configuration
terraform apply
```

### 4. Post-Deployment Configuration

After deployment, you'll need to:

1. **Update Google OAuth Client Secret**:

   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "dev/google-oauth-client-secret" \
     --secret-string "your-actual-google-oauth-client-secret"
   ```

2. **Initialize Database Schema**:

   - Connect to the RDS instance using the proxy endpoint
   - Run the database migration scripts from the `resources/` directory

3. **Update Application Configuration**:
   - Use the output values to configure your application's environment variables

## Infrastructure Components

### VPC and Networking

- Custom VPC with public and private subnets
- NAT Gateways for Lambda internet access
- Security groups for Lambda, RDS, and RDS Proxy

### Database

- PostgreSQL 16.3 RDS instance
- RDS Proxy for connection pooling and security
- Encrypted storage with automated backups
- Performance Insights enabled

### Lambda Functions

- **OAuth Google Auth**: Handles Google OAuth authentication
- **OAuth Google Refresh**: Handles token refresh
- **OAuth Local Register**: Handles local user registration
- **OAuth Local Login**: Handles local user login
- **GraphQL**: PostGraphile-based GraphQL API
- **Stats Load Career**: Processes stats loading from SQS

### API Gateway

- REST API with CORS enabled
- Routes for all OAuth and GraphQL endpoints
- Proper integration with Lambda functions

### Security

- All secrets stored in AWS Secrets Manager
- IAM roles with least privilege access
- VPC isolation for databases
- Encrypted storage and data in transit

## Outputs

After deployment, Terraform outputs important values:

- **API Gateway URLs**: Base URL and specific endpoint URLs
- **Database Connection**: RDS Proxy endpoint for secure connections
- **Secret ARNs**: For accessing stored secrets
- **SQS Queue**: URL for the stats loading queue

## Monitoring and Logs

- CloudWatch Log Groups for all Lambda functions (14-day retention)
- RDS Performance Insights enabled
- CloudWatch metrics for API Gateway, Lambda, and SQS

## Cost Considerations

- **RDS**: Main cost driver - consider db.t3.micro for development
- **Lambda**: Pay per invocation and duration
- **NAT Gateway**: Fixed hourly cost + data transfer
- **API Gateway**: Pay per request
- **SQS**: Very low cost for messaging

## Security Notes

1. **Database**: Only accessible from Lambda functions via RDS Proxy
2. **Secrets**: All sensitive data stored in Secrets Manager
3. **VPC**: Lambda functions isolated in private subnets
4. **IAM**: Least privilege access policies

## Troubleshooting

### Lambda Issues

- Check CloudWatch logs for function errors
- Verify VPC configuration and security groups
- Ensure secrets are properly configured

### Database Issues

- Verify RDS Proxy is running and accessible
- Check security group rules
- Ensure Lambda has proper IAM permissions for RDS

### API Gateway Issues

- Check Lambda permissions for API Gateway invocation
- Verify CORS configuration for browser requests
- Review API Gateway execution logs

## Resource Discovery and Management

The deployment scripts include powerful resource discovery functionality to help manage AWS resources that may exist outside of Terraform's control.

### Discovery Features

- **Scan AWS Resources**: Find existing resources that match your project naming patterns
- **Compare with Terraform**: Identify which resources are managed vs. unmanaged
- **Import Options**: Automatically or selectively import resources into Terraform state
- **Report Generation**: Get detailed reports of discovered resources

### Quick Start

#### PowerShell (Windows)

```powershell
# Discover all unmanaged resources
.\deploy.ps1 -DiscoverResources

# Discover specific resource types
.\deploy.ps1 -DiscoverResources -ResourceTypes VPC,Lambda,RDS

# Auto-import discovered resources
.\deploy.ps1 -DiscoverResources -AutoImport
```

#### Bash (Linux/macOS)

```bash
# Discover all unmanaged resources
./deploy.sh --discover-resources

# Discover specific resource types
./deploy.sh --discover-resources --resource-types VPC,Lambda,RDS

# Auto-import discovered resources
./deploy.sh --discover-resources --auto-import
```

### Supported Resource Types

- **VPC**: Virtual Private Cloud resources
- **Lambda**: Lambda functions
- **RDS**: Database instances
- **SQS**: Message queues
- **S3**: Storage buckets
- **IAM**: Roles and policies
- **SecretsManager**: Secret configurations
- **ApiGateway**: API Gateway REST APIs

### Use Cases

1. **Infrastructure Audit**: Find resources that were created manually
2. **Migration**: Import existing resources into Terraform management
3. **Compliance**: Ensure all resources are properly managed
4. **Cost Control**: Identify and remove unused resources

📖 **Detailed Documentation**: See [RESOURCE_DISCOVERY.md](./RESOURCE_DISCOVERY.md) for complete usage guide and examples.

## Cleanup

To destroy the infrastructure:

```bash
terraform destroy
```

**Warning**: This will delete all resources including the database. Ensure you have backups if needed.
