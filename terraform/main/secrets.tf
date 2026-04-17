# =============================================================================
# SECRET VALUE VARIABLES
# Only variables used directly as Lambda environment variables are declared here.
# In CI these are supplied as TF_VAR_* environment variables from GitHub secrets.
# Locally, set them in secrets.auto.tfvars (never commit this file).
#
# Secrets that are only stored in AWS Secrets Manager (fetched by Lambdas at
# runtime) are NOT managed here — set them directly via AWS CLI:
#   aws secretsmanager put-secret-value --secret-id dev/<name> --secret-string <value>
#
# BOOTSTRAPPING A NEW ENVIRONMENT: After terraform apply creates the secret
# containers, populate their values before starting any Lambdas:
#   aws secretsmanager put-secret-value --secret-id dev/jwt-secret-key --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/google-oauth-client-secret --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/oauth-proxy/cookie-secret --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/stripe-secret-key --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/stripe-webhook-secret --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/jira-credentials --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/rollbar-webhook-secret --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/discord-webhook-url --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/discord-user-signup-webhook-url --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/discord-stripe-webhook-url --secret-string <value>
#   aws secretsmanager put-secret-value --secret-id dev/ga-api-secret --secret-string <value>
#
# MLB data provider key (only required when mlb_data_provider != "mlb-statsapi"):
#   Unlike the above, this secret is managed by Terraform only when
#   mlb_data_api_key is provided via secrets.auto.tfvars (local) or the
#   MLB_DATA_API_KEY GitHub secret (CI). In that case Terraform creates and
#   populates the <env>/mlb-data-api-key Secrets Manager secret automatically.
#   If mlb_data_api_key is empty, Terraform does not create/populate that secret.
#   Non-statsapi providers require mlb_data_api_key via variable validation.
#   The Stats Lambda receives MLB_DATA_API_KEY_SECRET_NAME pointing to the
#   secret and fetches the value at cold-start.
# =============================================================================

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

# Cloudflare Workers AI credentials for image NSFW classification
variable "cloudflare_account_id" {
  description = "Cloudflare account ID for Workers AI API calls"
  type        = string
  default     = ""
}

variable "cloudflare_ai_api_token" {
  description = "Cloudflare API token with Workers AI read permissions for NSFW image classification"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# Externally-managed secret values — declared but no longer consumed by terraform
# =============================================================================
# These variables exist solely to silence "Value for undeclared variable" warnings
# from secrets.auto.tfvars / TF_VAR_* env vars in CI. The corresponding
# aws_secretsmanager_secret_version resources were removed (see the `removed { }`
# blocks at the bottom of this file) so terraform no longer writes the values —
# they're set directly via `aws secretsmanager put-secret-value`. The secret
# CONTAINERS (aws_secretsmanager_secret) are still managed by terraform; just the
# version contents are externally managed.
#
# The variables stay declared so that:
#   1. secrets.auto.tfvars and the TF_VAR_* env vars in CI don't trigger warnings
#   2. The full surface area of secret values the project uses is documented in code
#   3. If we ever decide to put terraform back in charge of secret values, the
#      variables already exist and can be wired into new aws_secretsmanager_secret_version
#      resources without changing the bootstrap path

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret. Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/google-oauth-client-secret`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "jwt_secret_key" {
  description = "JWT signing secret. Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/jwt-secret-key`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "oauth_proxy_cookie_secret" {
  description = "OAuth proxy cookie signing secret. Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/oauth-proxy/cookie-secret`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_secret_key" {
  description = "Stripe API secret key. Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/stripe-secret-key`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret. Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/stripe-webhook-secret`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "jira_credentials" {
  description = "Jira OAuth 2.0 credentials JSON blob (client_id, client_secret, cloud_id, site_url). Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/jira-credentials`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "rollbar_webhook_secret" {
  description = "Rollbar webhook HMAC signing secret. Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/rollbar-webhook-secret`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_webhook_url" {
  description = "Discord webhook URL for Rollbar/CloudWatch alarm notifications. Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/discord-webhook-url`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_user_signup_webhook_url" {
  description = "Discord webhook URL for new-user signup notifications (oauth-proxy Lambda). Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/discord-user-signup-webhook-url --secret-string <value>`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "discord_stripe_webhook_url" {
  description = "Discord webhook URL for Stripe event notifications (stripe-webhook Lambda). Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/discord-stripe-webhook-url --secret-string <value>`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "ga_api_secret" {
  description = "GA4 Measurement Protocol API secret for server-side event sending (stripe-webhook Lambda). Set in AWS Secrets Manager directly via `aws secretsmanager put-secret-value --secret-id <env>/ga-api-secret --secret-string <value>`."
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

resource "aws_secretsmanager_secret" "google_oauth_client_secret" {
  name        = "${var.environment}/google-oauth-client-secret"
  description = "Google OAuth client secret for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "oauth_proxy_cookie_secret" {
  name        = "${var.environment}/oauth-proxy/cookie-secret"
  description = "OAuth proxy cookie secret for Legacy Sports"

  tags = local.common_tags
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

# Stripe webhook endpoint signing secret
resource "aws_secretsmanager_secret" "stripe_webhook_secret" {
  name        = "${var.environment}/stripe-webhook-secret"
  description = "Stripe webhook endpoint signing secret for verifying webhook payloads"

  tags = local.common_tags
}

# Jira credentials for the Jira Proxy Lambda
# Format: {"client_id":"...","client_secret":"...","cloud_id":"...","site_url":"https://<org>.atlassian.net"}
resource "aws_secretsmanager_secret" "jira_credentials" {
  name        = "${var.environment}/jira-credentials"
  description = "Jira OAuth 2.0 credentials (service account client credentials) for bug report proxy"

  tags = local.common_tags
}

# Rollbar webhook signing secret for the Rollbar Discord notification Lambda
resource "aws_secretsmanager_secret" "rollbar_webhook_secret" {
  name        = "${var.environment}/rollbar-webhook-secret"
  description = "Rollbar webhook signing secret for HMAC-SHA256 signature verification"

  tags = local.common_tags
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

# Discord webhook URL for new-user signup notifications (oauth-proxy Lambda)
resource "aws_secretsmanager_secret" "discord_user_signup_webhook_url" {
  name        = "${var.environment}/discord-user-signup-webhook-url"
  description = "Discord webhook URL for posting new-user signup notifications"

  tags = local.common_tags
}

# Discord webhook URL for Stripe event notifications (stripe-webhook Lambda)
resource "aws_secretsmanager_secret" "discord_stripe_webhook_url" {
  name        = "${var.environment}/discord-stripe-webhook-url"
  description = "Discord webhook URL for posting Stripe subscription lifecycle notifications"

  tags = local.common_tags
}

# GA4 Measurement Protocol API secret (stripe-webhook Lambda)
resource "aws_secretsmanager_secret" "ga_api_secret" {
  name        = "${var.environment}/ga-api-secret"
  description = "GA4 Measurement Protocol API secret for server-side event sending"

  tags = local.common_tags
}

# =============================================================================
# REMOVED RESOURCES — secret versions previously managed by Terraform.
# Values are now set directly in AWS Secrets Manager (outside Terraform).
# These removed blocks tell Terraform to stop tracking the versions without
# destroying the actual AWS resources.
# To update a value: aws secretsmanager put-secret-value --secret-id <env>/<name> --secret-string <value>
# =============================================================================

removed {
  from = aws_secretsmanager_secret_version.jwt_secret
  lifecycle { destroy = false }
}

removed {
  from = aws_secretsmanager_secret_version.google_oauth_client_secret
  lifecycle { destroy = false }
}

removed {
  from = aws_secretsmanager_secret_version.oauth_proxy_cookie_secret
  lifecycle { destroy = false }
}

removed {
  from = aws_secretsmanager_secret_version.stripe_secret_key
  lifecycle { destroy = false }
}

removed {
  from = aws_secretsmanager_secret_version.stripe_webhook_secret
  lifecycle { destroy = false }
}

removed {
  from = aws_secretsmanager_secret_version.jira_credentials
  lifecycle { destroy = false }
}

removed {
  from = aws_secretsmanager_secret_version.rollbar_webhook_secret
  lifecycle { destroy = false }
}

removed {
  from = aws_secretsmanager_secret_version.discord_webhook_url
  lifecycle { destroy = false }
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
