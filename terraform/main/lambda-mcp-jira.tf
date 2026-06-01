# MCP Jira Server Lambda
# Hosts the tools/mcp/jira-server as an HTTP API Lambda. Cloud agents call the
# Lambda Function URL directly with SigV4 (via the GitHub Actions OIDC role).
# Developers access it via the HTTP API Gateway (lambda-mcp-api-gateway.tf)
# with a Cognito-issued OIDC JWT.

# ── IAM role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "mcp_jira_lambda" {
  name        = "${local.name_prefix}-mcp-jira-lambda-role"
  description = "Execution role for the MCP Jira server Lambda"

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

resource "aws_iam_role_policy_attachment" "mcp_jira_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.mcp_jira_lambda.name
}

resource "aws_iam_policy" "mcp_jira_lambda_secrets" {
  name        = "${local.name_prefix}-mcp-jira-lambda-secrets"
  description = "Allows the MCP Jira Lambda to read Jira credentials and Rollbar token from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          aws_secretsmanager_secret.jira_credentials.arn,
          aws_secretsmanager_secret.rollbar_access_token.arn,
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "mcp_jira_lambda_secrets" {
  policy_arn = aws_iam_policy.mcp_jira_lambda_secrets.arn
  role       = aws_iam_role.mcp_jira_lambda.name
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "mcp_jira_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-mcp-jira"
  retention_in_days = local.log_retention_days[var.environment]

  tags       = local.common_tags
  depends_on = [aws_vpc_endpoint.logs]
}

# ── Lambda function ───────────────────────────────────────────────────────────

data "aws_ssm_parameter" "mcp_jira_lambda_version" {
  name       = "/legacy-sports/${var.environment}/lambda/mcp-jira/version"
  depends_on = [aws_ssm_parameter.mcp_jira_lambda_version]
}

resource "aws_lambda_function" "mcp_jira" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "mcp-jira/mcp-jira-${data.aws_ssm_parameter.mcp_jira_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-mcp-jira"
  role          = aws_iam_role.mcp_jira_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = 256

  source_code_hash = data.aws_ssm_parameter.mcp_jira_lambda_version.value

  environment {
    variables = {
      JIRA_SECRET_NAME                    = aws_secretsmanager_secret.jira_credentials.name
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      ROLLBAR_ACCESS_TOKEN_SECRET_NAME    = aws_secretsmanager_secret.rollbar_access_token.name
      MCP_COGNITO_ISSUER                  = local.mcp_cognito_issuer
      MCP_COGNITO_AUDIENCE                = aws_cognito_user_pool_client.mcp_cli.id
      # Scopes advertised in this server's OAuth Protected Resource Metadata
      # (RFC 9728). The claude.ai connector requests these during consent, so
      # the issued access token carries `mcp/jira` and passes the bearer-auth
      # scope check. Without this it defaults to `openid` only and the token
      # would lack the scope (LS-5151).
      MCP_OAUTH_SCOPES = "openid mcp/jira"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.mcp_jira_lambda_basic,
    aws_iam_role_policy_attachment.mcp_jira_lambda_secrets,
    aws_cloudwatch_log_group.mcp_jira_lambda,
  ]

  tags = local.common_tags
}

# ── Lambda Function URL (AWS_IAM) — used by cloud agents via SigV4 ────────────

resource "aws_lambda_function_url" "mcp_jira" {
  function_name      = aws_lambda_function.mcp_jira.function_name
  authorization_type = "AWS_IAM"
}

output "mcp_jira_function_url" {
  description = "Lambda Function URL for the MCP Jira server (AWS_IAM auth — cloud agents use SigV4)"
  value       = aws_lambda_function_url.mcp_jira.function_url
}
