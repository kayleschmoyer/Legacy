# Terraform Cost Optimization Summary

## 🎯 Implemented Cost Optimizations (September 2025)

### Environment-Based Resource Scaling

The infrastructure now dynamically scales resources based on the `environment` variable:

#### CloudWatch Log Retention

Defined in `local.log_retention_days` (`variables.tf`):

- **Development**: 30 days retention
- **Staging**: 30 days retention
- **Production**: 90 days retention

#### Backup Retention

Defined in `local.backup_retention_days` (`variables.tf`):

- **Development / Staging**: 7 days
- **Production**: 30 days

#### Lambda Memory Allocation

- **GraphQL Lambda**:
  - Dev: 512MB, Prod: 1024MB
  - Estimated savings: 20-30% on Lambda costs for dev
- **OAuth Proxy**:
  - Dev: 512MB, Prod: 1024MB
- **Stats Lambda**:
  - Dev: 256MB + 10min timeout, Prod: 512MB + 5min timeout
  - Note: the dev timeout (600s) exceeds prod (300s) — see `lambda-stats.tf`.

### Already Optimized Components

#### RDS PostgreSQL

- ✅ Instance: `db.t3.micro` (smallest available)
- ✅ Storage: 20GB with auto-scaling to 50GB max
- ✅ Backup retention: 7 days (dev/staging), 30 days (prod)
- ✅ Performance Insights: Disabled (saves ~$7/month)
- ✅ Enhanced Monitoring: Disabled (saves ~$2/month)
- ✅ Multi-AZ: Single AZ for dev

#### RDS Proxy

- **Enabled** for the deployed stack via `infra.auto.tfvars`
  (`enable_rds_proxy = true`); the variable default remains `false`.
- Cost: ~$15-20/month. Kept deliberately: the VPC-attached Lambdas
  (GraphQL, websocket, draft-processor, stats, etc.) pool connections
  through the proxy into a `db.t3.micro`, which has very little connection
  headroom. Do not disable without first verifying peak Lambda concurrency
  against the instance's `max_connections`.

## 📊 Estimated Monthly Cost Impact

### Before Optimization

- Total: ~$25-35/month

### After Optimization

- **Development Environment**: ~$18-25/month (-25% reduction)
- **Production Environment**: ~$25-35/month (unchanged, maintains performance)

## 🛠️ Configuration Management

### Environment Variable Usage

```hcl
# Set environment in terraform.tfvars
environment = "dev"    # For cost-optimized development
environment = "prod"   # For production-grade resources
```

### Validation

Environment variable includes validation to prevent typos:

- Allowed values: `dev`, `staging`, `prod`
- Invalid values will cause Terraform to fail with clear error message

## 🔍 Monitoring & Optimization

### Future Optimization Opportunities

1. **Lambda Memory Monitoring**: Use CloudWatch metrics to fine-tune memory allocation
2. **Database Scaling**: Consider Aurora Serverless for variable workloads
3. **API Gateway Caching**: Implement caching for frequently accessed endpoints
4. **Reserved Instances**: Consider Reserved Instances for production stable workloads

### Cost Monitoring Setup

- Enable AWS Cost Explorer
- Set up billing alerts for unexpected cost increases
- Regular review of CloudWatch metrics for Lambda memory utilization

## 🎯 Best Practices Implemented

1. **Environment Segregation**: Different resource sizes for different environments
2. **Right-sizing**: Resources match actual usage patterns
3. **Retention Policies**: Shorter retention for non-critical environments
4. **Conditional Resources**: RDS Proxy behind a flag (currently enabled for connection pooling)
5. **Validation**: Prevent configuration errors with Terraform validation

## ⚡ Quick Start

To deploy with cost optimizations:

```bash
# Development (cost-optimized)
terraform apply -var="environment=dev"

# Production (performance-optimized)
terraform apply -var="environment=prod"
```

This configuration balances cost efficiency with operational requirements, ensuring development environments remain affordable while production maintains performance and reliability.
