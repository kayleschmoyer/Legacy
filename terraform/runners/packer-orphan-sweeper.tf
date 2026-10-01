# =============================================================================
# Packer Orphan Sweeper (LS-7875)
# =============================================================================
# Hourly Lambda that terminates orphaned Packer AMI-builder EC2 instances.
#
# Background:
#   AMI builds (packer/runner-ami.pkr.hcl) launch a temporary on-demand
#   c7a.xlarge build instance. Packer terminates it at the end of a build, and
#   LS-4921 lets the runner-ami-builder role self-terminate FAILED builds via a
#   tag-scoped ec2:TerminateInstances (Name LIKE "Packer Builder*"). But Packer
#   applies run_tags AFTER RunInstances, so if the build HOST is killed in that
#   window (the LS-7870 scale-down race) the instance is left running, untagged,
#   and un-reapable by the tag-scoped cleanup. We found one such orphan running
#   on-demand for ~2 weeks (~$123/mo).
#
#   This sweeper keys off the one always-present signal — the `packer_<uuid>`
#   temporary key pair, set atomically at RunInstances — and terminates any
#   builder older than MAX_AGE_MINUTES (the build workflow has a 25-minute
#   timeout, so a 2h cutoff cannot catch an in-flight build). See the handler in
#   lambdas/packer-orphan-sweeper/index.mjs for the full rationale.
#
# IAM note: the apply role (legacy-sports-dev-github-actions) already has Lambda,
# IAM role/policy, CloudWatch Logs, and EventBridge rule/target CRUD scoped to
# `legacy-sports-dev-*` (terraform/main/github-actions-oidc.tf), which covers
# every resource below by name — no apply-role permission changes are required.
# =============================================================================

locals {
  packer_orphan_sweeper_name = "${local.name_prefix}-packer-orphan-sweeper"
}

# -----------------------------------------------------------------------------
# Lambda deployment package — single dependency-free index.mjs (the AWS SDK v3
# ships with the nodejs22.x runtime), zipped in place. No build/bundle step.
# -----------------------------------------------------------------------------
data "archive_file" "packer_orphan_sweeper" {
  type        = "zip"
  source_file = "${path.module}/packer-orphan-sweeper/index.mjs"
  output_path = "${path.module}/packer-orphan-sweeper/.dist/packer-orphan-sweeper.zip"
}

# -----------------------------------------------------------------------------
# Execution role
# -----------------------------------------------------------------------------
resource "aws_iam_role" "packer_orphan_sweeper" {
  name        = "${local.packer_orphan_sweeper_name}-role"
  description = "Execution role for the Packer orphan sweeper Lambda (LS-7875)."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRole"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })

  tags = local.common_tags
}

# CloudWatch Logs (CreateLogGroup/PutLogEvents) for the function.
resource "aws_iam_role_policy_attachment" "packer_orphan_sweeper_basic" {
  role       = aws_iam_role.packer_orphan_sweeper.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# EC2 discovery + scoped termination. Mirrors the tag-scoping the
# runner-ami-builder role uses (Name LIKE "Packer Builder*") so this role can
# only ever terminate Packer build instances — never the runner fleet.
resource "aws_iam_role_policy" "packer_orphan_sweeper_ec2" {
  name = "${local.packer_orphan_sweeper_name}-ec2"
  role = aws_iam_role.packer_orphan_sweeper.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # DescribeInstances has no resource-level support — AWS requires
        # Resource="*" and rejects instance/tag ARNs for describe (list) calls,
        # so we cannot scope it by builder. The only scoping available is the
        # region condition: this stack runs solely in us-east-1, so restrict the
        # call there rather than leaving it global.
        Sid      = "DescribeBuilders"
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = local.region
          }
        }
      },
      {
        # The sweeper stamps Name = "Packer Builder - orphan-sweep-reaped" on an
        # orphan before terminating it. We cannot scope this by ResourceTag (the
        # orphans we must tag are by definition UNtagged) nor by key-name (not an
        # IAM-conditionable attribute), so we constrain the REQUEST instead:
        #   - aws:RequestTag/Name — the only Name value settable is "Packer
        #     Builder*", so this role can't relabel an instance to anything else.
        #   - aws:TagKeys (ForAllValues) — the request may set ONLY the Name key,
        #     so it can't attach any other tag. Combined, the role can do exactly
        #     one thing: set Name="Packer Builder*". The handler only ever calls
        #     this on packer_*-keyed instances; this is the IAM backstop.
        Sid      = "TagBuildersForReap"
        Effect   = "Allow"
        Action   = ["ec2:CreateTags"]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringLike = {
            "aws:RequestTag/Name" = ["Packer Builder*"]
          }
          "ForAllValues:StringEquals" = {
            "aws:TagKeys" = ["Name"]
          }
        }
      },
      {
        # Termination is scoped to the same "Packer Builder*" Name prefix the
        # runner-ami-builder role uses — the runner fleet is tagged
        # `legacy-sports-dev-runner-*` and is NOT matchable here.
        Sid      = "TerminateTaggedBuilders"
        Effect   = "Allow"
        Action   = ["ec2:TerminateInstances"]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringLike = {
            "ec2:ResourceTag/Name" = ["Packer Builder*"]
          }
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Log group (explicit, so retention is managed rather than never-expiring)
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "packer_orphan_sweeper" {
  name              = "/aws/lambda/${local.packer_orphan_sweeper_name}"
  retention_in_days = local.log_retention_days[var.environment]
  tags              = local.common_tags
}

# -----------------------------------------------------------------------------
# Function
# -----------------------------------------------------------------------------
resource "aws_lambda_function" "packer_orphan_sweeper" {
  function_name = local.packer_orphan_sweeper_name
  description   = "Terminates orphaned Packer AMI-builder EC2 instances (LS-7875)."
  role          = aws_iam_role.packer_orphan_sweeper.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 120
  memory_size   = 256

  filename         = data.archive_file.packer_orphan_sweeper.output_path
  source_code_hash = data.archive_file.packer_orphan_sweeper.output_base64sha256

  # Serialize invocations — a single sweep is plenty and avoids two concurrent
  # sweeps racing on the same orphan.
  reserved_concurrent_executions = 1

  environment {
    variables = {
      # Builders older than this are orphans. The rebuild-runner-ami workflow
      # has a 25-minute timeout, so 120 minutes cannot catch an in-flight build.
      MAX_AGE_MINUTES = "120"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.packer_orphan_sweeper_basic,
    aws_cloudwatch_log_group.packer_orphan_sweeper,
  ]

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# Hourly schedule
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "packer_orphan_sweeper" {
  name                = local.packer_orphan_sweeper_name
  description         = "Hourly sweep for orphaned Packer AMI-builder EC2 instances (LS-7875)."
  schedule_expression = "rate(1 hour)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "packer_orphan_sweeper" {
  rule      = aws_cloudwatch_event_rule.packer_orphan_sweeper.name
  target_id = "packer-orphan-sweeper"
  arn       = aws_lambda_function.packer_orphan_sweeper.arn
}

resource "aws_lambda_permission" "packer_orphan_sweeper_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.packer_orphan_sweeper.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.packer_orphan_sweeper.arn
}
