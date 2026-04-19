# GitHub Actions OIDC Provider for AWS Integration
# This enables secure, keyless authentication from GitHub Actions to AWS

# OIDC Provider for GitHub Actions
resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]

  tags = local.common_tags
}

# IAM Role for GitHub Actions apply jobs (post-merge main branch only).
# Pull-request workflows must use github_actions_plan (read-only) instead.
resource "aws_iam_role" "github_actions" {
  name                 = "${local.name_prefix}-github-actions"
  description          = "OIDC role assumed by GitHub Actions for CI/CD deployments (apply - main branch only)"
  permissions_boundary = aws_iam_policy.github_actions_boundary.arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            # pull_request removed — PR workflows use github_actions_plan (read-only)
            "token.actions.githubusercontent.com:sub" = [
              "repo:bkrupa/legacy-sports:ref:refs/heads/main",
              "repo:bkrupa/legacy-sports:environment:production"
            ]
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

# Attach existing lambda deployment policy
resource "aws_iam_role_policy_attachment" "github_actions_lambda_deployment" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.lambda_deployment_policy.arn
}

# Additional permissions for GitHub Actions
resource "aws_iam_role_policy" "github_actions_additional" {
  name = "${local.name_prefix}-github-actions-additional"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Secrets Manager access for RDS credentials and application secrets
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:legacy-sports-dev-db-creds-*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}-*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:dev/*"
        ]
      },
      # Lambda function updates
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:ListVersionsByFunction",
          "lambda:AddPermission",
          "lambda:RemovePermission",
          "lambda:GetPolicy",
          # Required for first-time Lambda creation via Terraform
          "lambda:CreateFunction",
          "lambda:DeleteFunction",
          "lambda:TagResource",
          "lambda:UntagResource",
          "lambda:PutFunctionConcurrency",
          "lambda:DeleteFunctionConcurrency",
          "lambda:PutFunctionEventInvokeConfig",
          "lambda:DeleteFunctionEventInvokeConfig"
        ]
        Resource = [
          "arn:aws:lambda:${local.region}:${local.account_id}:function:${local.name_prefix}-*"
        ]
      },
      # Terraform state and operations
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::legacy-sports-terraform-state/*",
          "arn:aws:s3:::terraform-state-*/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::legacy-sports-terraform-state",
          "arn:aws:s3:::terraform-state-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:ListTagsOfResource",
          "dynamodb:UpdateTable",
          "dynamodb:UpdateTimeToLive",
          "dynamodb:UpdateContinuousBackups",
          "dynamodb:TagResource",
          "dynamodb:UntagResource",
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable"
        ]
        Resource = [
          "arn:aws:dynamodb:${local.region}:${local.account_id}:table/terraform-state-locks",
          "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${local.name_prefix}-*"
        ]
      },
      # IAM read permissions for Terraform plan/apply
      {
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:ListPolicyVersions",
          "iam:ListInstanceProfilesForRole",
          "iam:GetInstanceProfile",
          "iam:PassRole",
          "iam:GetOpenIDConnectProvider"
        ]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:instance-profile/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
        ]
      },
      # IAM write permissions for Terraform apply (creating new Lambda IAM roles/policies)
      {
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:UpdateRole",
          "iam:UpdateAssumeRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:SetDefaultPolicyVersion",
          "iam:TagPolicy",
          "iam:UntagPolicy",
          "iam:CreateInstanceProfile",
          "iam:DeleteInstanceProfile",
          "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile",
          "iam:TagInstanceProfile",
          "iam:UntagInstanceProfile"
        ]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:instance-profile/${local.name_prefix}-*"
        ]
      },
      # CloudWatch Logs read permissions
      # Note: runner log group read perms (/github-runners/* and /github-self-hosted-runners/*)
      # are no longer needed here as of LS-2425. State separation moved module.github_runners
      # into terraform/runners/ which has its own state file, so the regular Apply Lambda
      # Infrastructure workflow no longer refreshes runner resources.
      #
      # logs:DescribeLogGroups does not support resource-level permissions — it must use Resource "*".
      # Splitting it into its own statement avoids AccessDeniedException during terraform plan/refresh.
      {
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogStreams",
          "logs:ListTagsLogGroup",
          "logs:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/cloudtrail/${local.name_prefix}*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/cloudtrail/${local.name_prefix}*:*"
        ]
      },
      # CloudWatch Logs write permissions for Terraform apply (creating new log groups)
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:PutRetentionPolicy",
          "logs:DeleteRetentionPolicy",
          "logs:TagLogGroup",
          "logs:UntagLogGroup",
          "logs:TagResource",
          "logs:UntagResource",
          "logs:PutMetricFilter",
          "logs:DeleteMetricFilter",
          "logs:DescribeMetricFilters"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/cloudtrail/${local.name_prefix}*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/cloudtrail/${local.name_prefix}*:*"
        ]
      },
      # Secrets Manager read permissions
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecretVersionIds",
          "secretsmanager:GetResourcePolicy"
        ]
        Resource = [
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}-*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:dev/*"
        ]
      },
      # S3 read permissions for Lambda deployment bucket
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketPolicy",
          "s3:GetBucketVersioning",
          "s3:GetBucketTagging",
          "s3:GetBucketPublicAccessBlock",
          "s3:GetBucketAcl",
          "s3:GetBucketCORS",
          "s3:GetBucketWebsite",
          "s3:GetAccelerateConfiguration",
          "s3:GetBucketRequestPayment",
          "s3:GetEncryptionConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetBucketLogging",
          "s3:GetReplicationConfiguration",
          "s3:GetBucketObjectLockConfiguration",
          "s3:GetBucketOwnershipControls",
          "s3:GetBucketNotification"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-*",
          "arn:aws:s3:::legacy-sports-terraform-state"
        ]
      },
      # S3 bucket-admin write permissions for Terraform apply (encryption, public access block, lifecycle)
      # CreateBucket/DeleteBucket included as safety net in case the bucket drops from remote state.
      # Scoped to the project namespace (name_prefix-*) to cover all managed buckets (ci-artifacts, team-logos, etc.)
      {
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:PutEncryptionConfiguration",
          "s3:PutBucketPublicAccessBlock",
          "s3:PutLifecycleConfiguration",
          "s3:PutBucketVersioning",
          "s3:PutBucketPolicy",
          "s3:DeleteBucketPolicy",
          "s3:PutBucketCORS",
          "s3:PutBucketTagging"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-*"
        ]
      },
      # VPC, EC2, and networking read permissions
      {
        Effect = "Allow"
        Action = [
          "ec2:Describe*"
        ]
        Resource = "*"
      },
      # EC2 write permissions for NAT instance management
      {
        Effect = "Allow"
        Action = [
          "ec2:RunInstances",
          "ec2:TerminateInstances",
          "ec2:StopInstances",
          "ec2:StartInstances",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:ModifyInstanceAttribute",
          "ec2:AssociateAddress",
          "ec2:DisassociateAddress",
          "ec2:AllocateAddress",
          "ec2:ReleaseAddress",
          "ec2:CreateRoute",
          "ec2:DeleteRoute",
          "ec2:ReplaceRoute",
          "ec2:CreateSecurityGroup",
          "ec2:DeleteSecurityGroup",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:ModifyVpcEndpoint",
          "ec2:CreateVpcEndpoint",
          "ec2:DeleteVpcEndpoints"
        ]
        Resource = [
          "arn:aws:ec2:${local.region}:${local.account_id}:*",
          "arn:aws:ec2:${local.region}::image/*"
        ]
      },
      # SSM Parameter Store read/write permissions
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
          "ssm:PutParameter",
          "ssm:DeleteParameter",
          "ssm:ListTagsForResource",
          "ssm:AddTagsToResource",
          "ssm:RemoveTagsFromResource"
        ]
        Resource = [
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${local.name_prefix}/*",
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/legacy-sports/${var.environment}/*",
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/github-action-runners/${local.name_prefix}-*"
        ]
      },
      # SSM DescribeParameters requires wildcard resource
      {
        Effect = "Allow"
        Action = [
          "ssm:DescribeParameters"
        ]
        Resource = "*"
      },
      # RDS and RDS Proxy permissions (read + write for Terraform apply)
      {
        Effect = "Allow"
        Action = [
          # Read permissions (wildcard needed for Terraform refresh/plan)
          "rds:DescribeDBInstances",
          "rds:DescribeDBProxies",
          "rds:DescribeDBProxyTargetGroups",
          "rds:DescribeDBProxyTargets",
          "rds:DescribeDBSubnetGroups",
          "rds:ListTagsForResource"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          # Write permissions for Terraform apply
          "rds:ModifyDBInstance",
          "rds:ModifyDBProxy",
          "rds:ModifyDBProxyTargetGroup",
          "rds:AddTagsToResource",
          "rds:RemoveTagsFromResource"
        ]
        Resource = [
          "arn:aws:rds:${local.region}:${local.account_id}:db:${local.name_prefix}-*",
          "arn:aws:rds:${local.region}:${local.account_id}:db-proxy:*",
          "arn:aws:rds:${local.region}:${local.account_id}:target-group:*",
          "arn:aws:rds:${local.region}:${local.account_id}:subgrp:${local.name_prefix}-*"
        ]
      },
      # SQS read permissions
      {
        Effect = "Allow"
        Action = [
          "sqs:GetQueueAttributes",
          "sqs:ListQueueTags"
        ]
        Resource = [
          "arn:aws:sqs:${local.region}:${local.account_id}:${local.name_prefix}-*"
        ]
      },
      # Route 53 read permissions
      {
        Effect = "Allow"
        Action = [
          "route53:GetHostedZone",
          "route53:ListTagsForResource",
          "route53:ListResourceRecordSets"
        ]
        Resource = [
          "arn:aws:route53:::hostedzone/*"
        ]
      },
      # Route 53 write permissions for ACM DNS validation and API Gateway custom domain
      {
        Effect = "Allow"
        Action = [
          "route53:ChangeResourceRecordSets"
        ]
        Resource = [
          "arn:aws:route53:::hostedzone/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "route53:GetChange"
        ]
        Resource = [
          "arn:aws:route53:::change/*"
        ]
      },
      # API Gateway read permissions (REST API + WebSocket/HTTP API v2 + custom domains + account)
      {
        Effect = "Allow"
        Action = [
          "apigateway:GET"
        ]
        Resource = [
          "arn:aws:apigateway:${local.region}::/restapis",
          "arn:aws:apigateway:${local.region}::/restapis/*",
          "arn:aws:apigateway:${local.region}::/apis",
          "arn:aws:apigateway:${local.region}::/apis/*",
          "arn:aws:apigateway:${local.region}::/domainnames",
          "arn:aws:apigateway:${local.region}::/domainnames/*",
          "arn:aws:apigateway:${local.region}::/account"
        ]
      },
      # API Gateway write permissions for Terraform apply (integration responses, methods, domains, account, etc.)
      {
        Effect = "Allow"
        Action = [
          "apigateway:PUT",
          "apigateway:POST",
          "apigateway:PATCH",
          "apigateway:DELETE"
        ]
        Resource = [
          "arn:aws:apigateway:${local.region}::/restapis/*",
          "arn:aws:apigateway:${local.region}::/apis/*",
          "arn:aws:apigateway:${local.region}::/domainnames",
          "arn:aws:apigateway:${local.region}::/domainnames/*",
          "arn:aws:apigateway:${local.region}::/tags/*",
          "arn:aws:apigateway:${local.region}::/account"
        ]
      },
      # API Gateway tagging - scoped to PUT only (Terraform tag operations)
      {
        Effect = "Allow"
        Action = [
          "apigateway:PUT"
        ]
        Resource = [
          "arn:aws:apigateway:${local.region}::/tags/*"
        ]
      },
      # Lambda read permissions
      {
        Effect = "Allow"
        Action = [
          "lambda:GetFunction",
          "lambda:GetFunctionCodeSigningConfig",
          "lambda:GetFunctionConfiguration",
          "lambda:GetPolicy",
          "lambda:ListTags",
          "lambda:ListVersionsByFunction",
          "lambda:GetEventSourceMapping",
          "lambda:ListEventSourceMappings",
          "lambda:ListFunctions"
        ]
        Resource = "*"
      },
      # EventBridge rule permissions for Terraform state refresh and resource management
      {
        Effect = "Allow"
        Action = [
          "events:DescribeRule",
          "events:ListTargetsByRule",
          "events:ListRules",
          "events:ListTagsForResource",
          "events:DeleteRule",
          "events:RemoveTargets",
          "events:PutRule",
          "events:PutTargets",
          "events:TagResource",
          "events:UntagResource"
        ]
        Resource = [
          "arn:aws:events:${local.region}:${local.account_id}:rule/${local.name_prefix}-*"
        ]
      },
      # Lambda event source mapping write permissions for Terraform apply
      {
        Effect = "Allow"
        Action = [
          "lambda:CreateEventSourceMapping",
          "lambda:UpdateEventSourceMapping",
          "lambda:DeleteEventSourceMapping"
        ]
        Resource = "*"
      },
      # SNS permissions for Terraform apply (ops alerts topic)
      {
        Effect = "Allow"
        Action = [
          "sns:CreateTopic",
          "sns:DeleteTopic",
          "sns:GetTopicAttributes",
          "sns:SetTopicAttributes",
          "sns:ListTagsForResource",
          "sns:TagResource",
          "sns:UntagResource",
          "sns:Subscribe",
          "sns:Unsubscribe",
          "sns:GetSubscriptionAttributes"
        ]
        Resource = [
          "arn:aws:sns:${local.region}:${local.account_id}:${local.name_prefix}-*"
        ]
      },
      # CloudWatch Metric Alarm permissions for Terraform apply (DLQ monitoring alarms)
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListTagsForResource",
          "cloudwatch:TagResource",
          "cloudwatch:UntagResource"
        ]
        Resource = [
          "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name_prefix}-*"
        ]
      },
    ]
  })
}

# Supplemental managed policy for permissions that would push the inline policy over the 10 KB limit.
# Covers: Budgets CRUD, ACM (certificate) read/write, and Secrets Manager write permissions for all
# Terraform-managed secrets. As of LS-2425, runner-module-specific permissions
# (logs:ListTagsForResource on /github-self-hosted-runners/*, S3 reads on the runner-dist bucket,
# events:DescribeArchive on the runner archive, EventBridge event bus CRUD) live in
# terraform/runners/runner-iam-additional.tf and are attached to the same role by name.
#
# Import: this policy was bootstrapped manually before the first apply to break the chicken-and-egg
# dependency (the workflow needs the permissions to plan, but apply is needed to grant them).
# The import block below tells Terraform to adopt the existing AWS resource rather than create a new one.
import {
  to = aws_iam_policy.github_actions_supplemental
  id = "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-github-actions-supplemental"
}

import {
  to = aws_iam_role_policy_attachment.github_actions_supplemental
  id = "${local.name_prefix}-github-actions/arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-github-actions-supplemental"
}

resource "aws_iam_policy" "github_actions_supplemental" {
  name        = "${local.name_prefix}-github-actions-supplemental"
  description = "Supplemental permissions for GitHub Actions OIDC role (overflow from 10KB inline policy limit)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # AWS Budgets - plan/apply needs ViewBudget to refresh aws_budgets_budget state
      {
        Effect = "Allow"
        Action = [
          "budgets:ViewBudget",
          "budgets:ModifyBudget",
          "budgets:CreateBudget",
          "budgets:DeleteBudget",
          "budgets:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:budgets::${local.account_id}:budget/${local.name_prefix}-*"
        ]
      },
      # ACM permissions — moved here from the inline policy to stay under the 10 KB limit.
      {
        Effect = "Allow"
        Action = [
          "acm:DescribeCertificate",
          "acm:ListTagsForCertificate",
          "acm:GetCertificate",
          "acm:RequestCertificate",
          "acm:DeleteCertificate",
          "acm:AddTagsToCertificate",
          "acm:RemoveTagsFromCertificate"
        ]
        Resource = [
          "arn:aws:acm:${local.region}:${local.account_id}:certificate/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "acm:ListCertificates"
        ]
        Resource = "*"
      },
      # CloudTrail permissions for Terraform apply (creating/managing the audit trail)
      {
        Effect = "Allow"
        Action = [
          "cloudtrail:CreateTrail",
          "cloudtrail:DeleteTrail",
          "cloudtrail:UpdateTrail",
          "cloudtrail:GetTrail",
          "cloudtrail:DescribeTrails",
          "cloudtrail:GetTrailStatus",
          "cloudtrail:StartLogging",
          "cloudtrail:StopLogging",
          "cloudtrail:PutEventSelectors",
          "cloudtrail:GetEventSelectors",
          "cloudtrail:PutInsightSelectors",
          "cloudtrail:GetInsightSelectors",
          "cloudtrail:AddTags",
          "cloudtrail:RemoveTags",
          "cloudtrail:ListTags"
        ]
        Resource = [
          "arn:aws:cloudtrail:${local.region}:${local.account_id}:trail/${local.name_prefix}-*"
        ]
      },
      # Secrets Manager write permissions — moved here from the inline policy to stay under the 10 KB limit.
      # Secrets Manager appends a random 6-char suffix to all secret ARNs, hence the trailing wildcard on dev/* entries.
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:CreateSecret",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:UpdateSecretVersionStage",
          "secretsmanager:TagResource",
          "secretsmanager:UntagResource",
          "secretsmanager:RestoreSecret"
        ]
        Resource = [
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}-*",
          # Externally-managed secrets — one entry per secret in secrets.tf using the ${var.environment}/ prefix.
          # Secrets Manager appends a random 6-char suffix to all secret ARNs, hence the trailing wildcard.
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/jwt-secret-key*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/google-oauth-client-secret*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/oauth-proxy/cookie-secret*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/stripe-secret-key*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/stripe-webhook-secret*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/jira-credentials*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/rollbar-webhook-secret*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/discord-client-secret*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/mlb-data-api-key*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/discord-webhook-url*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/discord-user-signup-webhook-url*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/discord-stripe-webhook-url*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/ga-api-secret*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/rollbar-access-token*",
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_supplemental" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_supplemental.arn
}

# Output the apply role ARN for GitHub Secrets
output "github_actions_role_arn" {
  description = "ARN of the GitHub Actions apply IAM role (main branch only)"
  value       = aws_iam_role.github_actions.arn
  sensitive   = false
}

# ─────────────────────────────────────────────────────────────────────────────
# Permission boundary for the apply role
# ─────────────────────────────────────────────────────────────────────────────
#
# Caps the maximum permissions any policy attached to this role can grant,
# eliminating the IAM privilege-escalation path where the role could create a
# legacy-sports-dev-* policy with overly broad permissions and attach it to
# itself (both iam:CreatePolicy and iam:AttachRolePolicy are scoped only to the
# name_prefix namespace, so without a boundary the role could craft a
# legacy-sports-dev-evil policy granting unrestricted IAM or other actions).
#
# How it works:
#   Effective permissions = role policies ∩ boundary
#   The boundary grants Allow *, then adds explicit Deny statements for the
#   specific escalation vectors. Deny always wins over Allow in AWS IAM, so
#   even if an attached policy grants a broader action, the Deny in the
#   boundary takes precedence.
resource "aws_iam_policy" "github_actions_boundary" {
  name        = "${local.name_prefix}-github-actions-boundary"
  description = "Permission boundary for the GitHub Actions apply role — prevents IAM privilege escalation beyond the project namespace"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Broad allow — effective permissions are still bounded by the role's own
      # inline/attached policies AND by the explicit Deny statements below.
      {
        Sid      = "AllowAll"
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      },
      # Block creating IAM policies outside the project namespace.
      # Without this, the role could create legacy-sports-dev-evil with
      # Action: ["iam:*"] Resource: "*" and then attach it to itself.
      {
        Sid    = "DenyCreatePolicyOutsideNamespace"
        Effect = "Deny"
        Action = [
          "iam:CreatePolicy",
          "iam:CreatePolicyVersion"
        ]
        NotResource = [
          "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-*"
        ]
      },
      # Block attaching policies that are not from the project namespace or AWS managed.
      # Prevents attaching AdministratorAccess or arbitrary customer-managed policies.
      {
        Sid    = "DenyAttachPolicyOutsideNamespace"
        Effect = "Deny"
        Action = ["iam:AttachRolePolicy"]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*"
        ]
        Condition = {
          ArnNotLike = {
            "iam:PolicyARN" = [
              "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-*",
              "arn:aws:iam::aws:policy/*"
            ]
          }
        }
      },
      # Block creating or modifying IAM roles outside the project namespace.
      {
        Sid    = "DenyCreateRoleOutsideNamespace"
        Effect = "Deny"
        Action = [
          "iam:CreateRole",
          "iam:UpdateRole",
          "iam:DeleteRole"
        ]
        NotResource = [
          "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*"
        ]
      },
      # Block IAM user and group management entirely — CI should never manage human identities.
      {
        Sid    = "DenyUserAndGroupManagement"
        Effect = "Deny"
        Action = [
          "iam:CreateUser",
          "iam:DeleteUser",
          "iam:UpdateUser",
          "iam:AttachUserPolicy",
          "iam:PutUserPolicy",
          "iam:DetachUserPolicy",
          "iam:CreateGroup",
          "iam:DeleteGroup",
          "iam:AttachGroupPolicy",
          "iam:DetachGroupPolicy",
          "iam:PutGroupPolicy",
          "iam:CreateAccessKey",
          "iam:DeleteAccessKey",
          "iam:UpdateAccessKey"
        ]
        Resource = "*"
      },
      # Block AWS Organization and account-level actions.
      {
        Sid      = "DenyOrganizationActions"
        Effect   = "Deny"
        Action   = ["organizations:*", "account:*"]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

# ─────────────────────────────────────────────────────────────────────────────
# Plan role — read-only, assumed by pull-request workflows
# ─────────────────────────────────────────────────────────────────────────────
#
# Workflows triggered on pull_request (e.g. check-migrations-applied,
# lambda-health-checks) assume this role instead of the apply role.
# It cannot modify Lambda functions, secrets, IAM resources, or any other
# infrastructure write surface. The only write permission granted is the
# DynamoDB state lock (required by terraform plan) and EC2 security group
# ingress modification (required by check-migrations-applied.yml to
# temporarily open port 5432 for GitHub-hosted runners).
resource "aws_iam_role" "github_actions_plan" {
  name        = "${local.name_prefix}-github-actions-plan"
  description = "OIDC role assumed by GitHub Actions PR workflows (read-only - no infrastructure write permissions)"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            # pull_request: PR workflows (primary use case — no infra write access)
            # ref:refs/heads/main: workflow_dispatch manual runs on main (e.g. lambda-health-checks,
            #   check-migrations-applied ad-hoc checks). The plan role is still read-only for
            #   infrastructure; the main-branch trust only allows health/check workflows to assume it.
            "token.actions.githubusercontent.com:sub" = [
              "repo:bkrupa/legacy-sports:pull_request",
              "repo:bkrupa/legacy-sports:ref:refs/heads/main"
            ]
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "github_actions_plan_policy" {
  name = "${local.name_prefix}-github-actions-plan"
  role = aws_iam_role.github_actions_plan.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Terraform state read (plan reads current state from S3)
      {
        Sid    = "TerraformStateRead"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::legacy-sports-terraform-state",
          "arn:aws:s3:::legacy-sports-terraform-state/*",
          "arn:aws:s3:::terraform-state-*",
          "arn:aws:s3:::terraform-state-*/*"
        ]
      },
      # Terraform state lock (plan acquires a DynamoDB lock to prevent concurrent runs)
      {
        Sid    = "TerraformStateLock"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:DescribeTable"
        ]
        Resource = [
          "arn:aws:dynamodb:${local.region}:${local.account_id}:table/terraform-state-locks"
        ]
      },
      # IAM read (terraform plan reads role/policy definitions to diff against desired state)
      {
        Sid    = "IamRead"
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:ListPolicyVersions",
          "iam:ListInstanceProfilesForRole",
          "iam:GetInstanceProfile",
          "iam:GetOpenIDConnectProvider"
        ]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:instance-profile/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
        ]
      },
      # Lambda read
      {
        Sid    = "LambdaRead"
        Effect = "Allow"
        Action = [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:GetFunctionCodeSigningConfig",
          "lambda:GetPolicy",
          "lambda:ListTags",
          "lambda:ListVersionsByFunction",
          "lambda:GetEventSourceMapping",
          "lambda:ListEventSourceMappings",
          "lambda:ListFunctions"
        ]
        Resource = "*"
      },
      # SSM read (for terraform plan var resolution and check-migrations-applied)
      {
        Sid    = "SsmRead"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
          "ssm:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${local.name_prefix}/*",
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/legacy-sports/${var.environment}/*",
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/github-action-runners/${local.name_prefix}-*"
        ]
      },
      {
        Sid      = "SsmDescribeParameters"
        Effect   = "Allow"
        Action   = ["ssm:DescribeParameters"]
        Resource = "*"
      },
      # Secrets Manager read (for terraform plan and check-migrations-applied DB credentials)
      {
        Sid    = "SecretsManagerRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecretVersionIds",
          "secretsmanager:GetResourcePolicy"
        ]
        Resource = [
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}-*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:dev/*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:legacy-sports-dev-db-creds-*"
        ]
      },
      # CloudWatch Logs read
      # Note: runner log group read perms (/github-runners/* and /github-self-hosted-runners/*)
      # are no longer needed here as of LS-2425. State separation moved module.github_runners
      # into terraform/runners/ which has its own state file, so the regular Apply Lambda
      # Infrastructure workflow no longer refreshes runner resources.
      # logs:DescribeLogGroups does not support resource-level permissions — must use Resource "*".
      {
        Sid      = "CloudWatchLogsDescribe"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogsRead"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogStreams",
          "logs:ListTagsLogGroup",
          "logs:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/cloudtrail/${local.name_prefix}*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/cloudtrail/${local.name_prefix}*:*"
        ]
      },
      # EC2 read
      {
        Sid      = "Ec2Read"
        Effect   = "Allow"
        Action   = ["ec2:Describe*"]
        Resource = "*"
      },
      # EC2 security group ingress — check-migrations-applied.yml temporarily opens/closes
      # port 5432 on the RDS security group to allow GitHub-hosted runners to reach the DB.
      {
        Sid    = "Ec2SgIngressForMigrationCheck"
        Effect = "Allow"
        Action = [
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress"
        ]
        Resource = [
          "arn:aws:ec2:${local.region}:${local.account_id}:security-group/*"
        ]
      },
      # RDS read
      {
        Sid    = "RdsRead"
        Effect = "Allow"
        Action = [
          "rds:DescribeDBInstances",
          "rds:DescribeDBProxies",
          "rds:DescribeDBProxyTargetGroups",
          "rds:DescribeDBProxyTargets",
          "rds:DescribeDBSubnetGroups",
          "rds:ListTagsForResource"
        ]
        Resource = "*"
      },
      # SQS read
      {
        Sid    = "SqsRead"
        Effect = "Allow"
        Action = ["sqs:GetQueueAttributes", "sqs:ListQueueTags"]
        Resource = [
          "arn:aws:sqs:${local.region}:${local.account_id}:${local.name_prefix}-*"
        ]
      },
      # Route53 read
      {
        Sid    = "Route53Read"
        Effect = "Allow"
        Action = [
          "route53:GetHostedZone",
          "route53:ListTagsForResource",
          "route53:ListResourceRecordSets",
          "route53:GetChange"
        ]
        Resource = "*"
      },
      # API Gateway read
      {
        Sid    = "ApiGatewayRead"
        Effect = "Allow"
        Action = ["apigateway:GET"]
        Resource = [
          "arn:aws:apigateway:${local.region}::/restapis",
          "arn:aws:apigateway:${local.region}::/restapis/*",
          "arn:aws:apigateway:${local.region}::/apis",
          "arn:aws:apigateway:${local.region}::/apis/*",
          "arn:aws:apigateway:${local.region}::/domainnames",
          "arn:aws:apigateway:${local.region}::/domainnames/*",
          "arn:aws:apigateway:${local.region}::/account"
        ]
      },
      # DynamoDB read (project tables, not the state-lock table)
      {
        Sid    = "DynamoDbRead"
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:ListTagsOfResource"
        ]
        Resource = [
          "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${local.name_prefix}-*"
        ]
      },
      # ACM read
      {
        Sid      = "AcmRead"
        Effect   = "Allow"
        Action   = ["acm:DescribeCertificate", "acm:ListTagsForCertificate", "acm:GetCertificate", "acm:ListCertificates"]
        Resource = "*"
      },
      # CloudWatch alarms read
      {
        Sid    = "CloudWatchAlarmsRead"
        Effect = "Allow"
        Action = ["cloudwatch:DescribeAlarms", "cloudwatch:ListTagsForResource"]
        Resource = [
          "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name_prefix}-*"
        ]
      },
      # CloudTrail read (plan refresh for aws_cloudtrail resources)
      {
        Sid    = "CloudTrailRead"
        Effect = "Allow"
        Action = [
          "cloudtrail:GetTrail",
          "cloudtrail:DescribeTrails",
          "cloudtrail:GetTrailStatus",
          "cloudtrail:GetEventSelectors",
          "cloudtrail:GetInsightSelectors",
          "cloudtrail:ListTags"
        ]
        Resource = [
          "arn:aws:cloudtrail:${local.region}:${local.account_id}:trail/${local.name_prefix}-*"
        ]
      },
      # CloudWatch Logs metric filter read (plan refresh for aws_cloudwatch_log_metric_filter)
      {
        Sid    = "CloudWatchLogsMetricFilterRead"
        Effect = "Allow"
        Action = ["logs:DescribeMetricFilters"]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/cloudtrail/${local.name_prefix}*"
        ]
      },
      # SNS read
      {
        Sid    = "SnsRead"
        Effect = "Allow"
        Action = ["sns:GetTopicAttributes", "sns:ListTagsForResource", "sns:GetSubscriptionAttributes"]
        Resource = [
          "arn:aws:sns:${local.region}:${local.account_id}:${local.name_prefix}-*"
        ]
      },
      # EventBridge read
      # Note: events:DescribeArchive and the archive/* ARN scope are no longer needed
      # here as of LS-2425. State separation moved module.github_runners (which owns the
      # only EventBridge archive in the project) into terraform/runners/.
      {
        Sid    = "EventBridgeRead"
        Effect = "Allow"
        Action = [
          "events:DescribeRule",
          "events:DescribeEventBus",
          "events:ListTargetsByRule",
          "events:ListRules",
          "events:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:events:${local.region}:${local.account_id}:rule/${local.name_prefix}-*",
          "arn:aws:events:${local.region}:${local.account_id}:event-bus/${local.name_prefix}-*"
        ]
      },
      # Budgets read
      {
        Sid    = "BudgetsRead"
        Effect = "Allow"
        Action = ["budgets:ViewBudget", "budgets:ListTagsForResource"]
        Resource = [
          "arn:aws:budgets::${local.account_id}:budget/${local.name_prefix}-*"
        ]
      },
      # S3 read (project buckets — Lambda deployment bucket, ci-artifacts, etc.)
      # The runner-dist bucket lives in terraform/runners/ as of LS-2425; runner-module
      # S3 read perms moved to terraform/runners/runner-iam-additional.tf.
      {
        Sid    = "S3Read"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketPolicy",
          "s3:GetBucketVersioning",
          "s3:GetBucketTagging",
          "s3:GetBucketPublicAccessBlock",
          "s3:GetBucketAcl",
          "s3:GetBucketCORS",
          "s3:GetBucketWebsite",
          "s3:GetAccelerateConfiguration",
          "s3:GetBucketRequestPayment",
          "s3:GetEncryptionConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:GetBucketLogging",
          "s3:GetReplicationConfiguration",
          "s3:GetBucketObjectLockConfiguration",
          "s3:GetBucketOwnershipControls",
          "s3:GetBucketNotification",
          "s3:GetObject",
          "s3:GetObjectTagging"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-*",
          "arn:aws:s3:::${local.name_prefix}-*/*"
        ]
      }
    ]
  })
}

output "github_actions_plan_role_arn" {
  description = "ARN of the read-only IAM role for GitHub Actions PR workflows (plan/check jobs)"
  value       = aws_iam_role.github_actions_plan.arn
  sensitive   = false
}

# Narrow IAM Role for CI artifact S3 uploads (any branch, S3-only permissions)
resource "aws_iam_role" "ci_artifacts" {
  name        = "${local.name_prefix}-ci-artifacts"
  description = "OIDC role for CI artifact S3 uploads - feature branches, S3 only"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:bkrupa/legacy-sports:ref:refs/heads/*",
              "repo:bkrupa/legacy-sports:pull_request"
            ]
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ci_artifacts_s3" {
  role       = aws_iam_role.ci_artifacts.name
  policy_arn = aws_iam_policy.ci_artifacts.arn
}

output "ci_artifacts_role_arn" {
  description = "ARN of the narrow CI artifacts IAM role (S3 read/write/delete for CI artifact upload and download)"
  value       = aws_iam_role.ci_artifacts.arn
  sensitive   = false
}
