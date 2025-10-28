# Legacy Sports AWS Infrastructure Documentation

## 📋 **Overview**

This document provides comprehensive documentation of the Legacy Sports AWS infrastructure, including architecture diagrams, resource details, networking configuration, and operational considerations.

**Environment**: Development (dev)  
**Region**: us-east-1 (US East - N. Virginia)  
**Last Updated**: September 26, 2025  
**Cost Optimization Status**: Fully optimized (~$37.80/month savings achieved)  
**Infrastructure Cleanup**: Legacy resource decommissioning completed (September 26, 2025)

## 🏗️ **High-Level Architecture**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud (us-east-1)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌─────────────────────────────────────────────┐   │
│  │   Public Access  │    │                   VPC                       │   │
│  │                  │    │               10.0.0.0/16                   │   │
│  └──────────────────┘    └─────────────────────────────────────────────┘   │
│            │                                    │                           │
│            ▼                                    ▼                           │
│  ┌──────────────────┐    ┌─────────────────────────────────────────────┐   │
│  │   API Gateway    │◄──►│           Core Services (VPC)               │   │
│  │  (Regional)      │    │  ┌─────────────┐    ┌─────────────────────┐ │   │
│  │                  │    │  │   GraphQL   │    │       OAuth         │ │   │
│  │ /graphql         │    │  │   Lambda    │    │       Proxy         │ │   │
│  │ /oauth           │    │  │   (VPC)     │    │      Lambda         │ │   │
│  │ /stats           │    │  │             │◄──►│      (VPC)          │ │   │
│  │ /games           │    │  └─────────────┘    └─────────────────────┘ │   │
│  └──────────────────┘    │                                             │   │
│            │              │  ┌─────────────────────────────────────────┐ │   │
│            ▼              │  │              VPC Endpoints             │ │   │
│  ┌──────────────────┐    │  │   • Secrets Manager                    │ │   │
│  │ External Lambdas │    │  │   • CloudWatch Logs                   │ │   │
│  │                  │    │  └─────────────────────────────────────────┘ │   │
│  │  Stats Lambda    │    │                      ▼                       │   │
│  │ (Outside VPC)    │    │  ┌─────────────────────────────────────────┐ │   │
│  │                  │    │  │            RDS PostgreSQL              │ │   │
│  │ Game Selection   │◄───┤  │         (Private Subnet)               │ │   │
│  │    Lambda        │    │  │      + Public Access via SG            │ │   │
│  │ (Outside VPC)    │    │  └─────────────────────────────────────────┘ │   │
│  └──────────────────┘    └─────────────────────────────────────────────┘   │
│            │                                                               │
│            ▼                                                               │
│  ┌──────────────────┐    ┌─────────────────────────────────────────────┐   │
│  │  Baseball Ref    │    │              SQS & Secrets                  │   │
│  │  External APIs   │    │                                             │   │
│  └──────────────────┘    └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🌐 **Network Architecture**

### **VPC Configuration**

```
VPC: 10.0.0.0/16 (vpc-0e7e5def598aa06ff)
├── Availability Zones: us-east-1a, us-east-1b
├── Internet Gateway: igw-047ad49c2a76d4176
└── NAT Gateway: REMOVED (Cost optimization - saves $45/month)

Subnets:
┌─────────────────┬──────────────────┬─────────────────┬──────────────────┐
│ Subnet Type     │ CIDR Block       │ Availability AZ │ Subnet ID        │
├─────────────────┼──────────────────┼─────────────────┼──────────────────┤
│ Public          │ 10.0.1.0/24      │ us-east-1a      │ subnet-06ccb30a  │
│ Public          │ 10.0.2.0/24      │ us-east-1b      │ subnet-066f4ec5  │
│ Private Lambda  │ 10.0.10.0/24     │ us-east-1a      │ subnet-08ac01d0  │
│ Private Lambda  │ 10.0.11.0/24     │ us-east-1b      │ subnet-08f691c6  │
│ Private DB      │ 10.0.20.0/24     │ us-east-1a      │ subnet-00e81c73  │
│ Private DB      │ 10.0.21.0/24     │ us-east-1b      │ subnet-0cd8a81c  │
└─────────────────┴──────────────────┴─────────────────┴──────────────────┘
```

### **Routing Tables**

```
┌────────────────────┬────────────────────────────────────────────────┐
│ Route Table        │ Routes                                         │
├────────────────────┼────────────────────────────────────────────────┤
│ Public             │ 0.0.0.0/0 → Internet Gateway                   │
│ Private Lambda     │ Local only (no internet route)                │
│ Private Database   │ Local only (no internet route)                │
└────────────────────┴────────────────────────────────────────────────┘
```

### **VPC Endpoints** (Cost Optimization)

```
┌─────────────────────┬──────────────────────────────────────────────┬──────────────────┐
│ Service             │ Endpoint ID                                  │ Monthly Cost     │
├─────────────────────┼──────────────────────────────────────────────┼──────────────────┤
│ Secrets Manager     │ vpce-0ae557e6e70875415                       │ ~$3.60          │
│ CloudWatch Logs     │ vpce-049cce623db01cbc0                       │ ~$3.60          │
├─────────────────────┼──────────────────────────────────────────────┼──────────────────┤
│ Total VPC Endpoints │                                              │ ~$7.20          │
│ NAT Gateway (Saved) │ REMOVED                                      │ -$45.00         │
│ NET SAVINGS         │                                              │ -$37.80/month   │
└─────────────────────┴──────────────────────────────────────────────┴──────────────────┘
```

## 🔒 **Security Groups**

### **Lambda Security Group** (sg-015898567721f664b)

```
Purpose: Controls access for VPC Lambda functions
┌─────────┬─────────────┬──────────────┬─────────────────────────────────┐
│ Type    │ Protocol    │ Port Range   │ Source/Destination              │
├─────────┼─────────────┼──────────────┼─────────────────────────────────┤
│ Egress  │ All         │ All          │ 0.0.0.0/0                       │
└─────────┴─────────────┴──────────────┴─────────────────────────────────┘
```

### **RDS Security Group** (sg-0e5eed9f1acb19dcb)

```
Purpose: Controls access to PostgreSQL RDS instance
┌─────────┬─────────────┬──────────────┬─────────────────────────────────┐
│ Type    │ Protocol    │ Port Range   │ Source/Destination              │
├─────────┼─────────────┼──────────────┼─────────────────────────────────┤
│ Ingress │ TCP         │ 5432         │ Lambda SG (sg-015898567721f664b)│
│ Ingress │ TCP         │ 5432         │ 0.0.0.0/0 (External Lambdas)   │
│ Egress  │ All         │ All          │ 0.0.0.0/0                       │
└─────────┴─────────────┴──────────────┴─────────────────────────────────┘
```

### **VPC Endpoints Security Group** (sg-08248366b1956ceb7)

```
Purpose: Controls access to VPC endpoints
┌─────────┬─────────────┬──────────────┬─────────────────────────────────┐
│ Type    │ Protocol    │ Port Range   │ Source/Destination              │
├─────────┼─────────────┼──────────────┼─────────────────────────────────┤
│ Ingress │ HTTPS       │ 443          │ 10.0.0.0/16 (VPC CIDR)         │
│ Egress  │ All         │ All          │ 0.0.0.0/0                       │
└─────────┴─────────────┴──────────────┴─────────────────────────────────┘
```

## ⚡ **Lambda Functions**

### **Architecture Overview**

```
┌─────────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Function            │ Location        │ Runtime         │ Purpose         │
├─────────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ GraphQL             │ VPC Private     │ Node.js 20      │ API Gateway     │
│ OAuth Proxy         │ VPC Private     │ Node.js 20      │ Authentication  │
│ Stats               │ External        │ Node.js 20      │ Data Scraping   │
│ Game Selection      │ External        │ Node.js 20      │ Game Logic      │
└─────────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### **GraphQL Lambda** (legacy-sports-dev-graphql)

```
Configuration:
├── Runtime: Node.js 20
├── Memory: 512 MB (dev: 256 MB)
├── Timeout: 30 seconds
├── Location: VPC Private Subnets
├── VPC Config:
│   ├── Subnets: subnet-08ac01d0, subnet-08f691c6
│   └── Security Groups: sg-015898567721f664b
├── Environment Variables:
│   ├── DB_CREDS_PATH: legacy-sports-dev-db-creds-*
│   ├── DB_HOST: legacy-sports-dev-postgres.*.rds.amazonaws.com:5432
│   ├── NODE_ENV: dev
│   └── AWS_NODEJS_CONNECTION_REUSE_ENABLED: 1
└── Endpoints:
    ├── API Gateway: POST /graphql
    └── Direct: arn:aws:lambda:us-east-1:176661590736:function:legacy-sports-dev-graphql
```

### **OAuth Proxy Lambda** (legacy-sports-dev-oauth-proxy)

```
Configuration:
├── Runtime: Node.js 20
├── Memory: 512 MB (dev: 256 MB)
├── Timeout: 30 seconds
├── Location: VPC Private Subnets
├── VPC Config:
│   ├── Subnets: subnet-08ac01d0, subnet-08f691c6
│   └── Security Groups: sg-015898567721f664b
├── Environment Variables:
│   ├── DB_CREDS_PATH: legacy-sports-dev-db-creds-*
│   ├── GOOGLE_OAUTH_CLIENT_ID: your-google-client-id.apps.googleusercontent.com
│   ├── GOOGLE_OAUTH_CLIENT_SECRET_NAME: dev/google-oauth-client-secret
│   ├── JWT_SECRET_NAME: dev/jwt-secret-key
│   ├── OAUTH_PROXY_COOKIE_SECRET_NAME: dev/oauth-proxy/cookie-secret
│   └── NODE_ENV: dev
└── Endpoints:
    ├── API Gateway: ANY /oauth, /oauth/{proxy+}
    └── Available paths: /oauth/google, /oauth/login, /oauth/register, /oauth/refresh
```

### **Stats Lambda** (legacy-sports-dev-stats)

```
Configuration:
├── Runtime: Node.js 20
├── Memory: 256 MB (dev optimized)
├── Timeout: 180 seconds (dev) / 300 seconds (prod)
├── Location: EXTERNAL (outside VPC for performance)
├── Database Access: Via public security group rule
├── Environment Variables:
│   ├── DB_CREDS_PATH: legacy-sports-dev-db-creds-*
│   ├── DB_HOST: legacy-sports-dev-postgres.*.rds.amazonaws.com:5432
│   ├── NODE_ENV: dev
│   ├── SQS_QUEUE_URL: https://sqs.us-east-1.amazonaws.com/.../legacy-sports-dev-load-season-stats.fifo
│   └── AWS_NODEJS_CONNECTION_REUSE_ENABLED: 1
├── Event Sources:
│   └── SQS: legacy-sports-dev-load-season-stats.fifo
└── Endpoints:
    ├── API Gateway: POST /stats/{proxy+}
    └── External APIs: Baseball Reference (direct access)
```

### **Game Selection Lambda** (legacy-sports-dev-game-selection)

```
Configuration:
├── Runtime: Node.js 20
├── Memory: 256 MB
├── Timeout: 30 seconds
├── Location: EXTERNAL (outside VPC for performance)
├── Database Access: Via public security group rule
├── Environment Variables:
│   ├── DB_CREDS_PATH: legacy-sports-dev-db-creds-*
│   ├── DB_HOST: legacy-sports-dev-postgres.*.rds.amazonaws.com:5432
│   ├── NODE_ENV: dev
│   └── AWS_NODEJS_CONNECTION_REUSE_ENABLED: 1
└── Endpoints:
    ├── API Gateway: ANY /games/{proxy+}
    └── External APIs: Baseball Reference (direct access)
```

## 🗄️ **Database Architecture**

### **RDS PostgreSQL Instance**

```
Instance Details:
├── Identifier: legacy-sports-dev-postgres
├── Engine: PostgreSQL 16.8
├── Instance Class: db.t3.micro (dev optimized)
├── Storage:
│   ├── Type: GP3 SSD
│   ├── Allocated: 20 GB (dev)
│   ├── Max Auto Scaling: 50 GB (dev) vs 100 GB (prod)
│   └── Encryption: Enabled
├── Network Configuration:
│   ├── Subnet Group: legacy-sports-dev-db-subnet-group-v2
│   ├── Subnets: Private DB subnets (subnet-00e81c73, subnet-0cd8a81c)
│   ├── Security Groups: sg-0e5eed9f1acb19dcb
│   ├── Publicly Accessible: true (for external Lambda access)
│   └── Port: 5432
├── Backup & Maintenance (Dev Optimized):
│   ├── Backup Retention: 1 day (vs 7 days prod)
│   ├── Backup Window: 03:00-04:00 UTC
│   ├── Maintenance Window: Sunday 04:00-05:00 UTC
│   ├── Auto Minor Version Upgrade: Enabled
│   └── Performance Insights: Disabled (cost savings)
└── Access Methods:
    ├── VPC Lambdas: Via private security group rules
    └── External Lambdas: Via public security group rules
```

### **Database Schema (Career Statistics Pattern)**

```
Season-Level Tables (Source Data):
┌──────────────────┬─────────────────────────────────────────────────┐
│ Table Name       │ Purpose                                         │
├──────────────────┼─────────────────────────────────────────────────┤
│ season_batting   │ Individual season batting stats per player      │
│ season_pitching  │ Individual season pitching stats per player     │
│ season_fielding  │ Individual season fielding stats per player     │
└──────────────────┴─────────────────────────────────────────────────┘

Career-Level Views (Aggregated):
┌──────────────────┬─────────────────────────────────────────────────┐
│ View Name        │ Purpose                                         │
├──────────────────┼─────────────────────────────────────────────────┤
│ career_batting   │ Lifetime batting totals (SUM of all seasons)   │
│ career_pitching  │ Lifetime pitching totals (SUM of all seasons)  │
│ career_fielding  │ Lifetime fielding totals (SUM of all seasons)  │
└──────────────────┴─────────────────────────────────────────────────┘
```

## 🔗 **API Gateway Configuration**

### **REST API** (dtx9mcsty1)

```
Configuration:
├── Name: legacy-sports-dev-api
├── Type: Regional
├── Endpoint: https://dtx9mcsty1.execute-api.us-east-1.amazonaws.com/dev
└── Stage: dev

Resource Structure:
/
├── /graphql
│   ├── POST (→ GraphQL Lambda)
│   └── OPTIONS (CORS)
├── /oauth
│   ├── ANY (→ OAuth Proxy Lambda)
│   ├── OPTIONS (CORS)
│   └── /{proxy+}
│       ├── ANY (→ OAuth Proxy Lambda)
│       └── OPTIONS (CORS)
├── /stats
│   └── /{proxy+}
│       ├── POST (→ Stats Lambda)
│       └── OPTIONS (CORS)
└── /games
    └── /{proxy+}
        ├── ANY (→ Game Selection Lambda)
        └── OPTIONS (CORS)
```

### **CORS Configuration**

```
All endpoints include CORS headers:
├── Access-Control-Allow-Origin: *
├── Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token
├── Access-Control-Allow-Methods: OPTIONS,POST,GET,PUT,DELETE
└── Access-Control-Allow-Credentials: false
```

## 🔐 **Secrets Management**

### **AWS Secrets Manager**

```
┌─────────────────────────────────┬──────────────────────────────────────┐
│ Secret Name                     │ Purpose                              │
├─────────────────────────────────┼──────────────────────────────────────┤
│ legacy-sports-dev-db-creds-*    │ PostgreSQL database credentials      │
│ dev/jwt-secret-key              │ JWT token signing key               │
│ dev/google-oauth-client-secret  │ Google OAuth client secret          │
│ dev/oauth-proxy/cookie-secret   │ OAuth proxy cookie encryption       │
└─────────────────────────────────┴──────────────────────────────────────┘

Access Pattern:
├── VPC Lambdas: Via VPC Endpoints (Secrets Manager)
└── External Lambdas: Via IAM policies (direct HTTPS)
```

## 📊 **Message Queues**

### **SQS Configuration**

```
Queue: legacy-sports-dev-load-season-stats.fifo
├── Type: FIFO (First-In-First-Out)
├── URL: https://sqs.us-east-1.amazonaws.com/176661590736/legacy-sports-dev-load-season-stats.fifo
├── Dead Letter Queue: legacy-sports-dev-load-season-stats-dlq.fifo
├── Message Retention: 14 days
├── Visibility Timeout: 30 seconds
└── Consumer: Stats Lambda (event source mapping)

Purpose: Queues baseball statistics scraping jobs
```

## 📈 **Monitoring & Logging**

### **CloudWatch Log Groups**

```
┌─────────────────────────────────────────┬─────────────────┬─────────────────┐
│ Log Group                               │ Retention       │ Function        │
├─────────────────────────────────────────┼─────────────────┼─────────────────┤
│ /aws/lambda/legacy-sports-dev-graphql   │ 7 days (dev)    │ GraphQL Lambda  │
│ /aws/lambda/legacy-sports-dev-oauth-    │ 7 days (dev)    │ OAuth Lambda    │
│ /aws/lambda/legacy-sports-dev-stats     │ 7 days (dev)    │ Stats Lambda    │
│ /aws/lambda/legacy-sports-dev-game-sel  │ 7 days (dev)    │ Game Selection  │
└─────────────────────────────────────────┴─────────────────┴─────────────────┘

Log Access:
├── VPC Lambdas: Via VPC Endpoints (CloudWatch Logs)
└── External Lambdas: Direct HTTPS to CloudWatch
```

### **Performance Metrics**

```
Post-Optimization Performance:
┌─────────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Lambda Function     │ Cold Start      │ Execution Time  │ Memory Usage    │
├─────────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ GraphQL (VPC)       │ ~505ms          │ 54ms           │ 104 MB          │
│ OAuth (VPC)         │ ~500ms          │ <100ms         │ ~80 MB          │
│ Stats (External)    │ <200ms          │ Variable        │ ~128 MB         │
│ Game Sel (External) │ <200ms          │ Variable        │ ~69 MB          │
└─────────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

## 💾 **Storage**

### **S3 Buckets**

```
Bucket: legacy-sports-dev-lambdas-cca20ad9
├── Purpose: Lambda deployment packages
├── Versioning: Enabled
├── Encryption: AES-256
├── Public Access: Blocked
├── Lifecycle Policy:
│   ├── Transition to IA: 30 days
│   ├── Transition to Glacier: 90 days
│   └── Expire: 365 days
└── Structure:
    ├── /graphql/
    ├── /oauth-proxy/
    ├── /stats/
    └── /game-selection/
```

### **Systems Manager Parameters**

```
Parameter Store (Lambda Versions):
├── /legacy-sports/dev/s3/lambda-deployments-bucket
├── /legacy-sports/dev/lambda/graphql/version
├── /legacy-sports/dev/lambda/oauth-proxy/version
├── /legacy-sports/dev/lambda/stats/version
└── /legacy-sports/dev/lambda/game-selection/version
```

## 🔄 **IAM Roles & Policies**

### **Lambda Execution Roles**

```
GraphQL Lambda Role (legacy-sports-dev-graphql-lambda-role):
├── AWSLambdaBasicExecutionRole (AWS managed)
├── AWSLambdaVPCAccessExecutionRole (AWS managed)
├── legacy-sports-dev-graphql-lambda-secrets (custom)
└── legacy-sports-dev-graphql-lambda-rds (custom)

OAuth Proxy Role (legacy-sports-dev-oauth-proxy-lambda-role):
├── AWSLambdaBasicExecutionRole (AWS managed)
├── AWSLambdaVPCAccessExecutionRole (AWS managed)
├── legacy-sports-dev-oauth-proxy-lambda-secrets (custom)
└── legacy-sports-dev-oauth-proxy-lambda-rds (custom)

Stats Lambda Role (legacy-sports-dev-stats-lambda-role):
├── AWSLambdaBasicExecutionRole (AWS managed)
├── legacy-sports-dev-stats-lambda-secrets (custom)
├── legacy-sports-dev-stats-lambda-sqs (custom)
└── legacy-sports-dev-stats-lambda-rds (custom)

Game Selection Role (legacy-sports-dev-game-selection-lambda-role):
├── AWSLambdaBasicExecutionRole (AWS managed)
├── legacy-sports-dev-game-selection-lambda-secrets (custom)
└── legacy-sports-dev-game-selection-lambda-rds (custom)
```

### **Custom Policies**

```
Secrets Access Policy:
├── Action: secretsmanager:GetSecretValue, DescribeSecret
└── Resource: Database credentials, OAuth secrets, JWT keys

RDS Access Policy:
├── Action: rds-db:connect
└── Resource: PostgreSQL instance users

SQS Access Policy (Stats Lambda only):
├── Action: sqs:ReceiveMessage, DeleteMessage, GetQueueAttributes
└── Resource: legacy-sports-dev-load-season-stats.fifo
```

## 🌍 **External Dependencies**

### **Third-Party Integrations**

```
Baseball Reference API:
├── Access Method: Direct HTTPS (External Lambdas)
├── Functions: Stats Lambda, Game Selection Lambda
├── Data: Player statistics, game information
└── Rate Limiting: Managed by Lambda concurrency

Google OAuth:
├── Client ID: Configured via environment variable
├── Client Secret: Stored in Secrets Manager
├── Scopes: Basic profile information
└── Redirect: Handled by OAuth Proxy Lambda
```

## 📊 **Cost Optimization Summary**

### **Implemented Optimizations**

```
Network Optimization (Completed):
├── NAT Gateway Removal: -$45.00/month
├── VPC Endpoints Addition: +$7.20/month
└── Net Network Savings: -$37.80/month (84% reduction)

Compute Optimization (Completed):
├── Lambda Memory Scaling: Dev uses 50% of prod memory
├── Lambda Timeout Tuning: Reduced timeouts for dev
├── External Lambda Architecture: Faster cold starts
└── Estimated Monthly Savings: ~$15-20/month

Storage Optimization (Completed):
├── RDS Storage: 20GB (dev) vs 100GB (prod)
├── Log Retention: 7 days (dev) vs 14 days (prod)
├── S3 Lifecycle Policies: Automatic archival
└── Performance Insights: Disabled in dev

Total Monthly Savings: ~$50-60/month
```

### **Cost Breakdown (Development Environment)**

```
┌─────────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Service Category    │ Before          │ After           │ Monthly Savings │
├─────────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ Network (NAT/VPC)   │ ~$45.00        │ ~$7.20          │ -$37.80         │
│ Compute (Lambda)    │ ~$25.00        │ ~$10.00         │ -$15.00         │
│ Storage (RDS/S3)    │ ~$20.00        │ ~$12.00         │ -$8.00          │
│ Monitoring/Logs     │ ~$5.00         │ ~$2.00          │ -$3.00          │
├─────────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ TOTALS              │ ~$95.00        │ ~$31.20         │ -$63.80/month   │
└─────────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

## 🚀 **Deployment Process**

### **Infrastructure Deployment**

```
Terraform Configuration:
├── State Management: S3 backend (remote state)
├── Environment: Specified via terraform.tfvars
├── Region: us-east-1
└── Deployment Command: terraform apply -var-file="terraform.tfvars"

Key Configuration Files:
├── terraform.tfvars (environment config)
├── variables.tf (variable definitions)
├── outputs.tf (resource outputs)
├── main.tf (provider configuration)
├── vpc.tf (networking)
├── database.tf (RDS configuration)
├── lambda-*.tf (Lambda functions)
├── api_gateway.tf (API Gateway)
├── security_groups.tf (security rules)
├── secrets.tf (secret management)
├── vpc-endpoints.tf (VPC endpoints)
└── sqs.tf (message queues)
```

### **Lambda Deployment**

```
Deployment Methods:
├── Direct: Terraform via S3 bucket deployment
├── CI/CD: Automated via GitHub Actions (future)
└── Manual: Local build and upload

Build Process:
1. Source: lambdas/{function}/src/
2. Build: pnpm exec nx run {function}:build
3. Package: Create deployment ZIP
4. Upload: S3 bucket with versioning
5. Deploy: Terraform Lambda function update
```

## 🔧 **Maintenance & Operations**

### **Monitoring Checklist**

```
Daily Checks:
├── Lambda Function Errors (CloudWatch)
├── API Gateway 5xx Errors
├── RDS CPU/Memory Usage
└── SQS Message Processing

Weekly Checks:
├── Cost Analysis (AWS Cost Explorer)
├── Security Group Review
├── Log Analysis
└── Performance Metrics

Monthly Checks:
├── Cost Optimization Review
├── Security Patch Updates
├── Backup Validation
└── Capacity Planning
```

### **Scaling Considerations**

```
Production Migration:
├── Lambda Memory: Increase 2x (dev → prod)
├── RDS Instance: Scale to db.t3.small or larger
├── Storage: Increase allocated storage
├── Monitoring: Enable Performance Insights
├── Backup: Increase retention to 7 days
└── Log Retention: Increase to 14+ days

Traffic Scaling:
├── API Gateway: Automatically scales
├── Lambda: Concurrent execution limits
├── RDS: Consider Read Replicas for read traffic
└── SQS: FIFO queues handle message ordering
```

## 🔐 **Security Considerations**

### **Network Security**

```
VPC Security:
├── Private subnets for sensitive functions
├── Security groups with least privilege
├── VPC endpoints for AWS service access
└── No public internet access for core APIs

Data Security:
├── RDS encryption at rest (GP3 SSD)
├── Secrets Manager for credential storage
├── IAM roles with minimal permissions
└── API Gateway with regional endpoints
```

### **Access Control**

```
Lambda Functions:
├── Function-specific IAM roles
├── Resource-based policies
├── VPC network isolation
└── Environment variable encryption

Database:
├── Security group restrictions
├── Encrypted storage
├── Managed credentials rotation
└── Connection limit management
```

## 📞 **Troubleshooting Guide**

### **Common Issues**

```
Lambda Timeout Errors:
├── Check: CloudWatch Logs for execution duration
├── Solution: Increase timeout or optimize code
└── VPC Impact: External Lambdas have faster cold starts

Database Connection Issues:
├── Check: Security group rules
├── Check: VPC endpoint connectivity (VPC Lambdas)
├── Solution: Verify secrets manager access
└── Debug: Test database connectivity

API Gateway 5xx Errors:
├── Check: Lambda function logs
├── Check: Integration configuration
├── Solution: Review Lambda permissions
└── Debug: Test Lambda functions directly

Cost Spike Alerts:
├── Check: AWS Cost Explorer
├── Review: Lambda invocation counts
├── Analyze: Data transfer charges
└── Optimize: Review resource sizing
```

## 📜 **Infrastructure Change Log**

### September 26, 2025 - Legacy Resource Decommissioning

**Type**: Infrastructure cleanup and optimization  
**Impact**: Cost reduction, improved maintainability, simplified architecture  
**Executed By**: Infrastructure Team

#### Resources Removed:

**Legacy API Gateways (2 instances)**:

- `aws_api_gateway_rest_api.legacy_main`
  - Name: `legacy-sports-dev-api`
  - ID: `u65oy98s9d`
  - Type: Regional
  - Status: ✅ Destroyed
- `aws_api_gateway_rest_api.serverless_graphql`
  - Name: `dev-legacy-sports-graphql`
  - ID: `89vohxs7ta`
  - Type: Edge
  - Status: ✅ Destroyed

**Legacy Lambda Function & IAM Role**:

- `aws_lambda_function.legacy_graphql`
  - Name: `legacy-sports-graphql-dev-graphql`
  - Runtime: Node.js 20.x
  - Memory: 1024MB
  - Status: ✅ Destroyed
- `aws_iam_role.legacy_graphql_lambda`
  - Name: `legacy-sports-graphql-dev-us-east-1-lambdaRole`
  - Status: ✅ Destroyed

**Legacy S3 Bucket & Configurations**:

- `aws_s3_bucket.legacy_lambda_deployments`
  - Name: `legacy-sports-dev-lambdas-f3d4b778`
  - Size: ~30MB (37 object versions + 37 delete markers removed)
  - Status: ✅ Destroyed
- Associated bucket policies, encryption, and versioning configurations
  - Status: ✅ All destroyed

#### Impact Assessment:

**Cost Savings**:

- 2 unused API Gateway instances eliminated
- 1 unused Lambda function eliminated
- 1 unused S3 bucket with storage costs eliminated
- Reduced AWS resource complexity

**Architecture Improvements**:

- Simplified infrastructure with single active API Gateway
- Consolidated Lambda deployment strategy
- Cleaner Terraform state management
- Improved operational clarity

**Active Resources (Unchanged)**:

- Current API Gateway: `dtx9mcsty1.execute-api.us-east-1.amazonaws.com/dev`
- All active Lambda functions (GraphQL, OAuth, Stats, Game Selection, User Manager)
- PostgreSQL RDS instance and networking
- VPC, subnets, security groups, and VPC endpoints
- All Secrets Manager secrets and SSM parameters

#### Verification:

- [x] All legacy resources successfully destroyed
- [x] Active infrastructure functioning normally
- [x] No impact to application functionality
- [x] Terraform configuration updated and documented
- [x] Cost monitoring confirms resource removal

---

**Document Version**: 1.1  
**Last Updated**: September 26, 2025  
**Next Review**: October 26, 2025  
**Maintained By**: Infrastructure Team
