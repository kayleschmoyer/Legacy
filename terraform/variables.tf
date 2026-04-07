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

variable "lambda_error_alarm_threshold" {
  description = "Number of Lambda errors within the evaluation period that triggers an alarm"
  type        = number
  default     = 5
}

variable "lambda_error_alarm_period" {
  description = "CloudWatch metric period in seconds (length of each data point window). The total evaluation window is period * evaluation_periods."
  type        = number
  default     = 300 # 5 minutes
}

variable "lambda_error_alarm_evaluation_periods" {
  description = "Number of consecutive periods the threshold must be breached before alarming. The total evaluation window is period * evaluation_periods."
  type        = number
  default     = 1
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

variable "monthly_budget_amount" {
  description = "Monthly AWS budget limit in USD (default $200). Budget alerts fire at 50%, 80%, and 100% ACTUAL thresholds plus an 80% FORECASTED threshold."
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

# ── Self-hosted GitHub Actions runners ────────────────────────────────────────

variable "enable_github_runners" {
  description = "Enable self-hosted GitHub Actions runners on EC2 spot instances"
  type        = bool
  default     = false
}

variable "enable_ci_runner_db_access" {
  description = "Create an ingress SG rule allowing self-hosted CI runner subnets (VPC public CIDRs) to reach RDS on port 5432. Decoupled from enable_github_runners so it is managed by the normal Terraform apply loop. Set this to true in addition to enable_github_runners whenever self-hosted runners require DB connectivity."
  type        = bool
  default     = false
}

variable "github_runners_instance_types" {
  description = "EC2 instance types for runners, in priority order (spot fleet diversification)"
  type        = list(string)
  default     = ["c7a.xlarge", "c6a.xlarge", "c7i.xlarge", "m7a.xlarge"]
}

variable "github_runners_max_count" {
  description = "Maximum number of concurrent runner instances"
  type        = number
  default     = 20
}

# LS-2429: Version-scoped runner AMI selection.
#
# This variable drives the AMI name filter in module "github_runners" so that
# terraform picks the newest AMI whose name starts with
# "legacy-sports-runner-pw<runner_ami_playwright_version>-". The actual value
# lives in terraform/runner-ami.auto.tfvars (committed) so that every Playwright
# bump PR updates it atomically alongside pnpm-lock.yaml and the Packer
# playwright_version default. CI enforces all three are in sync via the
# runner-ami-drift-check workflow — drift is a hard block on merge.
#
# Rollback strategy: previous-version AMIs remain in the account until pruned by
# the scheduled prune-runner-amis workflow. Reverting the Playwright bump PR
# restores this variable to the prior value, the filter picks up the still-present
# older AMI, and the launch template reverts on next terraform apply.
variable "runner_ami_playwright_version" {
  description = "Playwright version that must be present in the target runner AMI. Matched against the AMI name prefix 'legacy-sports-runner-pw<version>-'. Must equal the resolved playwright-core version in pnpm-lock.yaml and the playwright_version default in terraform/packer/runner-ami.pkr.hcl. Intentionally has NO default — terraform/runner-ami.auto.tfvars is the single source of truth, and any plan/apply that cannot find a value here will fail fast (per Copilot review on PR #2281)."
  type        = string
}

variable "github_app_id" {
  description = "GitHub App ID for self-hosted runner registration"
  type        = string
  default     = ""
}

variable "github_app_key_base64" {
  description = "GitHub App private key (base64-encoded PEM)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_app_webhook_secret" {
  description = "Shared secret for GitHub webhook HMAC signature verification"
  type        = string
  sensitive   = true
  default     = ""
}

# IMPORTANT: mlb-statsapi is NOT licensed for commercial/production use.
# Production must use a licensed provider (balldontlie, rolling-insights, etc.)
# Production deploys with "mlb-statsapi" are blocked by the CI deploy gate (LS-1868).
variable "mlb_data_provider" {
  description = "MLB data provider to use. Dev default is mlb-statsapi (free, unlicensed). Production must use a licensed provider."
  type        = string
  default     = "mlb-statsapi"

  validation {
    condition     = contains(["mlb-statsapi", "balldontlie", "rolling-insights"], var.mlb_data_provider)
    error_message = "mlb_data_provider must be one of: mlb-statsapi, balldontlie, rolling-insights."
  }
}

variable "mlb_data_api_key" {
  description = "API key for the MLB data provider. Leave empty for mlb-statsapi (no key required). Required for balldontlie and rolling-insights in production."
  type        = string
  sensitive   = true
  default     = ""

  validation {
    condition     = var.mlb_data_provider == "mlb-statsapi" || length(var.mlb_data_api_key) > 0
    error_message = "mlb_data_api_key must be non-empty when mlb_data_provider is not mlb-statsapi."
  }
}
