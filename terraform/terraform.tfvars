# Development environment configuration
aws_region   = "us-east-1"
environment  = "dev"
project_name = "legacy-sports"

# VPC Configuration - Optimized 2 AZ setup (required for RDS, single NAT for cost savings)
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"] # 2 AZs required for RDS, but we'll use 1 NAT Gateway

# Database Configuration
database_name        = "postgres"
database_username    = "postgres"
db_instance_class    = "db.t3.micro"
db_allocated_storage = 20

# Lambda Configuration - Cost optimized for dev environment
lambda_timeout       = 30
lambda_stats_timeout = 180 # 3 minutes for dev (vs 5 minutes prod)

# Network Configuration - Phase 1: NAT Gateway removal for maximum cost savings
nat_gateway_count = 0 # Removed NAT Gateway, using VPC endpoints instead - saves ~$38/month

# Cost Optimizations - RDS Proxy enabled for better Lambda database connectivity
enable_rds_proxy = true # Enabled to resolve Lambda DNS resolution issues (~$15/month)

# Google OAuth Configuration - REPLACE WITH YOUR ACTUAL CLIENT ID
google_oauth_client_id = "1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com"

# Public IP addresses allowed to access database for migrations and development
# Configured with current public IP for security
allowed_public_ips = ["71.182.228.7"] # Your current public IP - update if it changes

# Monitoring & Alerting
alert_email = "" # Set to an ops e-mail address to receive DLQ alarm notifications via SNS
