# =============================================================================
# SSM Parameters — GitHub Actions build-time secrets (LS-5215)
#
# These parameters are the source of truth for environment variables baked into
# the web (VITE_*) and mobile (EXPO_PUBLIC_*) builds at CI time. Values are
# derived from existing Terraform variables so adding a new environment never
# requires touching GitHub UI — just terraform apply then sync.
#
# After terraform apply, push the values to GitHub secrets:
#   node scripts/sync-github-secrets.mjs
#
# To rotate a value:
#   1. Update the Terraform variable (secrets.auto.tfvars locally, TF_VAR_* in CI)
#   2. terraform apply
#   3. node scripts/sync-github-secrets.mjs
#
# To add a new build-time config value:
#   1. Declare a variable in secrets.tf (sensitive = true for API keys)
#   2. Add an aws_ssm_parameter resource below
#   3. Add a mapping entry in scripts/sync-github-secrets.mjs (SSM_MAPPINGS)
#   4. Reference the framework-prefixed secret in the relevant workflow file
# =============================================================================

# ── Public config (String) ────────────────────────────────────────────────────
# These values are baked into the JS bundle and are not sensitive — they're
# identical to what ships in the built artifact. String type (not SecureString)
# is appropriate and avoids KMS call overhead on reads.

resource "aws_ssm_parameter" "gh_secret_graphql_host" {
  name        = "/legacy-sports/${var.environment}/github-secrets/graphql-host"
  description = "GraphQL API endpoint — VITE_GRAPHQL_HOST (web) / EXPO_PUBLIC_GRAPHQL_HOST (mobile)"
  type        = "String"
  value       = "${local.api_base_url}/graphql"

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_oauth_proxy_url" {
  name        = "/legacy-sports/${var.environment}/github-secrets/oauth-proxy-url"
  description = "OAuth proxy endpoint — VITE_OAUTH_PROXY_URL (web) / EXPO_PUBLIC_OAUTH_PROXY (mobile)"
  type        = "String"
  value       = "${local.api_base_url}/oauth"

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_websocket_url" {
  name        = "/legacy-sports/${var.environment}/github-secrets/websocket-url"
  description = "WebSocket URL — VITE_WEBSOCKET_URL (web) / EXPO_PUBLIC_WEBSOCKET_URL (mobile)"
  type        = "String"
  value       = var.domain_name != "" ? "wss://ws.${var.domain_name}" : aws_apigatewayv2_stage.websocket.invoke_url

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_google_client_id" {
  name        = "/legacy-sports/${var.environment}/github-secrets/google-client-id"
  description = "Google OAuth client ID — VITE_GOOGLE_CLIENT_ID (web) / EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID (mobile)"
  type        = "String"
  value       = var.google_oauth_client_id

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_discord_client_id" {
  name        = "/legacy-sports/${var.environment}/github-secrets/discord-client-id"
  description = "Discord OAuth client ID — VITE_DISCORD_CLIENT_ID (web)"
  type        = "String"
  value       = var.discord_client_id

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_ga_measurement_id" {
  name        = "/legacy-sports/${var.environment}/github-secrets/ga-measurement-id"
  description = "GA4 measurement ID — VITE_GA_MEASUREMENT_ID (web)"
  type        = "String"
  value       = var.ga_measurement_id

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_stripe_monthly_price_id" {
  name        = "/legacy-sports/${var.environment}/github-secrets/stripe-monthly-price-id"
  description = "Stripe monthly subscription price ID — EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID (mobile)"
  type        = "String"
  value       = var.stripe_monthly_price_id

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_stripe_annual_price_id" {
  name        = "/legacy-sports/${var.environment}/github-secrets/stripe-annual-price-id"
  description = "Stripe annual subscription price ID — EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID (mobile)"
  type        = "String"
  value       = var.stripe_annual_price_id

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

# ── Sensitive config (SecureString) ──────────────────────────────────────────
# API keys that appear in the bundle but should not be readable without KMS.
# The sync script reads these with --with-decryption and writes them as
# GitHub encrypted secrets, so they never appear in Terraform plan output.

resource "aws_ssm_parameter" "gh_secret_giphy_api_key" {
  name        = "/legacy-sports/${var.environment}/github-secrets/giphy-api-key"
  description = "Giphy API key for GIF search — VITE_GIPHY_API_KEY (web)"
  type        = "SecureString"
  value       = var.giphy_api_key

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

resource "aws_ssm_parameter" "gh_secret_rollbar_client_access_token" {
  name        = "/legacy-sports/${var.environment}/github-secrets/rollbar-client-access-token"
  description = "Rollbar post_client_item token for browser/mobile error reporting — VITE_ROLLBAR_ACCESS_TOKEN (web) / EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN (mobile)"
  type        = "SecureString"
  value       = var.rollbar_client_access_token

  tags = merge(local.common_tags, {
    Component = "github-secrets"
  })
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "github_secrets_ssm_parameters" {
  description = "SSM parameter paths for all GitHub Actions build-time secrets"
  value = {
    graphql_host                = aws_ssm_parameter.gh_secret_graphql_host.name
    oauth_proxy_url             = aws_ssm_parameter.gh_secret_oauth_proxy_url.name
    websocket_url               = aws_ssm_parameter.gh_secret_websocket_url.name
    google_client_id            = aws_ssm_parameter.gh_secret_google_client_id.name
    discord_client_id           = aws_ssm_parameter.gh_secret_discord_client_id.name
    ga_measurement_id           = aws_ssm_parameter.gh_secret_ga_measurement_id.name
    stripe_monthly_price_id     = aws_ssm_parameter.gh_secret_stripe_monthly_price_id.name
    stripe_annual_price_id      = aws_ssm_parameter.gh_secret_stripe_annual_price_id.name
    giphy_api_key               = aws_ssm_parameter.gh_secret_giphy_api_key.name
    rollbar_client_access_token = aws_ssm_parameter.gh_secret_rollbar_client_access_token.name
  }
}
