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
# Disabled by default — CI enables via TF_VAR_enable_github_runners=true
# when the required runner secrets (RUNNER_GITHUB_APP_ID,
# RUNNER_GITHUB_APP_KEY_BASE64, RUNNER_GITHUB_APP_WEBHOOK_SECRET) are present.
enable_github_runners         = false
github_runners_instance_types = ["c7a.xlarge", "c6a.xlarge", "c7i.xlarge", "m7a.xlarge"]
github_runners_max_count      = 20
