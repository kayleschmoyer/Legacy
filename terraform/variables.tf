variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev/staging/prod) - affects resource sizing for cost optimization"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "legacy-sports"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"] # Minimum 2 AZs required for RDS
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "postgres"
}

variable "database_username" {
  description = "Database master username"
  type        = string
  default     = "postgres"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds (standard functions)"
  type        = number
  default     = 30
}

variable "lambda_stats_timeout" {
  description = "Stats Lambda timeout in seconds (longer for data processing)"
  type        = number
  default     = 300
}

variable "google_oauth_client_id" {
  description = "Google OAuth Client ID"
  type        = string
  default     = "1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "allowed_public_ips" {
  description = "List of public IP addresses allowed to access the database directly (for migrations)"
  type        = list(string)
  default     = []
}

variable "enable_rds_proxy" {
  description = "Enable RDS Proxy (can be disabled for dev to save costs)"
  type        = bool
  default     = false # Disabled by default for dev cost savings
}

variable "nat_gateway_count" {
  description = "Number of NAT Gateways to create (1 for cost savings, same as AZ count for high availability)"
  type        = number
  default     = 0 # Disabled by default - use NAT instance instead for cost savings
}

variable "use_nat_instance" {
  description = "Use lightweight NAT instance instead of expensive NAT Gateway for internet access"
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "E-mail address to receive CloudWatch ops-alert notifications (leave empty to disable e-mail subscription)"
  type        = string
  default     = ""
}

# Route 53 / DNS Configuration
variable "domain_name" {
  description = "Primary domain name for the application (e.g., legacysports.com)"
  type        = string
  default     = "legacy-fantasy.com" # Set in terraform.tfvars or via -var flag
}

variable "github_username" {
  description = "GitHub username/organization for GitHub Pages (e.g., bkrupa)"
  type        = string
  default     = "bkrupa"
}

variable "stripe_publishable_key" {
  description = "Stripe publishable key for client-side payment integration"
  type        = string
  default     = ""
}

variable "stripe_trial_period_days" {
  description = "Number of free trial days offered on new subscriptions (0 = no trial)"
  type        = number
  default     = 0
}

variable "stripe_grace_period_days" {
  description = "Number of days a past_due subscriber retains premium access while payment retries are in progress"
  type        = number
  default     = 7
}

variable "api_gateway_throttle_rate_limit" {
  description = "API Gateway REST stage default throttle rate limit in requests per second (steady token-bucket rate; with method_path = \"*/*\" this applies to all REST resources/methods in the stage, including GraphQL, OAuth, Stats, Game Selection, /badge, etc.)"
  type        = number
  default     = 50 # 50 req/sec = ~3 000 req/min across all clients
}

variable "api_gateway_throttle_burst_limit" {
  description = "API Gateway REST stage default throttle burst limit (token-bucket burst capacity: how many requests can temporarily exceed the steady rate; not a max concurrent in-flight/Lambda concurrency value)"
  type        = number
  default     = 200
}

# ── Per-environment retention maps ──────────────────────────────────────────────
# Explicit maps so staging gets its own values instead of falling through to the
# prod branch of a ternary.
locals {
  log_retention_days = {
    dev     = 30
    staging = 30
    prod    = 90
  }
  backup_retention_days = {
    dev     = 7
    staging = 7
    prod    = 30
  }
}
