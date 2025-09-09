variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
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
  default     = ["us-east-1a"]  # Reduced from 3 AZs to 1 for dev environment
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
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
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
  default     = false  # Disabled by default for dev cost savings
}
