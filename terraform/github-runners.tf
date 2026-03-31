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

  # Reduce webhook event delay from default 30s to 10s. The delay exists to let
  # idle runners pick up jobs before launching new instances, but with ephemeral
  # runners there are never idle runners — so 30s is pure dead time per job start.
  # At ~5 sequential stages per pipeline, this saves ~100s per CI run.
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

  # Scale-to-zero: check every 5 minutes for idle runners
  scale_down_schedule_expression = "cron(*/5 * * * ? *)"
  runners_maximum_count          = var.github_runners_max_count

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
      cidr_blocks      = aws_subnet.private_database[*].cidr_block
      ipv6_cidr_blocks = []
      prefix_list_ids  = null
      from_port        = 5432
      protocol         = "tcp"
      security_groups  = null
      self             = false
      to_port          = 5432
      description      = "PostgreSQL - RDS in database subnets (migration checks)"
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
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${local.name_prefix}-runner*"
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
      # S3 read — runner binary bucket (managed by the module)
      {
        Sid    = "S3RunnerBinaries"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket"
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
      # EC2 self-terminate — ephemeral runners terminate themselves after job
      # completion. Without this, completed runners become zombies that block
      # scale-up (the scale-up Lambda counts them toward maximumRunners).
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
