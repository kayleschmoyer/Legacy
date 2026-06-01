# MCP CI Server Lambda
# Hosts the tools/mcp/ci-server as an HTTP API Lambda. Cloud agents call the
# Lambda Function URL directly with SigV4 (via the GitHub Actions OIDC role).
# Developers access it via the HTTP API Gateway (lambda-mcp-api-gateway.tf)
# with a Cognito-issued OIDC JWT.
# Shares the mcp_github_token secret with the GitHub MCP Lambda.

# ── IAM role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "mcp_ci_lambda" {
  name        = "${local.name_prefix}-mcp-ci-lambda-role"
  description = "Execution role for the MCP CI server Lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "mcp_ci_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.mcp_ci_lambda.name
}

resource "aws_iam_policy" "mcp_ci_lambda_secrets" {
  name        = "${local.name_prefix}-mcp-ci-lambda-secrets"
  description = "Allows the MCP CI Lambda to read GitHub token and Rollbar token from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          aws_secretsmanager_secret.mcp_github_token.arn,
          aws_secretsmanager_secret.rollbar_access_token.arn,
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "mcp_ci_lambda_secrets" {
  policy_arn = aws_iam_policy.mcp_ci_lambda_secrets.arn
  role       = aws_iam_role.mcp_ci_lambda.name
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "mcp_ci_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-mcp-ci"
  retention_in_days = local.log_retention_days[var.environment]

  tags       = local.common_tags
  depends_on = [aws_vpc_endpoint.logs]
}

# ── Lambda function ───────────────────────────────────────────────────────────

data "aws_ssm_parameter" "mcp_ci_lambda_version" {
  name       = "/legacy-sports/${var.environment}/lambda/mcp-ci/version"
  depends_on = [aws_ssm_parameter.mcp_ci_lambda_version]
}

resource "aws_lambda_function" "mcp_ci" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "mcp-ci/mcp-ci-${data.aws_ssm_parameter.mcp_ci_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-mcp-ci"
  role          = aws_iam_role.mcp_ci_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = 256

  source_code_hash = data.aws_ssm_parameter.mcp_ci_lambda_version.value

  environment {
    variables = {
      GITHUB_TOKEN_SECRET_NAME            = aws_secretsmanager_secret.mcp_github_token.name
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      ROLLBAR_ACCESS_TOKEN_SECRET_NAME    = aws_secretsmanager_secret.rollbar_access_token.name
      MCP_COGNITO_ISSUER                  = local.mcp_cognito_issuer
      MCP_COGNITO_AUDIENCE                = aws_cognito_user_pool_client.mcp_cli.id
      # Scopes advertised in this server's OAuth Protected Resource Metadata
      # (RFC 9728). The claude.ai connector requests these during consent, so
      # the issued access token carries `mcp/ci` and passes the bearer-auth
      # scope check. Without this it defaults to `openid` only and the token
      # would lack the scope (LS-5151).
      MCP_OAUTH_SCOPES = "openid mcp/ci"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.mcp_ci_lambda_basic,
    aws_iam_role_policy_attachment.mcp_ci_lambda_secrets,
    aws_cloudwatch_log_group.mcp_ci_lambda,
  ]

  tags = local.common_tags
}

# ── Lambda Function URL (AWS_IAM) — used by cloud agents via SigV4 ────────────

resource "aws_lambda_function_url" "mcp_ci" {
  function_name      = aws_lambda_function.mcp_ci.function_name
  authorization_type = "AWS_IAM"
}

output "mcp_ci_function_url" {
  description = "Lambda Function URL for the MCP CI server (AWS_IAM auth — cloud agents use SigV4)"
  value       = aws_lambda_function_url.mcp_ci.function_url
}
