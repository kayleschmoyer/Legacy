# =============================================================================
# SECRET VALUE VARIABLES (Set via secrets.auto.tfvars - never committed to git)
# See secrets.auto.tfvars.example for required format and all expected keys.
# In CI these are supplied as TF_VAR_* environment variables from GitHub secrets.
# =============================================================================

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret for authentication"
  type        = string
  sensitive   = true
}

variable "jwt_secret_key" {
  description = "JWT signing secret key for token validation"
  type        = string
  sensitive   = true
}

variable "oauth_proxy_cookie_secret" {
  description = "Cookie signing secret for OAuth proxy sessions"
  type        = string
  sensitive   = true
}

variable "jira_credentials" {
  description = "Jira API credentials JSON for bug report proxy: {api_token, email, base_url}"
  type        = string
  sensitive   = true
}

variable "rollbar_access_token" {
  description = "Rollbar server-side (post_server_item) access token for Lambda error tracking"
  type        = string
  sensitive   = true
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
  secret_string = var.jwt_secret_key
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
  secret_string = var.oauth_proxy_cookie_secret
}

# System API key for EventBridge / admin CLI access to system mutations
resource "random_password" "system_api_key" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "system_api_key" {
  name_prefix = "${local.name_prefix}-system-api-key-"
  description = "System API key for EventBridge and admin CLI to call system mutations"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "system_api_key" {
  secret_id     = aws_secretsmanager_secret.system_api_key.id
  secret_string = random_password.system_api_key.result
}

# Jira credentials for the Jira Proxy Lambda
# Value is managed via TF_VAR_jira_credentials (GitHub Actions secret JIRA_CREDENTIALS)
# Format: {"api_token":"...","email":"...","base_url":"https://<org>.atlassian.net"}
resource "aws_secretsmanager_secret" "jira_credentials" {
  name        = "${local.name_prefix}-jira-credentials"
  description = "Jira API credentials (email + API token + base URL) for bug report proxy"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jira_credentials" {
  secret_id     = aws_secretsmanager_secret.jira_credentials.id
  secret_string = var.jira_credentials
}
