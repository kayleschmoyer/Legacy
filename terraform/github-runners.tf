# =============================================================================
# Locals
# =============================================================================

locals {
  runner_log_group_base = "/github-runners/${local.name_prefix}-runner"
}

# =============================================================================
# Self-Hosted GitHub Actions Runners (github-aws-runners module)
# =============================================================================
#
# Uses the community-maintained github-aws-runners/terraform-aws-github-runner
# module for robust, battle-tested self-hosted runner infrastructure.
#
# Architecture:
#   GitHub webhook (workflow_job) → API Gateway → Lambda → EC2 spot (non-ephemeral)
#   Runner boots once, processes jobs from queue, scale-down Lambda terminates after idle timeout
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
  enable_ephemeral_runners    = false # non-ephemeral: instance processes multiple sequential jobs
  enable_jit_config           = false # JIT is ephemeral-only; keep disabled for non-ephemeral mode

  # Reduce webhook event delay from default 30s to 10s. With non-ephemeral runners,
  # idle runners CAN pick up queued jobs — this delay gives them a chance to do so
  # before the scale-up Lambda launches a new instance. 10s is low enough to avoid
  # perceptible queue time while still enabling job reuse on warm runners.
  delay_webhook_event = 10
  # TODO: re-enable after adding `actions: read` to the GitHub App permissions.
  # The app currently lacks this scope, causing 403s on the queued-job check.
  enable_job_queued_check = false

  # Spot instances with fleet diversification across types and AZs.
  # capacity-optimized-prioritized picks from the pools with the most
  # available capacity (fewest reclamations) while respecting the type
  # priority order in var.github_runners_instance_types.
  instance_target_capacity_type = "spot"
  instance_allocation_strategy  = "capacity-optimized-prioritized"
  instance_types                = var.github_runners_instance_types

  # Check every minute for idle runners. Non-ephemeral runners stay alive between
  # jobs so we need frequent polling to reclaim instances quickly once they go idle.
  scale_down_schedule_expression = "cron(* * * * ? *)"
  runners_maximum_count          = var.github_runners_max_count

  # Keep 1 warm runner during business hours (Mon–Fri 12pm–7:59pm ET) so the first
  # job of a burst doesn't incur a cold-boot penalty.
  idle_config = [
    {
      cron             = "* 12-19 * * 1-5"
      timeZone         = "America/New_York"
      idleCount        = 1
      evictionStrategy = "oldest_first"
    }
  ]

  # Allow 5 concurrent scale-up Lambda invocations (default: 1). The default
  # serializes all scale-up decisions, bottlenecking burst throughput — observed
  # peak of only 10 runners despite max 20 during a 7-PR burst. Each invocation
  # still checks runners_maximum_count before launching, so this cannot
  # over-provision beyond the configured max.
  scale_up_reserved_concurrent_executions = 5

  # Runner OS and labels
  runner_os           = "linux"
  runner_architecture = "x64"
  runner_extra_labels = ["ci-runner"]
  runner_run_as       = "ubuntu" # Packer AMI is Ubuntu, not Amazon Linux

  # Attach S3 cache IAM policy so runner instances can read/write the pnpm
  # store tarball. The permissions boundary already permits this bucket but
  # the module's runner role also needs an attached policy (LS-1663).
  runner_iam_role_managed_policy_arns = [aws_iam_policy.runner_cache[0].arn]

  # CloudWatch agent — custom config avoids the module default's invalid
  # log_class property that causes the agent to fail on startup (LS-1667).
  # Ships cloud-init (userdata) and syslog output to CloudWatch for debugging
  # runner boot failures and spot interruption events.
  enable_cloudwatch_agent = true
  cloudwatch_config = jsonencode({
    logs = {
      force_flush_interval = 5
      logs_collected = {
        files = {
          collect_list = [
            {
              # Runner boot output: userdata script, apt-get, runner registration.
              # Useful for diagnosing why a runner failed to appear after scale-up.
              file_path       = "/var/log/user-data.log"
              log_group_name  = "${local.runner_log_group_base}/cloud-init"
              log_stream_name = "{instance_id}"
              timezone        = "UTC"
            },
            {
              # System log: kernel messages, spot interruption notices (from
              # spot-handler loop in runner-userdata.sh), and service events.
              file_path       = "/var/log/syslog"
              log_group_name  = "${local.runner_log_group_base}/syslog"
              log_stream_name = "{instance_id}"
              timezone        = "UTC"
            },
          ]
        }
      }
    }
  })

  # Time for the instance to boot and register as a runner (~30s with pre-baked AMI
  # plus userdata_pre_install). Scale-down Lambda won't terminate instances younger
  # than this even if they appear idle.
  runner_boot_time_in_minutes = 10

  # Minimum runtime before the scale-down Lambda considers a runner eligible for
  # termination. 15 minutes gives non-ephemeral runners enough idle time to pick
  # up follow-on jobs in a burst before being reclaimed.
  minimum_running_time_in_minutes = 15

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
    volume_size           = 60
    encrypted             = true
    iops                  = null
    throughput            = null
    kms_key_id            = null
    snapshot_id           = null
  }]

  # ── Custom userdata template (Ubuntu-based, replaces module's Amazon Linux default)
  userdata_template = "${path.module}/runner-userdata.sh"

  # Pre-install: restore pnpm store from S3 cache so the first job on this
  # instance finds a warm cache instead of downloading all packages fresh.
  # Falls back silently if the cache object does not exist yet (first runner
  # boot after deployment, or cache expired). Runs as root; ownership is fixed
  # after extraction so the ubuntu runner user can access the store.
  userdata_pre_install = <<-EOT
    echo "Using pre-baked Ubuntu AMI - Node.js, pnpm, Playwright already installed"

    CACHE_BUCKET="${local.name_prefix}-runner-cache"
    PNPM_STORE="/home/ubuntu/.local/share/pnpm/store"

    if aws s3api head-object --bucket "$CACHE_BUCKET" --key "pnpm-store/latest.tar.gz" >/dev/null 2>&1; then
      echo "[cache] Restoring pnpm store from s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz"
      mkdir -p /home/ubuntu/.local/share/pnpm
      aws s3 cp "s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz" - 2>/dev/null \
        | tar xzf - -C "$PNPM_STORE" --no-same-owner --no-same-permissions 2>/dev/null \
        || echo "[cache] Restore failed — continuing without cache"
      chown -R ubuntu:ubuntu /home/ubuntu/.local/share/pnpm 2>/dev/null || true
      echo "[cache] pnpm store restored"
    else
      echo "[cache] No pnpm cache found — first boot will download packages fresh"
    fi
  EOT

  # ── Inter-job cleanup hook (non-ephemeral isolation) ───────────────────────
  # Runs after each job completes via ACTIONS_RUNNER_HOOK_JOB_COMPLETED.
  # Removes workspace and temp artifacts to prevent cross-job data leakage.
  # pnpm store and Nx cache are intentionally preserved for performance.
  runner_hook_job_completed = <<-EOT
    #!/bin/bash
    set -euo pipefail

    echo "[cleanup] Post-job cleanup started at $(date -u)"

    # Derive the runner workspace root from the environment, falling back to the
    # default GitHub Actions runner path if RUNNER_WORKSPACE is not set.
    WORKSPACE_ROOT="$${RUNNER_WORKSPACE:-/opt/actions-runner/_work}"

    # Remove the job workspace (prevents stale files and secrets from leaking
    # to the next job). The runner re-creates this directory per job.
    if [[ -n "$${GITHUB_WORKSPACE:-}" ]]; then
      echo "[cleanup] Removing GITHUB_WORKSPACE: $GITHUB_WORKSPACE"
      rm -rf "$GITHUB_WORKSPACE"
    else
      echo "[cleanup] GITHUB_WORKSPACE not set; skipping workspace deletion"
    fi

    # Clear the runner's temp directory and cached action code (action outputs,
    # tool caches for this job, and downloaded marketplace actions).
    # _actions is removed to prevent a compromised job from tampering with
    # cached action code that would run in subsequent jobs.
    rm -rf "$WORKSPACE_ROOT/_temp/"
    rm -rf "$WORKSPACE_ROOT/_actions/"

    # Remove temp files written by npm/pnpm/Nx during the job
    rm -rf /tmp/npm-* /tmp/pnpm-* /tmp/nx-*

    # Remove any git credential helpers written by actions/checkout
    find "$WORKSPACE_ROOT" -name "git-credentials-*" -delete 2>/dev/null || true

    # Remove per-job .npmrc files that may contain registry auth tokens.
    # Restricted to the job workspace (not _actions) to avoid mutating action checkouts.
    if [[ -n "$${GITHUB_WORKSPACE:-}" ]]; then
      find "$GITHUB_WORKSPACE" -name ".npmrc" -delete 2>/dev/null || true
    fi

    echo "[cleanup] Post-job cleanup completed at $(date -u)"

    # Sync pnpm store to S3 so the next new runner instance starts warm.
    # Runs in background (nohup + disown) so it does not delay the runner
    # from picking up the next queued job. A partial upload is harmless —
    # the pnpm store is content-addressable, so the next sync will fill gaps.
    PNPM_STORE="/home/ubuntu/.local/share/pnpm/store"
    CACHE_BUCKET="${local.name_prefix}-runner-cache"
    if [[ -d "$PNPM_STORE" ]]; then
      (
        nohup bash -c \
          "tar czf - \"$PNPM_STORE\" 2>/dev/null \
             | aws s3 cp - \"s3://$CACHE_BUCKET/pnpm-store/latest.tar.gz\" \
           && echo '[cache] pnpm store sync complete' \
           || echo '[cache] pnpm store sync failed'" \
          >> /tmp/cache-sync.log 2>&1 &
        disown
      ) || true
      echo "[cache] pnpm store sync started in background → /tmp/cache-sync.log"
    fi
  EOT

  # ── VPC egress restrictions (LS-1654) ──────────────────────────────────────
  # Replace the module's default "all outbound" rule with least-privilege egress.
  # Runners need: HTTPS (GitHub API, npm, S3), DNS, PostgreSQL (VPC RDS for
  # migration checks), and EC2 instance metadata (spot interruption notices).
  runner_egress_rules = [
    {
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
      prefix_list_ids  = null
      from_port        = 443
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 443
      description      = "HTTPS - GitHub API, npm registry, S3, VPC endpoints"
    },
    {
      cidr_blocks      = [var.vpc_cidr]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 53
      protocol         = "udp"
      security_groups  = null
      self             = false
      to_port          = 53
      description      = "DNS (UDP) - VPC DNS resolver"
    },
    {
      cidr_blocks      = [var.vpc_cidr]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 53
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 53
      description      = "DNS (TCP) - VPC DNS resolver"
    },
    {
      cidr_blocks      = aws_subnet.public[*].cidr_block
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 5432
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 5432
      description      = "PostgreSQL - RDS in public subnets (historical placement, migration checks)"
    },
    {
      cidr_blocks      = ["169.254.169.254/32"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 80
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 80
      description      = "EC2 instance metadata - spot interruption notices and IMDSv2 token service"
    },
  ]

  # ── IAM hardening (LS-1653) ────────────────────────────────────────────────
  # Permissions boundary prevents the runner role from exceeding least-privilege,
  # regardless of what the module's default policy grants.
  role_permissions_boundary = var.enable_github_runners ? aws_iam_policy.runner_permissions_boundary[0].arn : null

  # Ensure log groups (with retention policy) exist before the module creates
  # EC2 instances. Without this edge, Terraform may launch runners in parallel
  # with log group creation, letting the CloudWatch agent create the group first
  # with default "never expire" retention.
  depends_on = [
    aws_cloudwatch_log_group.runner_cloud_init,
    aws_cloudwatch_log_group.runner_syslog,
  ]

  tags = local.common_tags
}

# =============================================================================
# CloudWatch Log Groups for Runner Logs (LS-1667)
# =============================================================================
# Explicit log groups prevent the CloudWatch agent from creating them on first
# boot with "Never expire" retention, which would cause unbounded log growth.
# The agent ships cloud-init (userdata) and syslog to these groups.
# =============================================================================
resource "aws_cloudwatch_log_group" "runner_cloud_init" {
  count             = var.enable_github_runners ? 1 : 0
  name              = "${local.runner_log_group_base}/cloud-init"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "runner_syslog" {
  count             = var.enable_github_runners ? 1 : 0
  name              = "${local.runner_log_group_base}/syslog"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# =============================================================================
# Module IAM Permissions Boundary (LS-1653)
# =============================================================================
# Applied to ALL IAM roles created by the github-aws-runners module: EC2 runner
# instances AND Lambda functions (webhook, scale-up, scale-down, syncer).
# Limits the maximum permissions any module-created role can assume, regardless
# of the policies the module attaches.
#
# Threat model: a compromised runner or Lambda cannot escalate beyond these
# actions. The boundary covers:
#   - SSM (Session Manager for EC2, Parameter Store for Lambda config/secrets)
#   - CloudWatch Logs (Lambda execution logs + future runner log shipping)
#   - S3 read (runner binary bucket managed by the module)
#   - SQS + EventBridge (inter-Lambda messaging for scale-up pipeline)
#   - EC2 fleet + describe (scale-up Lambda launches spot instances)
#   - IAM PassRole (scale-up Lambda passes runner profile to EC2, constrained
#     to ec2.amazonaws.com via PassedToService condition)
#   - EC2 self-terminate (ephemeral runners clean up after job completion)
#
# Runners do NOT run AWS CLI commands for deployments — that is handled by the
# GitHub Actions OIDC role (github-actions-oidc.tf).
# =============================================================================
resource "aws_iam_policy" "runner_permissions_boundary" {
  count       = var.enable_github_runners ? 1 : 0
  name        = "${local.name_prefix}-runner-permissions-boundary"
  description = "Permissions boundary for all IAM roles created by the github-runners module (EC2 runner instances and Lambda functions). Limits the maximum permissions any module-created role can assume, regardless of attached policies."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # SSM Session Manager — EC2 runner health checks and debugging.
      {
        Sid    = "SSMSessionManager"
        Effect = "Allow"
        Action = [
          "ssm:UpdateInstanceInformation",
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel",
          "ec2messages:AcknowledgeMessage",
          "ec2messages:DeleteMessage",
          "ec2messages:FailMessage",
          "ec2messages:GetEndpoint",
          "ec2messages:GetMessages",
          "ec2messages:SendReply"
        ]
        Resource = "*"
      },
      # SSM Parameter Store — scoped to runner-prefixed parameters.
      # Lambdas read config/secrets; EC2 runners write registration tokens.
      # Two resource paths are required: the module stores app secrets under
      # the github-action-runners/ namespace, while runner tokens and config
      # live under the top-level name_prefix path.
      {
        Sid    = "SSMParameterStore"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
          "ssm:PutParameter",
          "ssm:DeleteParameter",
          "ssm:AddTagsToResource",
          "ssm:RemoveTagsFromResource",
          "ssm:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${local.name_prefix}-runner*",
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/github-action-runners/${local.name_prefix}-runner*",
        ]
      },
      # SSM DescribeParameters — does not support resource-level scoping.
      {
        Sid    = "SSMDescribeParameters"
        Effect = "Allow"
        Action = [
          "ssm:DescribeParameters"
        ]
        Resource = "*"
      },
      # CloudWatch Logs — module Lambdas log to /aws/lambda/... paths, not
      # /github-runners/. Must allow both for Lambdas and future runner logs.
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-runner-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-runner-*:*"
        ]
      },
      # S3 — runner binary bucket (managed by the module).
      # PutObject is required by the runner-binaries-syncer Lambda to upload
      # new runner tarballs; GetObject/ListBucket are used by EC2 instances
      # and scale-up Lambda to download the binary during provisioning.
      {
        Sid    = "S3RunnerBinaries"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket",
          "s3:PutObject"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-runner-*",
          "arn:aws:s3:::${local.name_prefix}-runner-*/*"
        ]
      },
      # SQS — scale-up Lambda reads from the queued-builds queue, webhook
      # Lambda sends to EventBridge which routes to SQS
      {
        Sid    = "SQS"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = "arn:aws:sqs:${local.region}:${local.account_id}:${local.name_prefix}-runner-*"
      },
      # EventBridge — webhook Lambda publishes events to the runner event bus
      {
        Sid    = "EventBridge"
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = "arn:aws:events:${local.region}:${local.account_id}:event-bus/${local.name_prefix}-runner-*"
      },
      # EC2 fleet — scale-up Lambda launches spot instances
      {
        Sid    = "EC2Fleet"
        Effect = "Allow"
        Action = [
          "ec2:CreateFleet",
          "ec2:RunInstances",
          "ec2:CreateTags"
        ]
        Resource = [
          "arn:aws:ec2:${local.region}:${local.account_id}:*",
          "arn:aws:ec2:${local.region}::image/*"
        ]
      },
      # EC2 describe — needed for instance metadata and spot interruption checks
      {
        Sid    = "EC2Describe"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeTags"
        ]
        Resource = "*"
      },
      # IAM PassRole — scale-up Lambda passes the runner instance profile role
      # to EC2 instances it launches. Constrained to ec2.amazonaws.com to
      # prevent passing roles to other services.
      {
        Sid    = "IAMPassRole"
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-runner*"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ec2.amazonaws.com"
          }
        }
      },
      # EC2 terminate — used by the scale-down Lambda to reclaim idle runners.
      # Scoped to instances tagged with the runner environment prefix so the Lambda
      # cannot terminate unrelated EC2 instances in the account.
      {
        Sid    = "EC2SelfTerminate"
        Effect = "Allow"
        Action = [
          "ec2:TerminateInstances"
        ]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/ghr:environment" = "${local.name_prefix}-runner"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}
