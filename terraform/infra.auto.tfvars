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
# This is the INTENDED long-term strategy — not a temporary state or a bug.
# Runner resources were explicitly removed from Terraform state (LS-2051/LS-2056)
# to prevent phantom destroy plans on every apply. Runner config changes (egress
# rules, instance types, IAM hardening) require a targeted one-off apply:
#   make runner-apply
#
# To see an accurate plan that includes runner resources:
#   terraform plan -var="enable_github_runners=true"
enable_github_runners = false
# Allow self-hosted CI runners (VPC public subnets) to reach RDS on port 5432.
# Unlike the full runner fleet, this single SG rule is safe to keep in the normal
# apply loop — it is idempotent and has no teardown risk. Decoupled from
# enable_github_runners (see LS-2254).
enable_ci_runner_db_access    = true
github_runners_instance_types = ["c7a.xlarge", "c6a.xlarge", "c7i.xlarge", "m7a.xlarge"]
github_runners_max_count      = 20
