# IAM policy for GitHub Actions role to access SSM parameters
# Required for Lambda deployment workflows to read versions and S3 bucket names

data "aws_iam_role" "github_actions" {
  name = "legacy-sports-dev-github-actions"
}

# Policy to allow GitHub Actions to read and write Lambda deployment SSM parameters
resource "aws_iam_policy" "github_actions_ssm" {
  name        = "legacy-sports-dev-github-actions-ssm"
  description = "Allow GitHub Actions to read/write SSM parameters for Lambda deployments"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadDeploymentParameters"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/legacy-sports/${var.environment}/s3/lambda-deployments-bucket",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/legacy-sports/${var.environment}/lambda/*/version"
        ]
      },
      {
        Sid    = "WriteVersionParameters"
        Effect = "Allow"
        Action = [
          "ssm:PutParameter"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/legacy-sports/${var.environment}/lambda/*/version"
        ]
      }
    ]
  })

  tags = {
    Name        = "legacy-sports-dev-github-actions-ssm"
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "legacy-sports"
  }
}

# Attach the policy to the GitHub Actions role
resource "aws_iam_role_policy_attachment" "github_actions_ssm" {
  role       = data.aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_ssm.arn
}
