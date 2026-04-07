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
