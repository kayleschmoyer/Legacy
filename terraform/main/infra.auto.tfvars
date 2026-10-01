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

# ── NAT instance egress flow logs (LS-10334) ─────────────────────────────────
# Diagnostic toggle. When true, terraform/main/nat-flow-logs.tf creates an
# ACCEPT-only VPC flow log on the NAT instance ENI (CloudWatch Logs, 3-day
# retention) so the ~3 TB/month DataTransfer-Out can be attributed to
# destinations. Intended lifecycle: flip to true → merge → wait one busy CI
# day → run scripts/nat-egress-top-destinations.sh → flip back to false → merge.
# Leave false in steady state; the flow log itself is the only cost.
enable_nat_flow_logs = false

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

# Native (mobile) Discord redirect URI allow-list — the custom app scheme the
# mobile client supplies on the native PKCE code exchange. Must match the value
# in apps/app/src/common/auth/discordAuth.ts and be registered in the Discord
# Developer Portal under OAuth2 → Redirects. Comma-separated for multiple URIs.
discord_native_redirect_uris = "legacysports://auth/discord/callback"

# ── MCP IAM Identity Center SAML federation (LS-4473) ────────────────────────
# IdP metadata URL for the IAM Identity Center SAML application that federates
# into the MCP Cognito user pool. Leave empty until the one-time IC SAML app
# has been registered manually in the AWS console (see variables.tf for the
# bootstrap procedure). Once set, terraform apply creates the Cognito SAML
# identity provider and the hosted UI exposes a "Sign in with IAM Identity
# Center" button alongside the existing Cognito password form.
#
# IdP metadata URLs are public discovery documents (no secrets); safe to
# check in.
mcp_ic_saml_metadata_url = ""

# ── Stripe Price IDs ──────────────────────────────────────────────────────────
# Stripe Price IDs for the subscription plans exposed by the GraphQL `stripePrices`
# query. These are NOT secrets — they are public identifiers that begin with
# "price_" and are safe to check in. Obtain them from:
#   Stripe Dashboard → Products → [your product] → Pricing → Price ID
#
# If left empty the GraphQL resolver returns null, the frontend falls back to
# hardcoded display prices, and the "Upgrade" button shows
# "Upgrade is temporarily unavailable" (LS-3683).
stripe_monthly_price_id = "price_1TOAxg359dSHpsyveNJvtJ0i"
stripe_annual_price_id  = "price_1TQhp4359dSHpsyv3n7bJTUl"
