# Rollbar Discord Lambda Configuration
# This Lambda receives Rollbar webhooks (via API Gateway) and CloudWatch Alarm
# notifications (via SNS) and posts formatted embeds to a Discord channel.

# IAM role for the Rollbar Discord Lambda
resource "aws_iam_role" "rollbar_discord_lambda" {
  name        = "${local.name_prefix}-rollbar-discord-lambda-role"
  description = "Execution role for the Rollbar Discord Lambda function"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rollbar_discord_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.rollbar_discord_lambda.name
}

# Policy granting access to the Discord webhook URL secret
resource "aws_iam_policy" "rollbar_discord_lambda_secrets" {
  name        = "${local.name_prefix}-rollbar-discord-lambda-secrets"
  description = "IAM policy for Rollbar Discord Lambda to access secrets in Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.discord_webhook_url.arn,
          aws_secretsmanager_secret.rollbar_webhook_secret.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rollbar_discord_lambda_secrets" {
  policy_arn = aws_iam_policy.rollbar_discord_lambda_secrets.arn
  role       = aws_iam_role.rollbar_discord_lambda.name
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "rollbar_discord_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-rollbar-discord"
  retention_in_days = var.environment == "dev" ? 7 : 14

  tags = local.common_tags
}

# Data source to get the current Rollbar Discord Lambda version from SSM
data "aws_ssm_parameter" "rollbar_discord_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/rollbar-discord/version"
}

# Lambda Function (no VPC — only calls external Discord API)
resource "aws_lambda_function" "rollbar_discord" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "rollbar-discord/rollbar-discord-${data.aws_ssm_parameter.rollbar_discord_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-rollbar-discord"
  role          = aws_iam_role.rollbar_discord_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = 128

  source_code_hash = data.aws_ssm_parameter.rollbar_discord_lambda_version.value

  environment {
    variables = {
      DISCORD_WEBHOOK_URL_SECRET_NAME     = aws_secretsmanager_secret.discord_webhook_url.name
      ROLLBAR_WEBHOOK_SECRET_SECRET_NAME  = aws_secretsmanager_secret.rollbar_webhook_secret.name
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Rollbar error tracking
      ROLLBAR_ACCESS_TOKEN = var.rollbar_access_token
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.rollbar_discord_lambda_basic,
    aws_iam_role_policy_attachment.rollbar_discord_lambda_secrets,
    aws_cloudwatch_log_group.rollbar_discord_lambda
  ]

  tags = local.common_tags
}

# ─── API Gateway Integration ────────────────────────────────────────────────

resource "aws_api_gateway_resource" "rollbar_discord" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "rollbar-discord"
}

# Catch-all sub-paths under /rollbar-discord
resource "aws_api_gateway_resource" "rollbar_discord_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.rollbar_discord.id
  path_part   = "{proxy+}"
}

# ANY method on root /rollbar-discord resource
resource "aws_api_gateway_method" "rollbar_discord_root_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.rollbar_discord.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "rollbar_discord_root_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.rollbar_discord.id
  http_method             = aws_api_gateway_method.rollbar_discord_root_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.rollbar_discord.invoke_arn
}

# ANY method for /rollbar-discord/{proxy+}
resource "aws_api_gateway_method" "rollbar_discord_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.rollbar_discord_paths.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "rollbar_discord_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.rollbar_discord_paths.id
  http_method             = aws_api_gateway_method.rollbar_discord_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.rollbar_discord.invoke_arn
}

# Lambda permission for API Gateway (root path)
resource "aws_lambda_permission" "rollbar_discord_api_gateway_root" {
  statement_id  = "AllowExecutionFromAPIGatewayRoot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rollbar_discord.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/rollbar-discord"
}

# Lambda permission for API Gateway (sub-paths)
resource "aws_lambda_permission" "rollbar_discord_api_gateway_paths" {
  statement_id  = "AllowExecutionFromAPIGatewayPaths"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rollbar_discord.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/rollbar-discord/*"
}

# ─── SNS Subscription (CloudWatch Alarm notifications) ──────────────────────

resource "aws_sns_topic_subscription" "rollbar_discord_ops_alerts" {
  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.rollbar_discord.arn
}

resource "aws_lambda_permission" "rollbar_discord_sns" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rollbar_discord.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.ops_alerts.arn
}
