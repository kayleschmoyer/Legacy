# Stripe Webhook Lambda Configuration
# This Lambda verifies Stripe webhook signatures, handles subscription lifecycle
# events (checkout.session.completed, customer.subscription.*, invoice.*),
# syncs subscription state to the database, and pushes real-time tier changes
# via the WebSocket notification service.

# IAM role for the Stripe Webhook Lambda
resource "aws_iam_role" "stripe_webhook_lambda" {
  name        = "${local.name_prefix}-stripe-webhook-lambda-role"
  description = "Execution role for the Stripe Webhook Lambda function"

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

resource "aws_iam_role_policy_attachment" "stripe_webhook_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.stripe_webhook_lambda.name
}

# VPC access for RDS connectivity
resource "aws_iam_role_policy_attachment" "stripe_webhook_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.stripe_webhook_lambda.name
}

# Policy granting access to Stripe secrets in Secrets Manager
resource "aws_iam_policy" "stripe_webhook_lambda_secrets" {
  name        = "${local.name_prefix}-stripe-webhook-lambda-secrets"
  description = "Allow Stripe Webhook Lambda to read Stripe secrets from Secrets Manager"

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
          aws_secretsmanager_secret.stripe_secret_key.arn,
          aws_secretsmanager_secret.stripe_webhook_secret.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "stripe_webhook_lambda_secrets" {
  policy_arn = aws_iam_policy.stripe_webhook_lambda_secrets.arn
  role       = aws_iam_role.stripe_webhook_lambda.name
}

# RDS Proxy access for database connectivity
resource "aws_iam_policy" "stripe_webhook_lambda_rds" {
  name        = "${local.name_prefix}-stripe-webhook-lambda-rds"
  description = "Allow Stripe Webhook Lambda to connect to RDS via Proxy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["rds-db:connect"]
        Resource = [
          "arn:aws:rds-db:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:dbuser:${var.enable_rds_proxy ? aws_db_proxy.main[0].id : aws_db_instance.postgres.identifier}/${var.database_username}"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "stripe_webhook_lambda_rds" {
  policy_arn = aws_iam_policy.stripe_webhook_lambda_rds.arn
  role       = aws_iam_role.stripe_webhook_lambda.name
}

# Policy granting WebSocket notification permissions (DynamoDB + execute-api)
resource "aws_iam_policy" "stripe_webhook_lambda_websocket" {
  name        = "${local.name_prefix}-stripe-webhook-lambda-websocket"
  description = "Allow Stripe Webhook Lambda to send WebSocket notifications"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["execute-api:ManageConnections"]
        Resource = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*/@connections/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.websocket_connections.arn,
          "${aws_dynamodb_table.websocket_connections.arn}/index/*"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "stripe_webhook_lambda_websocket" {
  policy_arn = aws_iam_policy.stripe_webhook_lambda_websocket.arn
  role       = aws_iam_role.stripe_webhook_lambda.name
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "stripe_webhook_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-stripe-webhook"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# Lambda Function
resource "aws_lambda_function" "stripe_webhook" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "stripe-webhook/stripe-webhook-${aws_ssm_parameter.stripe_webhook_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-stripe-webhook"
  role          = aws_iam_role.stripe_webhook_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = 256

  source_code_hash = aws_ssm_parameter.stripe_webhook_lambda_version.value

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      STRIPE_SECRET_KEY_SECRET_NAME       = aws_secretsmanager_secret.stripe_secret_key.name
      STRIPE_WEBHOOK_SECRET_SECRET_NAME   = aws_secretsmanager_secret.stripe_webhook_secret.name
      CONNECTIONS_TABLE_NAME              = aws_dynamodb_table.websocket_connections.name
      WEBSOCKET_ENDPOINT                  = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${data.aws_region.current.name}.amazonaws.com/${var.environment}"
      STRIPE_GRACE_PERIOD_DAYS            = tostring(var.stripe_grace_period_days)
      DB_HOST                             = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      DB_PORT                             = "5432"
      DB_NAME                             = "legacy_sports"

      # Discord notifications for Stripe events
      DISCORD_STRIPE_WEBHOOK_URL = var.discord_stripe_webhook_url

      # Rollbar error tracking
      ROLLBAR_ACCESS_TOKEN = var.rollbar_access_token

      # Google Analytics 4 Measurement Protocol (server-side events)
      GA_MEASUREMENT_ID = var.ga_measurement_id
      GA_API_SECRET     = var.ga_api_secret
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.stripe_webhook_lambda_basic,
    aws_iam_role_policy_attachment.stripe_webhook_lambda_vpc,
    aws_iam_role_policy_attachment.stripe_webhook_lambda_secrets,
    aws_iam_role_policy_attachment.stripe_webhook_lambda_rds,
    aws_iam_role_policy_attachment.stripe_webhook_lambda_websocket,
    aws_cloudwatch_log_group.stripe_webhook_lambda
  ]

  tags = local.common_tags
}

# ── API Gateway Integration ───────────────────────────────────────────────────

resource "aws_api_gateway_resource" "stripe_webhook" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "stripe-webhook"
}

# POST method — Stripe sends all webhook events here
resource "aws_api_gateway_method" "stripe_webhook_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.stripe_webhook.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "stripe_webhook_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.stripe_webhook.id
  http_method             = aws_api_gateway_method.stripe_webhook_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.stripe_webhook.invoke_arn
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "stripe_webhook_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stripe_webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/stripe-webhook"
}
