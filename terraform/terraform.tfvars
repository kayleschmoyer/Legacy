# Development environment configuration
aws_region     = "us-east-1"
environment    = "dev"
project_name   = "legacy-sports"

# VPC Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# Database Configuration
database_name     = "postgres"
database_username = "postgres"
db_instance_class = "db.t3.micro"
db_allocated_storage = 20

# Lambda Configuration
lambda_timeout = 30

# Google OAuth Configuration (update with your actual client ID if different)
google_oauth_client_id = "1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com"

# Public IP addresses allowed to access database for migrations
allowed_public_ips = ["0.0.0.0"]
