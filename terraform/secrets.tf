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
  description = "Jira OAuth 2.0 credentials JSON for bug report proxy: {client_id, client_secret, cloud_id, site_url}"
  type        = string
  sensitive   = true
}

variable "rollbar_access_token" {
  description = "Rollbar server-side (post_server_item) access token for Lambda error tracking"
  type        = string
  sensitive   = true
}

variable "ga_measurement_id" {
  description = "GA4 measurement ID (e.g. G-XXXXXXXXXX) for server-side Measurement Protocol events"
  type        = string
  default     = ""
}

variable "ga_api_secret" {
  description = "GA4 Measurement Protocol API secret for server-side event sending"
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_secret_key" {
  description = "Stripe API secret key for payment processing"
  type        = string
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook endpoint signing secret for verifying webhook payloads"
  type        = string
  sensitive   = true
}

variable "discord_webhook_url" {
  description = "Discord webhook URL for posting Rollbar and CloudWatch alarm notifications"
  type        = string
  sensitive   = true
}

variable "discord_user_signup_webhook_url" {
  description = "Discord webhook URL for new-user signup notifications (oauth-proxy Lambda)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_stripe_webhook_url" {
  description = "Discord webhook URL for Stripe event notifications (stripe-webhook Lambda)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_client_id" {
  description = "Discord OAuth application client ID"
  type        = string
  default     = ""
}

variable "discord_client_secret" {
  description = "Discord OAuth application client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_redirect_uri" {
  description = "Discord OAuth redirect URI (e.g. https://legacy-fantasy.com/auth/discord/callback)"
  type        = string
  default     = ""
}

variable "rollbar_webhook_secret" {
  description = "Rollbar webhook signing secret for HMAC-SHA256 signature verification"
  type        = string
  sensitive   = true
  default     = ""
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

  # TODO: Automatic rotation requires a rotation Lambda (e.g.
  # SecretsManagerRDSPostgreSQLRotationSingleUser) and migrating away from
  # random_password so the Lambda — not Terraform — owns credential lifecycle.
  # See LS-784.

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database_credentials" {
  secret_id = aws_secretsmanager_secret.database_credentials.id
  secret_string = jsonencode({
    username = var.database_username
    password = random_password.database_password.result
  })
}

# =============================================================================
# EXTERNALLY-MANAGED SECRETS (no rotation_rules)
# These secrets are provided by third-party services (Google, Stripe, Jira) or
# require application-level coordination (JWT — needs grace period for existing
# tokens). Rotation must be performed manually via the provider's dashboard and
# updated in secrets.auto.tfvars / GitHub Actions secrets.
# =============================================================================

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

  # TODO: Automatic rotation requires a rotation Lambda and updating consumers
  # (EventBridge rules, admin CLI) to resolve credentials from Secrets Manager
  # at runtime instead of random_password. See LS-784.

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "system_api_key" {
  secret_id     = aws_secretsmanager_secret.system_api_key.id
  secret_string = random_password.system_api_key.result
}

# Stripe API secret key for payment processing
resource "aws_secretsmanager_secret" "stripe_secret_key" {
  name        = "${var.environment}/stripe-secret-key"
  description = "Stripe API secret key for payment processing"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "stripe_secret_key" {
  secret_id     = aws_secretsmanager_secret.stripe_secret_key.id
  secret_string = var.stripe_secret_key
}

# Stripe webhook endpoint signing secret
resource "aws_secretsmanager_secret" "stripe_webhook_secret" {
  name        = "${var.environment}/stripe-webhook-secret"
  description = "Stripe webhook endpoint signing secret for verifying webhook payloads"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "stripe_webhook_secret" {
  secret_id     = aws_secretsmanager_secret.stripe_webhook_secret.id
  secret_string = var.stripe_webhook_secret
}

# Jira credentials for the Jira Proxy Lambda
# Value is managed via TF_VAR_jira_credentials (GitHub Actions secret JIRA_CREDENTIALS)
# Format: {"client_id":"...","client_secret":"...","cloud_id":"...","site_url":"https://<org>.atlassian.net"}
resource "aws_secretsmanager_secret" "jira_credentials" {
  name        = "${local.name_prefix}-jira-credentials"
  description = "Jira OAuth 2.0 credentials (service account client credentials) for bug report proxy"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jira_credentials" {
  secret_id     = aws_secretsmanager_secret.jira_credentials.id
  secret_string = var.jira_credentials
}

# Rollbar webhook signing secret for the Rollbar Discord notification Lambda
resource "aws_secretsmanager_secret" "rollbar_webhook_secret" {
  name        = "${var.environment}/rollbar-webhook-secret"
  description = "Rollbar webhook signing secret for HMAC-SHA256 signature verification"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "rollbar_webhook_secret" {
  secret_id     = aws_secretsmanager_secret.rollbar_webhook_secret.id
  secret_string = var.rollbar_webhook_secret
}

# Discord OAuth client secret for Discord login/account linking
resource "aws_secretsmanager_secret" "discord_client_secret" {
  count       = var.discord_client_secret != "" ? 1 : 0
  name        = "${var.environment}/discord-client-secret"
  description = "Discord OAuth client secret for login and account linking"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "discord_client_secret" {
  count         = var.discord_client_secret != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.discord_client_secret[0].id
  secret_string = var.discord_client_secret
}

resource "aws_secretsmanager_secret" "mlb_data_api_key" {
  count       = var.mlb_data_api_key != "" ? 1 : 0
  name        = "${var.environment}/mlb-data-api-key"
  description = "API key for the licensed MLB data provider (balldontlie, rolling-insights, etc.)"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "mlb_data_api_key" {
  count         = var.mlb_data_api_key != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.mlb_data_api_key[0].id
  secret_string = var.mlb_data_api_key
}

# Discord webhook URL for the Rollbar Discord notification Lambda
resource "aws_secretsmanager_secret" "discord_webhook_url" {
  name        = "${var.environment}/discord-webhook-url"
  description = "Discord webhook URL for posting Rollbar and CloudWatch alarm notifications"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "discord_webhook_url" {
  secret_id     = aws_secretsmanager_secret.discord_webhook_url.id
  secret_string = var.discord_webhook_url
}

# =============================================================================
# CI READONLY DATABASE CREDENTIALS
# =============================================================================
# A minimal read-only PostgreSQL user used exclusively by GitHub Actions CI to
# verify that all migration files have been applied to the database.
# The ci_readonly role is created by migration 20260303_150000_add_ci_readonly_role.ts.

resource "random_password" "ci_readonly_db_password" {
  length  = 32
  special = false # Avoid special chars that can break PostgreSQL connection strings
}

resource "aws_secretsmanager_secret" "ci_readonly_db_credentials" {
  name_prefix = "${local.name_prefix}-ci-readonly-db-creds-"
  description = "Read-only DB credentials for CI migration state checks (ci_readonly Postgres role)"

  # TODO: Automatic rotation requires a rotation Lambda and a mechanism to
  # ALTER the ci_readonly Postgres role password in sync. See LS-784.

  tags = merge(local.common_tags, {
    Component = "ci"
    Purpose   = "migration-check"
  })
}

resource "aws_secretsmanager_secret_version" "ci_readonly_db_credentials" {
  secret_id = aws_secretsmanager_secret.ci_readonly_db_credentials.id
  secret_string = jsonencode({
    username = "ci_readonly"
    password = random_password.ci_readonly_db_password.result
    host     = aws_db_instance.postgres.address
    port     = 5432
    database = var.database_name
  })
}
