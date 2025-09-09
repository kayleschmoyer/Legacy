# Lambda Functions

AWS Lambda functions providing the serverless backend for Legacy Sports.

## 🚀 Overview

The backend consists of multiple Lambda functions handling different aspects of the application:

| Function           | Purpose                                 | Language   | Framework     |
| ------------------ | --------------------------------------- | ---------- | ------------- |
| **GraphQL**        | Main API for data queries and mutations | TypeScript | Apollo Server |
| **OAuth Proxy**    | Google OAuth authentication flow        | TypeScript | Express.js    |
| **Stats Lambda**   | Background statistics processing        | TypeScript | Custom        |
| **Game Selection** | Game data management                    | TypeScript | Custom        |

## 🏗️ Shared Architecture

### Common Features

- **Runtime**: Node.js 18.x
- **Deployment**: ZIP packages via Terraform
- **Monitoring**: CloudWatch logs and metrics
- **Networking**: VPC with private subnets
- **Database**: Shared PostgreSQL RDS instance

### Environment Variables

All functions receive:

- `DB_HOST`: PostgreSQL connection string
- `DB_CREDS_SECRET_NAME`: AWS Secrets Manager secret name
- `AWS_REGION`: Deployment region
- Function-specific variables

## 📦 Lambda Functions

### GraphQL API (`graphql/`)

The main API serving all data queries and mutations.

**Endpoints**: `/graphql`
**Method**: POST
**Features**:

- Apollo Server with TypeScript
- Schema-first GraphQL
- Database connection pooling
- Authentication middleware
- Error handling and logging

**Key Queries**:

- `getAllPlayers`: Fetch player data
- `getGameStats`: Game statistics
- `getSeasonData`: Season information

### OAuth Proxy (`oauth-proxy/`)

Handles Google OAuth authentication flows.

**Endpoints**: `/oauth/*`
**Methods**: GET, POST
**Features**:

- Google OAuth 2.0 integration
- JWT token management
- Session handling
- Secure cookie management

**Flows**:

- Login initiation
- OAuth callback handling
- Token refresh
- Logout

### Stats Lambda (`stats-lambda/`)

Background processing for statistics and data aggregation.

**Trigger**: SQS queue messages
**Features**:

- Batch processing
- Statistics calculations
- Data aggregation
- Performance metrics

### Game Selection (`game-selection/`)

Manages game data and selection logic.

**Endpoints**: `/games`
**Methods**: GET, POST
**Features**:

- Game data retrieval
- Selection algorithms
- Cache management

## 🛠️ Development

### Local Development

Each function can be developed and tested locally:

```bash
# Navigate to function directory
cd lambdas/graphql

# Install dependencies
npm install

# Run locally (if supported)
npm run dev

# Run tests
npm test
```

### Shared Dependencies

Common packages are included in a Lambda Layer:

- Database client libraries
- Utility functions
- Shared types and interfaces

### Environment Setup

```bash
# Set up local environment variables
cp .env.example .env

# Configure database connection
# DB_HOST=localhost:5432
# DB_NAME=legacy_sports_dev
```

## 🧪 Testing

### Unit Testing

```bash
# Test specific function
cd lambdas/graphql
npm test

# Test with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Integration Testing

```bash
# Test deployed functions
npm run test:integration

# Load testing
npm run test:load
```

### Local Testing with SAM

```bash
# Start local API Gateway
sam local start-api

# Invoke specific function
sam local invoke GraphQLFunction --event events/test-event.json
```

## 📦 Deployment

### Automatic Deployment

GitHub Actions handles deployment:

- **Trigger**: Push to main branch
- **Build**: Package functions
- **Deploy**: Update via Terraform

### Manual Deployment

```bash
# Deploy all functions
terraform apply

# Deploy specific function
terraform apply -target=aws_lambda_function.graphql

# Package and deploy manually
cd lambdas/graphql
npm run build
npm run deploy
```

### Build Process

Each function follows the same build pattern:

1. TypeScript compilation
2. Dependency bundling
3. ZIP package creation
4. Upload to S3
5. Lambda function update

## 🔧 Configuration

### Function Configuration

Standard settings across all functions:

- **Memory**: 256MB (adjustable per function)
- **Timeout**: 30 seconds (API functions), 5 minutes (processing)
- **Runtime**: Node.js 18.x
- **Architecture**: x86_64

### VPC Configuration

All functions run in private subnets:

- No direct internet access
- Database access via security groups
- NAT Gateway for external API calls

### IAM Permissions

Each function has minimal required permissions:

- VPC network access
- CloudWatch logging
- Secrets Manager access
- Function-specific resources

## 📊 Monitoring

### CloudWatch Metrics

Standard metrics for all functions:

- Invocation count
- Duration
- Error rate
- Throttles

### Custom Metrics

Application-specific metrics:

- Database connection time
- Query performance
- Authentication success rate

### Logging

Structured logging with:

- Request/response logging
- Error details and stack traces
- Performance timing
- Business logic events

## 🔍 Troubleshooting

### Common Issues

**Cold start performance**:

- Monitor duration metrics
- Consider provisioned concurrency
- Optimize package size

**Database connection issues**:

- Check VPC configuration
- Verify security groups
- Monitor connection pool

**Memory issues**:

- Monitor memory usage
- Adjust function memory
- Profile function execution

### Debugging

**View logs**:

```bash
# Recent logs
aws logs tail /aws/lambda/legacy-sports-dev-graphql --follow

# Error logs only
aws logs filter-log-events --log-group-name /aws/lambda/legacy-sports-dev-graphql --filter-pattern "ERROR"
```

**Test function**:

```bash
# Direct invocation
aws lambda invoke --function-name legacy-sports-dev-graphql response.json

# Check response
cat response.json
```

### Performance Optimization

**Package size**:

- Use webpack for bundling
- Exclude dev dependencies
- Use Lambda layers for shared code

**Runtime performance**:

- Connection pooling
- Caching strategies
- Async/await optimization

## 📚 Resources

- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/)
- [Apollo Server Documentation](https://apollographql.com/docs/apollo-server/)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

---

Each Lambda function is designed to be independently deployable and scalable.
