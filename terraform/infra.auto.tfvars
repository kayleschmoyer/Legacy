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

# ── Self-hosted GitHub Actions Runners ────────────────────────────────────────
# ⚠️  INTENTIONALLY false — this is a safety guard against accidental local
# terraform apply destroying live runner infrastructure (dozens of resources).
#
# CI sets TF_VAR_enable_github_runners=true alongside the required secrets
# (RUNNER_GITHUB_APP_ID, RUNNER_GITHUB_APP_KEY_BASE64,
# RUNNER_GITHUB_APP_WEBHOOK_SECRET). Local config keeps runners disabled, so
# using this file with the same remote state will plan (and on apply, perform)
# destroys of any existing runner infrastructure.
#
# To see an accurate plan that includes runner resources:
#   terraform plan -var="enable_github_runners=true"
enable_github_runners         = false
github_runners_instance_types = ["c7a.xlarge", "c6a.xlarge", "c7i.xlarge", "m7a.xlarge"]
github_runners_max_count      = 20
