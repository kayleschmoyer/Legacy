# =============================================================================
# SECRET VALUE VARIABLES (Set via secrets.auto.tfvars - never committed to git)
# =============================================================================

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret for authentication"
  type        = string
  sensitive   = true
}

variable "jwt_secret_key" {
  description = "JWT signing secret key for token validation (optional - will use random generation if not provided)"
  type        = string
  sensitive   = true
  default     = null
}

variable "oauth_proxy_cookie_secret" {
  description = "Cookie signing secret for OAuth proxy sessions (optional - will use random generation if not provided)"
  type        = string
  sensitive   = true
  default     = null
}

# =============================================================================
# GENERATED SECRETS
# =============================================================================

# Random password for database
resource "random_password" "database_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?" # Exclude problematic chars: /, @, ", space
}

# AWS Secrets Manager secrets
resource "aws_secretsmanager_secret" "database_credentials" {
  name_prefix = "${local.name_prefix}-db-creds-"
  description = "Database credentials for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database_credentials" {
  secret_id = aws_secretsmanager_secret.database_credentials.id
  secret_string = jsonencode({
    username = var.database_username
    password = random_password.database_password.result
  })
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.environment}/jwt-secret-key"
  description = "JWT secret key for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret_key != null ? var.jwt_secret_key : random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "google_oauth_client_secret" {
  name        = "${var.environment}/google-oauth-client-secret"
  description = "Google OAuth client secret for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "google_oauth_client_secret" {
  secret_id     = aws_secretsmanager_secret.google_oauth_client_secret.id
  secret_string = var.google_oauth_client_secret
}

resource "aws_secretsmanager_secret" "oauth_proxy_cookie_secret" {
  name        = "${var.environment}/oauth-proxy/cookie-secret"
  description = "OAuth proxy cookie secret for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "oauth_proxy_cookie_secret" {
  secret_id     = aws_secretsmanager_secret.oauth_proxy_cookie_secret.id
  secret_string = var.oauth_proxy_cookie_secret != null ? var.oauth_proxy_cookie_secret : random_bytes.oauth_proxy_cookie_key.base64
}

resource "random_bytes" "oauth_proxy_cookie_key" {
  length = 32 # 32 bytes = 256 bits for AES-256-GCM encryption
  keepers = {
    # Force recreation if we want to rotate the key
    version = "v1"
  }
}
