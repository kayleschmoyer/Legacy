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
# ⚠️  INTENTIONALLY false — this is a safety guard against accidental local or
# CI terraform apply destroying live runner infrastructure (dozens of resources).
#
# Runner infrastructure was provisioned once via a targeted apply with
# enable_github_runners=true and the required secrets. It is currently NOT
# continuously managed through this Terraform config — runner scaling is handled
# by the autoscaling module itself (webhook → Lambda → EC2 spot).
#
# NOTE: CI does NOT override this flag. The lambda-terraform-apply workflow reads
# this file directly and only validates runner secrets when the value is true.
# This means runner resources (SGs, ASGs, Lambdas) are intentionally outside
# the normal plan/apply loop.
#
# See LS-2057 for the work to restore full Terraform management of runner infra.
#
# To see an accurate plan that includes runner resources:
#   terraform plan -var="enable_github_runners=true"
enable_github_runners         = false
github_runners_instance_types = ["c7a.xlarge", "c6a.xlarge", "c7i.xlarge", "m7a.xlarge"]
github_runners_max_count      = 20
