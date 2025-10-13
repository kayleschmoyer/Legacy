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
  name = "${local.name_prefix}-github-actions"

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
      # Secrets Manager access for RDS credentials
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:legacy-sports-dev-db-creds-*"
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
          "lambda:ListVersionsByFunction"
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
          "dynamodb:DeleteItem"
        ]
        Resource = [
          "arn:aws:dynamodb:${local.region}:${local.account_id}:table/terraform-state-locks"
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
          "iam:ListInstanceProfilesForRole"
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
          "arn:aws:logs:${local.region}:${local.account_id}:log-group::log-stream:"
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
          "s3:GetBucketObjectLockConfiguration"
        ]
        Resource = [
          "arn:aws:s3:::${local.name_prefix}-*"
        ]
      },
      # VPC and networking read permissions
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeRouteTables",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeNatGateways",
          "ec2:DescribeVpcEndpoints",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeInstances",
          "ec2:DescribeAddresses",
          "ec2:DescribeVpcAttribute"
        ]
        Resource = "*"
      },
      # SSM Parameter Store read permissions
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:DescribeParameters"
        ]
        Resource = [
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${local.name_prefix}/*"
        ]
      },
      # RDS and RDS Proxy permissions (read + write for Terraform apply)
      {
        Effect = "Allow"
        Action = [
          # Read permissions
          "rds:DescribeDBInstances",
          "rds:DescribeDBProxies",
          "rds:DescribeDBProxyTargetGroups",
          "rds:DescribeDBProxyTargets",
          "rds:DescribeDBSubnetGroups",
          "rds:ListTagsForResource",
          # Write permissions for Terraform apply
          "rds:ModifyDBProxy",
          "rds:ModifyDBProxyTargetGroup",
          "rds:AddTagsToResource",
          "rds:RemoveTagsFromResource"
        ]
        Resource = "*"
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
      # API Gateway read permissions
      {
        Effect = "Allow"
        Action = [
          "apigateway:GET"
        ]
        Resource = [
          "arn:aws:apigateway:${local.region}::/restapis",
          "arn:aws:apigateway:${local.region}::/restapis/*"
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
          "lambda:ListEventSourceMappings"
        ]
        Resource = [
          "arn:aws:lambda:${local.region}:${local.account_id}:function:${local.name_prefix}-*",
          "arn:aws:lambda:${local.region}:${local.account_id}:event-source-mapping:*"
        ]
      }
    ]
  })
}

# Output the role ARN for GitHub Secrets
output "github_actions_role_arn" {
  description = "ARN of the IAM role for GitHub Actions"
  value       = aws_iam_role.github_actions.arn
  sensitive   = false
}
