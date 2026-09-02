locals {
  # App Store Server Notifications carry an 'environment' field distinguishing
  # Sandbox vs Production; the lambda rejects notifications signed for the
  # wrong one. staging shares dev's Sandbox behavior (no production Apple
  # traffic reaches it).
  apple_iap_expected_environment = {
    dev     = "Sandbox"
    staging = "Sandbox"
    prod    = "Production"
  }
}

# Apple IAP Lambda Configuration
# Receives App Store Server Notifications v2 from Apple whenever a subscription
# event occurs (new subscription, renewal, cancellation, refund, etc.), verifies
# the JWS signature, syncs subscription state to the database, and pushes
# real-time tier changes via the WebSocket notification service.
#
# LS-9012: this lambda shipped with source, tests, and a working handler but was
# never wired into Terraform or CI, so it was never deployed to AWS in any
# environment — App Store notifications had nowhere to land.

# IAM role for the Apple IAP Lambda
resource "aws_iam_role" "apple_iap_lambda" {
  name        = "${local.name_prefix}-apple-iap-lambda-role"
  description = "Execution role for the Apple IAP Lambda function"

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

resource "aws_iam_role_policy_attachment" "apple_iap_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.apple_iap_lambda.name
}

# VPC access for RDS connectivity
resource "aws_iam_role_policy_attachment" "apple_iap_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.apple_iap_lambda.name
}

# Policy granting access to GA4/Rollbar/DB secrets in Secrets Manager
resource "aws_iam_policy" "apple_iap_lambda_secrets" {
  name        = "${local.name_prefix}-apple-iap-lambda-secrets"
  description = "Allow Apple IAP Lambda to read GA4/Rollbar/DB credentials secrets from Secrets Manager"

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
          aws_secretsmanager_secret.ga_api_secret.arn,
          aws_secretsmanager_secret.rollbar_access_token.arn,
          aws_secretsmanager_secret.database_credentials.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "apple_iap_lambda_secrets" {
  policy_arn = aws_iam_policy.apple_iap_lambda_secrets.arn
  role       = aws_iam_role.apple_iap_lambda.name
}

# RDS Proxy access for database connectivity
resource "aws_iam_policy" "apple_iap_lambda_rds" {
  name        = "${local.name_prefix}-apple-iap-lambda-rds"
  description = "Allow Apple IAP Lambda to connect to RDS via Proxy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["rds-db:connect"]
        Resource = [
          "arn:aws:rds-db:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:dbuser:${var.enable_rds_proxy ? aws_db_proxy.main[0].id : aws_db_instance.postgres.identifier}/${var.database_username}"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "apple_iap_lambda_rds" {
  policy_arn = aws_iam_policy.apple_iap_lambda_rds.arn
  role       = aws_iam_role.apple_iap_lambda.name
}

# Policy granting WebSocket notification permissions (DynamoDB + execute-api)
resource "aws_iam_policy" "apple_iap_lambda_websocket" {
  name        = "${local.name_prefix}-apple-iap-lambda-websocket"
  description = "Allow Apple IAP Lambda to send WebSocket notifications"

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

resource "aws_iam_role_policy_attachment" "apple_iap_lambda_websocket" {
  policy_arn = aws_iam_policy.apple_iap_lambda_websocket.arn
  role       = aws_iam_role.apple_iap_lambda.name
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "apple_iap_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-apple-iap"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# Lambda Function
resource "aws_lambda_function" "apple_iap" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "apple-iap/apple-iap-${aws_ssm_parameter.apple_iap_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-apple-iap"
  role          = aws_iam_role.apple_iap_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = 256

  source_code_hash = aws_ssm_parameter.apple_iap_lambda_version.value
  # Deployed version marker read by the drift-check auditor (LS-8434)
  description = aws_ssm_parameter.apple_iap_lambda_version.value

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Apple bundle ID is not sensitive (it's embedded in the shipped mobile
      # app), so it's passed as a plain env var rather than via Secrets Manager.
      APPLE_BUNDLE_ID = var.apple_bundle_id

      # Production must reject sandbox-signed notifications and vice versa.
      EXPECTED_APPLE_ENVIRONMENT = local.apple_iap_expected_environment[var.environment]

      DB_HOST        = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      DB_PORT        = "5432"
      DB_NAME        = "legacy_sports"
      DB_SECRET_NAME = aws_secretsmanager_secret.database_credentials.name
      # Legacy support - keep DB_CREDS_PATH as fallback
      DB_CREDS_PATH = aws_secretsmanager_secret.database_credentials.name

      CONNECTIONS_TABLE_NAME = aws_dynamodb_table.websocket_connections.name
      WEBSOCKET_ENDPOINT     = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${data.aws_region.current.id}.amazonaws.com/${var.environment}"

      # Rollbar error tracking (token fetched from Secrets Manager at cold-start)
      ROLLBAR_ACCESS_TOKEN_SECRET_NAME = aws_secretsmanager_secret.rollbar_access_token.name

      # Google Analytics 4 Measurement Protocol (server-side events).
      # GA_MEASUREMENT_ID is not sensitive; the API secret is fetched from Secrets Manager.
      GA_MEASUREMENT_ID         = var.ga_measurement_id
      GA_API_SECRET_SECRET_NAME = aws_secretsmanager_secret.ga_api_secret.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.apple_iap_lambda_basic,
    aws_iam_role_policy_attachment.apple_iap_lambda_vpc,
    aws_iam_role_policy_attachment.apple_iap_lambda_secrets,
    aws_iam_role_policy_attachment.apple_iap_lambda_rds,
    aws_iam_role_policy_attachment.apple_iap_lambda_websocket,
    aws_cloudwatch_log_group.apple_iap_lambda
  ]

  tags = local.common_tags
}

# ── API Gateway Integration ───────────────────────────────────────────────────
# Apple POSTs App Store Server Notifications v2 directly to this endpoint with
# no auth header — the lambda authenticates the request itself by verifying the
# JWS signature chains to Apple's root CA (see lambdas/apple-iap/src/jws.ts).

resource "aws_api_gateway_resource" "apple_iap" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "apple-iap"
}

resource "aws_api_gateway_method" "apple_iap_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.apple_iap.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "apple_iap_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.apple_iap.id
  http_method             = aws_api_gateway_method.apple_iap_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.apple_iap.invoke_arn
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "apple_iap_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.apple_iap.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/apple-iap"
}
