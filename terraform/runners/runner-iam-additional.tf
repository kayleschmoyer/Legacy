# =============================================================================
# Supplemental IAM policy for runner module operations
# =============================================================================
# Extracted from terraform/main/github-actions-oidc.tf as part of LS-2425
# (state separation).
#
# These permissions used to live in `aws_iam_policy.github_actions_supplemental`
# in main/, where they were added incrementally:
#   - LS-1642: original runner-dist S3 perms + EventBridge event bus CRUD
#   - LS-2415: logs:ListTagsForResource on /github-runners/*
#   - LS-2424: logs:ListTagsForResource on /github-self-hosted-runners/*,
#              s3:GetObjectTagging on runner-dist, events:DescribeArchive
#
# After state separation, terraform/main/ no longer touches the runner module,
# so these perms are extracted into a runners/-owned policy that attaches to the
# same legacy-sports-dev-github-actions IAM role by name.
#
# IMPORTANT: This policy attaches to a role defined in main/'s state. If the
# role is ever renamed, this attachment must be updated to match. The role
# itself stays in main/ because backend-setup.tf and github-actions-iam.tf both
# reference it and they cannot move out of main/.

resource "aws_iam_policy" "github_actions_runners" {
  name        = "${local.name_prefix}-github-actions-runners"
  description = "Runner-module-specific permissions for the github-actions OIDC role (LS-2425 state separation)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs read for the github-aws-runners module's log groups.
      # The module creates log groups under two prefixes:
      #   /github-runners/*           — standalone log groups in github-runners.tf
      #   /github-self-hosted-runners/* — module-managed log groups
      # Note: logs:DescribeLogGroups is intentionally omitted here — it requires
      # Resource = "*" and lives in RunnerCloudWatchLogsDescribeAll below.
      {
        Sid    = "RunnerCloudWatchLogsRead"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogStreams",
          "logs:ListTagsLogGroup",
          "logs:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-self-hosted-runners/*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-self-hosted-runners/*:*"
        ]
      },

      # CloudWatch Logs write for the same log groups (runner-apply needs to
      # create/delete/tag them).
      {
        Sid    = "RunnerCloudWatchLogsWrite"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:PutRetentionPolicy",
          "logs:DeleteRetentionPolicy",
          "logs:TagLogGroup",
          "logs:UntagLogGroup",
          "logs:TagResource",
          "logs:UntagResource"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-runners/*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-self-hosted-runners/*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/github-self-hosted-runners/*:*"
        ]
      },

      # EventBridge event bus CRUD for the github-aws-runners module's webhook event bus.
      {
        Sid    = "RunnerEventBridgeEventBus"
        Effect = "Allow"
        Action = [
          "events:DescribeEventBus",
          "events:CreateEventBus",
          "events:DeleteEventBus",
          "events:TagResource",
          "events:UntagResource",
          "events:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:events:${local.region}:${local.account_id}:event-bus/${local.name_prefix}-*"
        ]
      },

      # EventBridge archive operations for the runner-runners-archive resource.
      {
        Sid    = "RunnerEventBridgeArchive"
        Effect = "Allow"
        Action = [
          "events:DescribeArchive",
          "events:CreateArchive",
          "events:UpdateArchive",
          "events:DeleteArchive",
          "events:ListArchives"
        ]
        Resource = [
          "arn:aws:events:${local.region}:${local.account_id}:archive/${local.name_prefix}-*"
        ]
      },

      # S3 runner-dist bucket — bucket-level ListBucket for `aws_s3_bucket.action_dist`
      # in the runner_binaries module.
      {
        Sid    = "RunnerS3DistBucketRead"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketPolicy",
          "s3:GetBucketVersioning",
          "s3:GetBucketTagging",
          "s3:GetBucketPublicAccessBlock",
          "s3:GetBucketAcl",
          "s3:GetBucketCORS",
          "s3:GetEncryptionConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetBucketLogging",
          "s3:GetBucketOwnershipControls",
          "s3:GetBucketNotification"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-runner-*"
        ]
      },

      # S3 runner-dist bucket — object-level GetObject + GetObjectTagging for
      # `aws_s3_object.trigger` and any other object-level reads in the module.
      {
        Sid    = "RunnerS3DistObjectRead"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectTagging",
          "s3:GetObjectVersion",
          "s3:GetObjectVersionTagging"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-runner-*/*"
        ]
      },

      # IAM OIDC provider read — required by data "aws_iam_openid_connect_provider"
      # in data.tf (looks up the GitHub Actions OIDC provider by URL).
      # ListOpenIDConnectProviders is an account-level list operation; resource
      # must be "*". GetOpenIDConnectProvider is needed to read the provider attrs.
      {
        Sid    = "RunnerOIDCProviderRead"
        Effect = "Allow"
        Action = [
          "iam:ListOpenIDConnectProviders",
          "iam:GetOpenIDConnectProvider"
        ]
        Resource = ["*"]
      },

      # SNS topic read — required by data "aws_sns_topic" in data.tf (looks up
      # the ops-alerts topic by name). ListTopics is account-level (resource = "*");
      # GetTopicAttributes is needed for the data source to read topic attributes.
      {
        Sid    = "RunnerSNSRead"
        Effect = "Allow"
        Action = [
          "sns:ListTopics",
          "sns:GetTopicAttributes"
        ]
        Resource = ["*"]
      },

      # CloudWatch Logs broad describe — Terraform's AWS provider calls
      # DescribeLogGroups without a prefix filter when refreshing log group state,
      # which IAM evaluates against the root log-group ARN. The prefix-scoped
      # permissions in RunnerCloudWatchLogsRead cover targeted reads; this covers
      # the account-level list call that the provider issues on every plan/apply.
      {
        Sid    = "RunnerCloudWatchLogsDescribeAll"
        Effect = "Allow"
        Action = ["logs:DescribeLogGroups"]
        Resource = ["*"]
      },

      # CloudWatch Dashboard CRUD — required by aws_cloudwatch_dashboard in
      # runner-dashboard.tf (runner performance monitoring dashboard).
      # ListDashboards does not support resource-level permissions; kept separate.
      {
        Sid    = "RunnerCloudWatchDashboard"
        Effect = "Allow"
        Action = [
          "cloudwatch:GetDashboard",
          "cloudwatch:PutDashboard",
          "cloudwatch:DeleteDashboards"
        ]
        Resource = [
          "arn:aws:cloudwatch::${local.account_id}:dashboard/${local.name_prefix}-*"
        ]
      },
      {
        Sid    = "RunnerCloudWatchDashboardList"
        Effect = "Allow"
        Action = ["cloudwatch:ListDashboards"]
        Resource = ["*"]
      },

      # Cost Explorer anomaly detection CRUD — required by aws_ce_anomaly_monitor
      # and aws_ce_anomaly_subscription in runner-monitoring.tf.
      # CE operates globally (no region in ARNs).
      {
        Sid    = "RunnerCostExplorerAnomaly"
        Effect = "Allow"
        Action = [
          "ce:GetAnomalyMonitors",
          "ce:CreateAnomalyMonitor",
          "ce:UpdateAnomalyMonitor",
          "ce:DeleteAnomalyMonitor",
          "ce:GetAnomalySubscriptions",
          "ce:CreateAnomalySubscription",
          "ce:UpdateAnomalySubscription",
          "ce:DeleteAnomalySubscription",
          "ce:TagResource",
          "ce:UntagResource",
          "ce:ListTagsForResource"
        ]
        Resource = ["*"]
      }
    ]
  })

  tags = local.common_tags
}

# Attach the runner policy to the github-actions OIDC role defined in main/.
# We reference the role by name (not by resource ref) because the role lives
# in a different terraform state.
resource "aws_iam_role_policy_attachment" "github_actions_runners" {
  role       = "${local.name_prefix}-github-actions"
  policy_arn = aws_iam_policy.github_actions_runners.arn
}
