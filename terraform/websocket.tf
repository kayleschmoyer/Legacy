# WebSocket API Gateway for Real-Time Notifications
# Handles WebSocket connections for draft completion notifications

# DynamoDB table for storing WebSocket connections
resource "aws_dynamodb_table" "websocket_connections" {
  name         = "${local.name_prefix}-websocket-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "leagueId"
    type = "N"
  }

  attribute {
    name = "matchupId"
    type = "N"
  }

  attribute {
    name = "userId"
    type = "N"
  }

  global_secondary_index {
    name            = "LeagueIdIndex"
    hash_key        = "leagueId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "MatchupIdIndex"
    hash_key        = "matchupId"
    projection_type = "ALL"
  }

  # UserIdIndex — enables efficient direct-message delivery:
  # the DB lambda scans this index to find all active WebSocket
  # connections belonging to a DM recipient.
  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    projection_type = "KEYS_ONLY"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# WebSocket API
resource "aws_apigatewayv2_api" "websocket" {
  name                       = "${local.name_prefix}-websocket"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = local.common_tags
}

# WebSocket Lambda IAM Role
resource "aws_iam_role" "websocket_lambda" {
  name        = "${local.name_prefix}-websocket-lambda-role"
  description = "Execution role for the WebSocket Lambda function"

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

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "websocket_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.websocket_lambda.name
}

# VPC execution policy for Lambda
resource "aws_iam_role_policy_attachment" "websocket_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.websocket_lambda.name
}

# DynamoDB policy for WebSocket Lambda
resource "aws_iam_policy" "websocket_lambda_dynamodb" {
  name        = "${local.name_prefix}-websocket-lambda-dynamodb"
  description = "Allow websocket lambda to manage connections in DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query"
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

resource "aws_iam_role_policy_attachment" "websocket_lambda_dynamodb" {
  policy_arn = aws_iam_policy.websocket_lambda_dynamodb.arn
  role       = aws_iam_role.websocket_lambda.name
}

# API Gateway Management API policy
resource "aws_iam_policy" "websocket_lambda_apigw" {
  name        = "${local.name_prefix}-websocket-lambda-apigw"
  description = "Allow websocket lambda to post to connections"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*/@connections/*"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "websocket_lambda_apigw" {
  policy_arn = aws_iam_policy.websocket_lambda_apigw.arn
  role       = aws_iam_role.websocket_lambda.name
}

# Secrets Manager policy for WebSocket Lambda to read DB credentials
resource "aws_iam_policy" "websocket_lambda_secrets" {
  name        = "${local.name_prefix}-websocket-lambda-secrets"
  description = "Allow websocket lambda to read database credentials and JWT secret"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.database_credentials.arn,
          aws_secretsmanager_secret.jwt_secret.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "websocket_lambda_secrets" {
  policy_arn = aws_iam_policy.websocket_lambda_secrets.arn
  role       = aws_iam_role.websocket_lambda.name
}

# SSM parameter for websocket lambda version
resource "aws_ssm_parameter" "websocket_lambda_version" {
  name  = "/legacy-sports/${var.environment}/lambda/websocket/version"
  type  = "String"
  value = "initial"

  tags = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

data "aws_ssm_parameter" "websocket_lambda_version" {
  name = aws_ssm_parameter.websocket_lambda_version.name
}

# WebSocket Lambda Function
resource "aws_lambda_function" "websocket" {
  function_name = "${local.name_prefix}-websocket"
  role          = aws_iam_role.websocket_lambda.arn

  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = "websocket/websocket-${data.aws_ssm_parameter.websocket_lambda_version.value}.zip"

  handler     = "index.handler"
  runtime     = "nodejs20.x"
  timeout     = 30
  memory_size = 256

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      CONNECTIONS_TABLE_NAME              = aws_dynamodb_table.websocket_connections.name
      JWT_SECRET_NAME                     = aws_secretsmanager_secret.jwt_secret.arn
      SENTRY_DSN                          = var.sentry_dsn
      SENTRY_ENVIRONMENT                  = var.environment
      NODE_ENV                            = var.environment
      DB_HOST                             = aws_db_instance.postgres.address
      DB_PORT                             = tostring(aws_db_instance.postgres.port)
      DB_NAME                             = aws_db_instance.postgres.db_name
      DB_SECRET_NAME                      = aws_secretsmanager_secret.database_credentials.arn
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.websocket_lambda_basic,
    aws_iam_role_policy_attachment.websocket_lambda_vpc,
    aws_iam_role_policy_attachment.websocket_lambda_dynamodb,
    aws_iam_role_policy_attachment.websocket_lambda_apigw,
    aws_iam_role_policy_attachment.websocket_lambda_secrets,
  ]

  tags = local.common_tags
}

# CloudWatch Log Group for WebSocket Lambda
resource "aws_cloudwatch_log_group" "websocket_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.websocket.function_name}"
  retention_in_days = var.environment == "dev" ? 7 : 14

  tags = local.common_tags
}

# Lambda permission for API Gateway to invoke
resource "aws_lambda_permission" "websocket_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*"
}

# WebSocket Routes
resource "aws_apigatewayv2_route" "connect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.websocket.id}"
  # Note: Authorization handled at application level in Lambda handler
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.websocket.id}"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.websocket.id}"
}

# WebSocket Integration
resource "aws_apigatewayv2_integration" "websocket" {
  api_id           = aws_apigatewayv2_api.websocket.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.websocket.invoke_arn
}

# WebSocket Stage
# NOTE: Access logs intentionally DISABLED for security
# JWT tokens may be passed in query string (?token=...) for browser compatibility.
# Enabling access logs would expose tokens in CloudWatch.
# Mitigations:
# - Tokens are short-lived (enforced by jwt-manager)
# - Tokens redacted in application-level debug logs
# - Authorization header supported for CLI/native clients
resource "aws_apigatewayv2_stage" "websocket" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = var.environment
  auto_deploy = true

  # access_log_settings INTENTIONALLY OMITTED - see security note above

  default_route_settings {
    throttling_burst_limit = 500
    throttling_rate_limit  = 100
  }

  tags = local.common_tags
}

# Outputs
output "websocket_url" {
  description = "WebSocket URL for client connections"
  value       = aws_apigatewayv2_stage.websocket.invoke_url
}

output "websocket_api_endpoint" {
  description = "WebSocket API endpoint for sending messages from lambdas"
  value       = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${data.aws_region.current.name}.amazonaws.com/${var.environment}"
}

output "connections_table_name" {
  description = "DynamoDB table name for WebSocket connections"
  value       = aws_dynamodb_table.websocket_connections.name
}
