# =============================================================================
# Infrastructure Feature Flags — Non-Sensitive Configuration
# =============================================================================
# This file is checked into version control so that CI terraform plan/apply
# picks up feature flags and instance sizing without needing additional
# TF_VAR_* env vars for non-sensitive values.
#
# Sensitive values (github_app_id, github_app_key_base64, github_app_webhook_secret)
# are passed via TF_VAR_* env vars in CI or via secrets.auto.tfvars locally.
# =============================================================================

# ── RDS Proxy ────────────────────────────────────────────────────────────────
# Enables the RDS Proxy used by Lambdas for DB connectivity/connection pooling;
# CI/local dev connect via the RDS instance endpoint, not through the proxy.
enable_rds_proxy = true

# ── Self-hosted CI runner DB access ──────────────────────────────────────────
# Allow self-hosted CI runners (VPC public subnets) to reach RDS on port 5432.
# This single SG rule is safe in the normal apply loop because it is idempotent
# and has no teardown risk. The runner fleet itself lives in terraform/runners/
# as of LS-2425 — see terraform/runners/README.md for the runner architecture.
enable_ci_runner_db_access = true

# ── MLB Data Provider ─────────────────────────────────────────────────────────
# The free MLB Stats API (mlb-statsapi) is NOT licensed for commercial use.
# All non-dev environments must use a licensed provider.
#
# This value is non-sensitive and safe to check in. The API key itself is
# sensitive and is supplied separately:
#   - Locally:  set mlb_data_api_key in terraform/main/secrets.auto.tfvars
#   - CI/prod:  set MLB_DATA_API_KEY in GitHub repository secrets
#               (TF_VAR_mlb_data_api_key is injected by lambda-terraform-apply.yml)
#
# Provider options: "balldontlie" | "rolling-insights"
# Recommendation (LS-1869 spike): Rolling Insights for real-time live data.
# balldontlie is the implemented fallback if Rolling Insights pricing is prohibitive.
#
# NOTE: This value applies to ALL terraform runs including local dev. Developers
# running terraform locally will also need mlb_data_api_key in secrets.auto.tfvars.
# To use the free mlb-statsapi for local dev only, override this value in your
# local secrets.auto.tfvars: mlb_data_provider = "mlb-statsapi"
mlb_data_provider = "balldontlie"

# ── Discord OAuth ─────────────────────────────────────────────────────────────
# Discord Application ID (public — visible in every OAuth redirect URL).
# Used by the oauth-proxy Lambda as DISCORD_CLIENT_ID for token exchange.
# The corresponding client secret is sensitive and lives in secrets.auto.tfvars.
discord_client_id = "1493368154972487800"

# Discord OAuth redirect URI — must match exactly what's registered in
# the Discord Developer Portal under OAuth2 → Redirects.
discord_redirect_uri = "https://legacy-fantasy.com/auth/discord/callback"

# ── Stripe Price IDs ──────────────────────────────────────────────────────────
# Stripe Price IDs for the subscription plans exposed by the GraphQL `stripePrices`
# query. These are NOT secrets — they are public identifiers that begin with
# "price_" and are safe to check in. Obtain them from:
#   Stripe Dashboard → Products → [your product] → Pricing → Price ID
#
# If left empty the GraphQL resolver returns null, the frontend falls back to
# hardcoded display prices, and the "Upgrade" button shows
# "Upgrade is temporarily unavailable" (LS-3683).
stripe_monthly_price_id = ""
stripe_annual_price_id  = ""
