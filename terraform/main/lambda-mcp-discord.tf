# MCP Discord Server Lambda
# Hosts tools/mcp/discord-server as an HTTP API Lambda so agents can read one
# admin-only Discord notes channel (LS-10640), mirroring the hosted Rollbar
# server (lambda-mcp-rollbar.tf). All callers reach it via the HTTP API Gateway
# (lambda-mcp-api-gateway.tf) with a Cognito-issued bearer carrying the
# `mcp/discord` scope.
#
# This Lambda runs OUTSIDE the VPC — it only needs to reach Secrets Manager and
# discord.com over the public internet. It is read-only by construction: the
# server exposes no write tools, and the bot itself is invited with View Channel
# + Read Message History on the single notes channel only.

# ── IAM role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "mcp_discord_lambda" {
  name        = "${local.name_prefix}-mcp-discord-lambda-role"
  description = "Execution role for the MCP Discord server Lambda"

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

resource "aws_iam_role_policy_attachment" "mcp_discord_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.mcp_discord_lambda.name
}

resource "aws_iam_policy" "mcp_discord_lambda_secrets" {
  # name_prefix, not name: see the LS-9876 note on mcp_rollbar_lambda_secrets —
  # a fixed name collides with itself on create-before-destroy replacement.
  name_prefix = "${local.name_prefix}-mcp-discord-lambda-secrets-"
  description = "Allows the MCP Discord Lambda to read the Discord bot token from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          aws_secretsmanager_secret.discord_mcp_bot_token.arn,
        ]
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "mcp_discord_lambda_secrets" {
  policy_arn = aws_iam_policy.mcp_discord_lambda_secrets.arn
  role       = aws_iam_role.mcp_discord_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "mcp_discord_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-mcp-discord"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# ── Lambda function ───────────────────────────────────────────────────────────

data "aws_ssm_parameter" "mcp_discord_lambda_version" {
  name       = "/legacy-sports/${var.environment}/lambda/mcp-discord/version"
  depends_on = [aws_ssm_parameter.mcp_discord_lambda_version]
}

resource "aws_lambda_function" "mcp_discord" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "mcp-discord/mcp-discord-${data.aws_ssm_parameter.mcp_discord_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-mcp-discord"
  role          = aws_iam_role.mcp_discord_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = var.lambda_timeout
  memory_size   = 256

  source_code_hash = data.aws_ssm_parameter.mcp_discord_lambda_version.value
  # Deployed version marker read by the drift-check auditor (LS-8434).
  description = data.aws_ssm_parameter.mcp_discord_lambda_version.value

  environment {
    variables = {
      DISCORD_BOT_TOKEN_SECRET_NAME = aws_secretsmanager_secret.discord_mcp_bot_token.name
      DISCORD_BUG_CHANNEL_ID        = var.mcp_discord_channel_id

      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      MCP_COGNITO_ISSUER   = local.mcp_cognito_issuer
      MCP_COGNITO_AUDIENCE = aws_cognito_user_pool_client.mcp_cli.id
      # Scopes advertised in this server's OAuth Protected Resource Metadata
      # (RFC 9728) — the claude.ai connector requests these during consent so
      # the issued access token carries `mcp/discord` and passes the bearer-auth
      # scope check (mirrors lambda-mcp-rollbar.tf).
      MCP_OAUTH_SCOPES = "openid mcp/discord"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.mcp_discord_lambda_basic,
    aws_iam_role_policy_attachment.mcp_discord_lambda_secrets,
    aws_cloudwatch_log_group.mcp_discord_lambda,
  ]

  tags = local.common_tags
}
