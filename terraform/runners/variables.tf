# =============================================================================
# Variables for runners/ state
# =============================================================================
#
# Many variables here are intentionally duplicated from terraform/main/variables.tf
# because each terraform state file owns its own variable namespace. Defaults
# match main/ where applicable so the two states stay in sync.

# ── Core ──────────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "project_name" {
  description = "Project identifier used as resource name prefix"
  type        = string
  default     = "legacy-sports"
}

# ── CloudWatch alarm thresholds (used by runner-monitoring.tf) ────────────────
# Duplicated from main/variables.tf because the runner Lambda error alarms
# follow the same threshold/period configuration as Lambda alarms in main/.

variable "lambda_error_alarm_threshold" {
  description = "Number of Lambda errors within the evaluation window before alarms fire"
  type        = number
  default     = 5
}

variable "lambda_error_alarm_period" {
  description = "Length of each evaluation period in seconds"
  type        = number
  default     = 300
}

variable "lambda_error_alarm_evaluation_periods" {
  description = "Number of consecutive periods that must breach threshold before alarming"
  type        = number
  default     = 1
}

# ── GitHub App authentication (used by the github-aws-runners module) ─────────
# Provided via TF_VAR_* env vars in CI / make runner-apply / secrets.auto.tfvars.

variable "github_app_id" {
  description = "GitHub App ID for self-hosted runner registration"
  type        = string
  default     = ""
}

variable "github_app_key_base64" {
  description = "GitHub App private key (base64-encoded PEM)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_app_webhook_secret" {
  description = "Shared secret for GitHub webhook HMAC signature verification"
  type        = string
  sensitive   = true
  default     = ""
}

# ── Runner fleet sizing ───────────────────────────────────────────────────────

variable "github_runners_instance_types" {
  # LS-8693: all types must be ≥16 GB RAM. The previous compute-optimized mix
  # (c7a/c6a/c7i.xlarge, 8 GB) deterministically OOM-killed the CI Pipeline
  # test job — kernel oom-killer killed a ~2-3 GB node process inside the
  # runner service cgroup, systemd tore the unit down ('Failed with result
  # oom-kill'), and the job died with "The runner has received a shutdown
  # signal" (9 fleet-wide node OOM kills on 2026-07-26 alone; also the
  # android-build OOM in build-android-app.yml and the LS-8550 e2e shard-2
  # flake hypothesis). Types stay at 4 vCPU so jest/nx don't spawn more
  # workers — same worker count, double the headroom.
  description = "EC2 instance types for runners, in priority order (spot fleet diversification). Keep every entry at ≥16 GB RAM / 4 vCPU (LS-8693: 8 GB types OOM-kill the test job)."
  type        = list(string)
  default     = ["m7a.xlarge", "m6a.xlarge", "m7i.xlarge", "m6i.xlarge"]
}

variable "github_runners_max_count" {
  description = "Maximum number of concurrent runner instances. Set to 30 to prevent job queuing when the fleet peaks — live data confirmed the fleet hits 20 (the previous cap) for 3+ consecutive minutes during agent bursts, extending burst duration and increasing total idle billing."
  type        = number
  default     = 30
}

# ── Runner AMI version pinning (LS-2429) ──────────────────────────────────────
# Source of truth lives in terraform/runners/runner-ami.auto.tfvars (committed).
# Has no default — terraform plan/apply must find a value here or fail fast.

variable "runner_ami_playwright_version" {
  description = "Playwright version that must be present in the target runner AMI. Matched against the AMI name prefix 'legacy-sports-runner-pw<version>-'. Must equal the resolved playwright-core version in pnpm-lock.yaml and the playwright_version default in terraform/runners/packer/runner-ami.pkr.hcl. Intentionally has NO default — terraform/runners/runner-ami.auto.tfvars is the single source of truth, and any plan/apply that cannot find a value here will fail fast."
  type        = string
}
