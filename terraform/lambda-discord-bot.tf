# =============================================================================
# Discord Bot Lambda — handles Discord slash command interactions
# =============================================================================
# Processes /jira commands from Discord to create Jira tickets.
# No VPC required — only calls external APIs (Discord, Jira).

# ─── IAM ───────────────────────────────────────────────────────────────────

resource "aws_iam_role" "discord_bot_lambda" {
  name = "${local.name_prefix}-discord-bot-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "discord_bot_lambda_basic" {
  role       = aws_iam_role.discord_bot_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "discord_bot_lambda_secrets" {
  name = "${local.name_prefix}-discord-bot-secrets"
  role = aws_iam_role.discord_bot_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Resource = [
        aws_secretsmanager_secret.jira_credentials.arn
      ]
    }]
  })
}

# ─── CloudWatch Log Group ──────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "discord_bot_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-discord-bot"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# ─── SSM Version Parameter ─────────────────────────────────────────────────
# Resource created in ssm-lambda-versions.tf; data source reads it at plan time.

data "aws_ssm_parameter" "discord_bot_lambda_version" {
  name = aws_ssm_parameter.discord_bot_lambda_version.name
}

# ─── Lambda Function ──────────────────────────────────────────────────────

resource "aws_lambda_function" "discord_bot" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "discord-bot/discord-bot-${data.aws_ssm_parameter.discord_bot_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-discord-bot"
  role          = aws_iam_role.discord_bot_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = 128

  source_code_hash = data.aws_ssm_parameter.discord_bot_lambda_version.value

  environment {
    variables = {
      DISCORD_BOT_PUBLIC_KEY              = var.discord_bot_public_key
      JIRA_CREDENTIALS_SECRET_NAME        = aws_secretsmanager_secret.jira_credentials.name
      JIRA_PROJECT_KEY                    = "LS"
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      ROLLBAR_ACCESS_TOKEN                = var.rollbar_access_token
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.discord_bot_lambda_basic,
    aws_iam_role_policy.discord_bot_lambda_secrets,
    aws_cloudwatch_log_group.discord_bot_lambda
  ]

  tags = local.common_tags
}

# ─── API Gateway Integration ──────────────────────────────────────────────

resource "aws_api_gateway_resource" "discord_bot" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "discord-bot"
}

resource "aws_api_gateway_method" "discord_bot_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.discord_bot.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "discord_bot" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.discord_bot.id
  http_method             = aws_api_gateway_method.discord_bot_any.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = aws_lambda_function.discord_bot.invoke_arn
}

resource "aws_lambda_permission" "discord_bot_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.discord_bot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
