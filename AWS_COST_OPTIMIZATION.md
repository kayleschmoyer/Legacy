# AWS Cost Optimization for Development Environment

## 💰 Estimated Monthly Savings: **~$97-104**

This document outlines the cost optimizations made to reduce AWS spending for the development environment while maintaining functionality.

## 🎯 Major Cost Reductions

### 1. NAT Gateway Optimization - **SAVE ~$90/month**

**Before**: 3 NAT Gateways across 3 AZs ($45/month each = $135/month)
**After**: 1 NAT Gateway in single AZ ($45/month)

**Changes Made**:

- Reduced `availability_zones` from `["us-east-1a", "us-east-1b", "us-east-1c"]` to `["us-east-1a"]`
- This automatically reduces:
  - NAT Gateways: 3 → 1
  - Elastic IPs: 3 → 1
  - Public Subnets: 3 → 1
  - Private Subnets: 6 → 2 (Lambda + Database)

**Impact**: Single point of failure for internet access, but acceptable for development.

### 2. RDS Optimization - **SAVE ~$7-12/month**

#### Performance Insights Disabled - **SAVE ~$5/month**

- `performance_insights_enabled = false`
- Removes $0.18/hour charge for insights

#### Enhanced Monitoring Disabled - **SAVE ~$2-3/month**

- `monitoring_interval = 0`
- Removes CloudWatch detailed monitoring costs

#### Backup Retention Reduced - **SAVE ~$1-2/month**

- `backup_retention_period = 1` (reduced from 7 days)
- Reduces backup storage costs

#### Storage Auto-scaling Limit Reduced - **SAVE ~$1-2/month**

- `max_allocated_storage = 50` (reduced from 100GB)
- Prevents unnecessary storage growth

### 3. Optional RDS Proxy Removal - **SAVE ~$7/month**

**Before**: RDS Proxy always enabled ($0.015/hour = ~$10.8/month)
**After**: Disabled by default for dev (`enable_rds_proxy = false`)

**Benefits**:

- Direct database connections for Lambda functions
- Reduced latency
- Lower costs

**Note**: Can be re-enabled by setting `enable_rds_proxy = true` if connection pooling is needed.

## 🔧 Configuration Changes

### variables.tf

```hcl
# Reduced from 3 AZs to 1
variable "availability_zones" {
  default = ["us-east-1a"]
}

# New variable to optionally disable RDS Proxy
variable "enable_rds_proxy" {
  description = "Enable RDS Proxy (can be disabled for dev to save costs)"
  type        = bool
  default     = false
}
```

### database.tf

```hcl
# Optimized backup settings
backup_retention_period = 1  # Reduced from 7 days
max_allocated_storage = 50   # Reduced from 100GB

# Disabled performance monitoring
performance_insights_enabled = false
monitoring_interval = 0

# Made RDS Proxy conditional
resource "aws_db_proxy" "main" {
  count = var.enable_rds_proxy ? 1 : 0
  # ... rest of configuration
}
```

## 📊 Cost Breakdown

| Component                | Before     | After     | Savings         |
| ------------------------ | ---------- | --------- | --------------- |
| NAT Gateways             | $135/month | $45/month | **$90/month**   |
| RDS Performance Insights | $5/month   | $0        | **$5/month**    |
| RDS Enhanced Monitoring  | $3/month   | $0        | **$3/month**    |
| RDS Proxy                | $7/month   | $0        | **$7/month**    |
| Backup Storage           | $2/month   | $1/month  | **$1/month**    |
| **TOTAL SAVINGS**        |            |           | **~$106/month** |

## 🚨 Development Considerations

### Reduced High Availability

- **Single AZ**: Infrastructure is now in one availability zone
- **Single NAT Gateway**: Internet access has a single point of failure
- **Impact**: Service disruption if AZ has issues (rare but possible)

### RDS Proxy Disabled

- **Lambda Connections**: Direct to database instead of through proxy
- **Connection Pooling**: No automatic connection management
- **Impact**: Potential connection limit issues with high concurrent usage

### Reduced Monitoring

- **Performance Insights**: No detailed database performance metrics
- **Enhanced Monitoring**: Basic CloudWatch metrics only
- **Impact**: Less visibility into database performance issues

## 🔄 How to Re-enable Features

### Re-enable High Availability

```hcl
# In variables.tf
variable "availability_zones" {
  default = ["us-east-1a", "us-east-1b", "us-east-1c"]
}
```

### Re-enable RDS Proxy

```hcl
# In variables.tf or terraform.tfvars
enable_rds_proxy = true
```

### Re-enable RDS Monitoring

```hcl
# In database.tf
performance_insights_enabled = true
monitoring_interval = 60
```

## 📈 Deployment Commands

```bash
# Apply the optimizations
terraform plan
terraform apply

# If you disabled RDS Proxy, update environment variables
./scripts/sync-env.ps1 -DatabaseEndpoint direct
```

## ⚠️ Important Notes

1. **Backup Recovery**: With 1-day retention, only recent backups available
2. **Monitoring**: Reduced visibility requires more proactive monitoring
3. **Scaling**: Single AZ limits scaling options
4. **Production**: These optimizations should be REVERTED for production environment

## 💡 Additional Savings Opportunities

### Future Considerations:

1. **RDS Instance Scheduling**: Stop RDS during non-work hours (requires automation)
2. **Lambda Reserved Concurrency**: Set limits to prevent unexpected charges
3. **CloudWatch Log Retention**: Set shorter retention periods for development logs
4. **S3 Lifecycle Policies**: Automatic cleanup of old deployment artifacts

## 🎯 Recommendation

For development environment, these changes provide excellent cost savings while maintaining core functionality. Consider implementing RDS scheduling for additional 60-70% database cost reduction during off-hours.
