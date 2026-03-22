# =============================================================================
# Self-Hosted GitHub Actions Runners (github-aws-runners module)
# =============================================================================
#
# Uses the community-maintained github-aws-runners/terraform-aws-github-runner
# module for robust, battle-tested self-hosted runner infrastructure.
#
# Architecture:
#   GitHub webhook (workflow_job) → API Gateway → Lambda → EC2 spot (ephemeral)
#   Runner picks up one job → completes → terminates → ASG scales down
#
# Cost: ~$48/month (scale-to-zero, spot instances) vs ~$1,370/month on
#        GitHub-hosted runners (~96% savings).
# =============================================================================

module "github_runners" {
  count   = var.enable_github_runners ? 1 : 0
  source  = "github-aws-runners/github-runner/aws"
  version = "7.5.0"

  aws_region = var.aws_region
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.public[*].id

  prefix = "${local.name_prefix}-runner"

  # ── GitHub App authentication ───────────────────────────────────────────────
  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    webhook_secret = var.github_app_webhook_secret
  }

  # ── Lambda zips (pre-downloaded from module releases) ───────────────────────
  webhook_lambda_zip                = "${path.module}/lambdas/webhook.zip"
  runners_lambda_zip                = "${path.module}/lambdas/runners.zip"
  runner_binaries_syncer_lambda_zip = "${path.module}/lambdas/runner-binaries-syncer.zip"

  # ── Runner configuration ────────────────────────────────────────────────────
  enable_organization_runners = false # repo-level runners
  enable_ephemeral_runners    = true  # one job per instance, then terminate
  enable_jit_config           = false # Disable JIT — let instance register on boot (JIT tokens expire before boot completes)

  # Spot instances with fleet diversification across types and AZs.
  # capacity-optimized-prioritized picks from the pools with the most
  # available capacity (fewest reclamations) while respecting the type
  # priority order in var.github_runners_instance_types.
  instance_target_capacity_type  = "spot"
  instance_allocation_strategy   = "capacity-optimized-prioritized"
  instance_types                 = var.github_runners_instance_types

  # Scale-to-zero: check every 5 minutes for idle runners
  scale_down_schedule_expression = "cron(*/5 * * * ? *)"
  runners_maximum_count          = var.github_runners_max_count

  # Runner OS and labels
  runner_os           = "linux"
  runner_architecture = "x64"
  runner_extra_labels = ["ci-runner"]
  runner_run_as       = "ubuntu" # Packer AMI is Ubuntu, not Amazon Linux

  # Disable CloudWatch agent — default config has invalid log_class property
  # that causes startup failure. Enable later with custom config (LS-1667).
  enable_cloudwatch_agent = false

  # Boot time includes userdata_pre_install (~1 min with pre-baked AMI)
  # plus job execution time. The scale-down Lambda won't terminate runners
  # younger than this, even if they appear idle between job phases.
  runner_boot_time_in_minutes = 15

  # Minimum time a runner stays alive (prevents termination during job execution)
  minimum_running_time_in_minutes = 20

  # ── AMI (pre-baked via Packer — see terraform/packer/runner-ami.pkr.hcl) ──
  # Ubuntu 22.04 with Node.js 22, pnpm, Playwright deps, runner deps pre-installed.
  # Boots in ~30s instead of 5-7 min from stock AMI.
  ami = {
    filter = {
      name  = ["legacy-sports-runner-*"]
      state = ["available"]
    }
    owners = ["self"]
  }

  # ── Instance configuration ─────────────────────────────────────────────────
  block_device_mappings = [{
    device_name           = "/dev/sda1"
    delete_on_termination = true
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    iops                  = null
    throughput            = null
    kms_key_id            = null
    snapshot_id           = null
  }]

  # ── Custom userdata template (Ubuntu-based, replaces module's Amazon Linux default)
  userdata_template = "${path.module}/runner-userdata.sh"

  # Pre-install is minimal — tools are pre-baked in the Packer AMI
  userdata_pre_install = <<-EOT
    echo "Using pre-baked Ubuntu AMI - Node.js, pnpm, Playwright already installed"
  EOT

  tags = local.common_tags
}
