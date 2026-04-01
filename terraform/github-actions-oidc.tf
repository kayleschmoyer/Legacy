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

# IAM Role for GitHub Actions to assume
resource "aws_iam_role" "github_actions" {
  name        = "${local.name_prefix}-github-actions"
  description = "OIDC role assumed by GitHub Actions for CI/CD deployments"

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
              "repo:bkrupa/legacy-sports:ref:refs/heads/main",
              "repo:bkrupa/legacy-sports:environment:production",
              "repo:bkrupa/legacy-sports:pull_request"
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
          "iam:UntagPolicy"
        ]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/${local.name_prefix}-*",
          "arn:aws:iam::${local.account_id}:policy/${local.name_prefix}-*"
        ]
      },
      # CloudWatch Logs read permissions
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:ListTagsLogGroup",
          "logs:ListTagsForResource"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group::log-stream:"
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
          "logs:UntagResource"
        ]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.name_prefix}-*:*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*",
          "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/apigateway/${local.name_prefix}-*:*"
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
      # Secrets Manager write permissions for Terraform apply (creating/managing secrets)
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
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}-*"
        ]
      },
      # S3 read permissions for Lambda deployment bucket
      {
        Effect = "Allow"
        Action = [
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
      # ACM permissions for API Gateway custom domain certificate
      {
        Effect = "Allow"
        Action = [
          "acm:DescribeCertificate",
          "acm:ListTagsForCertificate",
          "acm:GetCertificate"
        ]
        Resource = [
          "arn:aws:acm:${local.region}:${local.account_id}:certificate/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
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
      }
    ]
  })
}

# Supplemental managed policy for permissions that would push the inline policy over the 10 KB limit.
# Covers: Budgets CRUD, EventBridge event bus CRUD, and S3 bucket- and object-level reads for the runner-dist bucket.
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
  description = "Supplemental permissions for the GitHub Actions OIDC role (overflow from 10 KB inline policy limit)"

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
          "budgets:DeleteBudget"
        ]
        Resource = [
          "arn:aws:budgets::${local.account_id}:budget/${local.name_prefix}-*"
        ]
      },
      # EventBridge event bus - github-runners module manages an event bus resource
      {
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
      # S3 runner-dist bucket - ListBucket (bucket-level) + GetObject (object-level, HeadObject for aws_s3_object refresh)
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-runner-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-runner-*/*"
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

# Output the role ARN for GitHub Secrets
output "github_actions_role_arn" {
  description = "ARN of the IAM role for GitHub Actions"
  value       = aws_iam_role.github_actions.arn
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
