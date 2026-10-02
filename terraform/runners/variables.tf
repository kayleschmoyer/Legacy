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
  #
  # LS-10313: widened from 4 m-family types to 8 (adds the 32 GB r-family at
  # the same 4 vCPU). Spot reclamation arrived in storms (CloudTrail
  # BidEvictedEvent: 86 on 2026-09-22, 195 on 2026-09-29) that emptied the
  # 4-type x 2-AZ = 8 pools at once. Every type added is 6th/7th-gen x86_64
  # Nitro (the Ubuntu AMI is x64-only, so no Graviton), offered in every
  # usable us-east-1 AZ, and ≥16 GB / exactly 4 vCPU. Deliberately NOT added:
  #   - c-family 2xlarge (8 vCPU / 16 GB): jest/nx size worker count from
  #     vCPUs, so 8 vCPU doubles workers into the same 16 GB — the LS-8693
  #     OOM regression again.
  #   - m5/m5a/r5a: cheapest spot, so price-capacity-optimized would favour
  #     them, but they are older generations (Skylake / EPYC Naples) and
  #     slower per job than the 6th/7th-gen types.
  #   - m7i-flex: burstable baseline, unsuitable for sustained CI load.
  # With price-capacity-optimized (see github-runners.tf) list order is no
  # longer a priority signal; it is kept m-first for readability only.
  description = "EC2 instance types for runners (spot fleet diversification — more types = more independent spot pools). Keep every entry x86_64 at ≥16 GB RAM and exactly 4 vCPU (LS-8693: 8 GB types OOM-kill the test job; more vCPUs spawn more jest/nx workers into the same RAM)."
  type        = list(string)
  default = [
    "m7a.xlarge", "m6a.xlarge", "m7i.xlarge", "m6i.xlarge",
    "r7a.xlarge", "r6a.xlarge", "r7i.xlarge", "r6i.xlarge",
  ]
}

variable "github_runners_on_demand_failover_errors" {
  # LS-10313: when CreateFleet returns one of these error codes for a spot
  # launch, the scale-up Lambda immediately retries the same launch as
  # on-demand instead of throwing ScaleError and waiting for the next retry
  # (see the module's lambdas/functions/control-plane/src/aws/runners.ts
  # processFleetResult). Launch-time only: it does NOT protect a job whose
  # instance is reclaimed mid-run, and it never converts a running spot
  # instance. Cost exposure is bounded to the minutes spot capacity is
  # unavailable and by runners_maximum_count. Set to [] to disable.
  description = "CreateFleet error codes that trigger an immediate on-demand fallback launch for spot runners (module input enable_runner_on_demand_failover_for_errors). Applies to both pools."
  type        = list(string)
  default     = ["InsufficientInstanceCapacity"]
}

variable "github_runners_max_count" {
  description = "Maximum number of concurrent runner instances. Set to 30 to prevent job queuing when the fleet peaks — live data confirmed the fleet hits 20 (the previous cap) for 3+ consecutive minutes during agent bursts, extending burst duration and increasing total idle billing."
  type        = number
  default     = 30
}

# ── Android runner pool (LS-8910) ──────────────────────────────────────────────
# A second, small self-hosted pool built from the Android-flavored AMI
# (terraform/runners/packer/runner-ami.pkr.hcl's runner_android source), so the
# default pool's runners no longer pay for a 60 GB root volume sized for the
# Android SDK/NDK. See github-runners.tf's `module "github_runners_android"`
# for the full design and the PR description on LS-8910 for the operational
# runbook (this pool requires a dedicated GitHub App — see github_app_android_id
# below — that does not yet exist and must be created by a repo admin before
# this pool can receive any workflow_job webhooks).

variable "github_runners_android_max_count" {
  description = "Maximum number of concurrent Android runner instances (LS-8910). Kept small — the only consumers (build-android-app.yml, e2e-native-android.yml, run-maestro-sweep.yml) never fan out like the main CI pool does."
  type        = number
  default     = 3
}

variable "github_app_android_id" {
  description = "GitHub App ID for the Android runner pool's webhook (LS-8910). MUST be a SEPARATE GitHub App from github_app_id above — a GitHub App has exactly one webhook URL, and each github-aws-runners module instance provisions its own webhook Lambda + API Gateway endpoint, so the default pool's app cannot also serve the Android pool without the (explicitly out-of-scope-for-this-ticket) multi-runner module variant. Creating this second App, installing it on the repo, and generating its private key is a one-time manual prerequisite (repo-admin action, cannot be automated from Terraform) — until it's done and these variables are populated, this module's Terraform resources apply cleanly but the Android pool never receives workflow_job webhooks and cannot scale up. No default — TF_VAR_* env vars in CI / secrets.auto.tfvars is the same mechanism github_app_id already uses."
  type        = string
  default     = ""
}

variable "github_app_android_key_base64" {
  description = "GitHub App private key (base64-encoded PEM) for the Android runner pool's dedicated GitHub App. See github_app_android_id."
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_app_android_webhook_secret" {
  description = "Shared secret for the Android runner pool's dedicated GitHub App webhook HMAC signature verification. See github_app_android_id."
  type        = string
  sensitive   = true
  default     = ""
}

# ── Runner AMI version pinning (LS-2429) ──────────────────────────────────────
# Source of truth lives in terraform/runners/runner-ami.auto.tfvars (committed).
# Has no default — terraform plan/apply must find a value here or fail fast.

variable "runner_ami_playwright_version" {
  description = "Playwright version that must be present in the target runner AMI. Matched against the AMI name prefix 'legacy-sports-runner-pw<version>-'. Must equal the resolved playwright-core version in pnpm-lock.yaml and the playwright_version default in terraform/runners/packer/runner-ami.pkr.hcl. Intentionally has NO default — terraform/runners/runner-ami.auto.tfvars is the single source of truth, and any plan/apply that cannot find a value here will fail fast."
  type        = string
}
