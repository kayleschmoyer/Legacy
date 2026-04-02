# Data source to get the current GraphQL Lambda version from SSM
data "aws_ssm_parameter" "graphql_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/graphql/version"
}

# IAM role for the GraphQL Lambda
resource "aws_iam_role" "graphql_lambda" {
  name        = "${local.name_prefix}-graphql-lambda-role"
  description = "Execution role for the GraphQL API Lambda function"

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

# IAM policy for Lambda basic execution
resource "aws_iam_role_policy_attachment" "graphql_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.graphql_lambda.name
}

# IAM policy for VPC access
resource "aws_iam_role_policy_attachment" "graphql_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.graphql_lambda.name
}

# IAM policy for Secrets Manager access
resource "aws_iam_policy" "graphql_lambda_secrets" {
  name        = "${local.name_prefix}-graphql-lambda-secrets"
  description = "IAM policy for GraphQL Lambda to access Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetResourcePolicy",
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecretVersionIds"
        ]
        Resource = concat(
          [
            aws_secretsmanager_secret.database_credentials.arn,
            aws_secretsmanager_secret.jwt_secret.arn,
            aws_secretsmanager_secret.stripe_secret_key.arn,
            aws_secretsmanager_secret.stripe_webhook_secret.arn
          ],
          var.mlb_data_api_key != "" ? [aws_secretsmanager_secret.mlb_data_api_key[0].arn] : []
        )
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "graphql_lambda_secrets" {
  policy_arn = aws_iam_policy.graphql_lambda_secrets.arn
  role       = aws_iam_role.graphql_lambda.name
}

# IAM policy for RDS access
resource "aws_iam_policy" "graphql_lambda_rds" {
  name        = "${local.name_prefix}-graphql-lambda-rds"
  description = "IAM policy for GraphQL Lambda to access RDS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = [
          "arn:aws:rds-db:${local.region}:${local.account_id}:dbuser:${var.enable_rds_proxy ? aws_db_proxy.main[0].id : aws_db_instance.postgres.identifier}/${var.database_username}"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "graphql_lambda_rds" {
  policy_arn = aws_iam_policy.graphql_lambda_rds.arn
  role       = aws_iam_role.graphql_lambda.name
}

# IAM policy for SQS access (sending messages to draft queue)
resource "aws_iam_policy" "graphql_lambda_sqs" {
  name        = "${local.name_prefix}-graphql-lambda-sqs"
  description = "IAM policy for GraphQL Lambda to send messages to SQS queues"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl"
        ]
        Resource = [
          aws_sqs_queue.automatic_drafts.arn,
          aws_sqs_queue.load_season_stats.arn,
          aws_sqs_queue.select_game.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "graphql_lambda_sqs" {
  policy_arn = aws_iam_policy.graphql_lambda_sqs.arn
  role       = aws_iam_role.graphql_lambda.name
}

# IAM policy for WebSocket/DynamoDB permissions (roster update notifications)
resource "aws_iam_policy" "graphql_lambda_websocket" {
  name        = "${local.name_prefix}-graphql-lambda-websocket"
  description = "Allow GraphQL Lambda to send WebSocket notifications"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*/@connections/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Scan",
          "dynamodb:Query",
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

resource "aws_iam_role_policy_attachment" "graphql_lambda_websocket" {
  policy_arn = aws_iam_policy.graphql_lambda_websocket.arn
  role       = aws_iam_role.graphql_lambda.name
}

# Lambda function
resource "aws_lambda_function" "graphql" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "graphql/graphql-${data.aws_ssm_parameter.graphql_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-graphql"
  role          = aws_iam_role.graphql_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = var.environment == "dev" ? 512 : 1024

  source_code_hash = data.aws_ssm_parameter.graphql_lambda_version.value

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      # Database configuration - use RDS proxy for connection pooling and security
      DB_SECRET_NAME        = aws_secretsmanager_secret.database_credentials.name
      DB_HOST               = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      USE_LOCAL_CREDENTIALS = "false"
      DB_CERT_PATH          = "/opt/certs/us-east-1-bundle.pem"

      # Legacy support - keep DB_CREDS_PATH as fallback
      DB_CREDS_PATH = aws_secretsmanager_secret.database_credentials.name

      # Runtime configuration
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "debug"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Auth configuration
      JWT_SECRET_NAME = aws_secretsmanager_secret.jwt_secret.name

      # SQS Queue URLs
      SQS_LOAD_SEASON_STATS_URL = aws_sqs_queue.load_season_stats.url
      SQS_AUTOMATIC_DRAFTS_URL  = aws_sqs_queue.automatic_drafts.url
      SQS_SELECT_GAME_URL       = aws_sqs_queue.select_game.url

      # Rollbar error tracking
      ROLLBAR_ACCESS_TOKEN = var.rollbar_access_token

      # WebSocket configuration for notifications
      CONNECTIONS_TABLE_NAME = aws_dynamodb_table.websocket_connections.name
      WEBSOCKET_ENDPOINT     = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${data.aws_region.current.id}.amazonaws.com/${var.environment}"

      # System API key for EventBridge / admin CLI system mutations
      SYSTEM_API_KEY = random_password.system_api_key.result

      # Stripe payment integration
      STRIPE_SECRET_KEY_SECRET_NAME     = aws_secretsmanager_secret.stripe_secret_key.name
      STRIPE_WEBHOOK_SECRET_SECRET_NAME = aws_secretsmanager_secret.stripe_webhook_secret.name
      STRIPE_PUBLISHABLE_KEY            = var.stripe_publishable_key
      STRIPE_TRIAL_PERIOD_DAYS          = tostring(var.stripe_trial_period_days)

      # CORS — comma-separated list of origins permitted to make cross-origin
      # requests.  Must include the production web domain so draft-pick (and all
      # other GraphQL) requests from the browser are not blocked by the Lambda's
      # origin-reflection guard in handler.ts.
      # Falls back to the handler's built-in default when domain_name is empty.
      CORS_ALLOWED_ORIGINS = var.domain_name != "" ? "https://${var.domain_name}" : "https://legacy-fantasy.com"

      # MLB data provider configuration
      MLB_DATA_PROVIDER            = var.mlb_data_provider
      MLB_DATA_API_KEY_SECRET_NAME = var.mlb_data_api_key != "" ? aws_secretsmanager_secret.mlb_data_api_key[0].name : ""
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.graphql_lambda_basic,
    aws_iam_role_policy_attachment.graphql_lambda_vpc,
    aws_iam_role_policy_attachment.graphql_lambda_secrets,
    aws_iam_role_policy_attachment.graphql_lambda_rds,
    aws_iam_role_policy_attachment.graphql_lambda_websocket,
  ]

  tags = local.common_tags
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "graphql_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.graphql.function_name}"
  retention_in_days = local.log_retention_days[var.environment]

  tags       = local.common_tags
  depends_on = [aws_vpc_endpoint.logs]
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "graphql_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# Legacy GraphQL Lambda and IAM role (DECOMMISSIONED on September 26, 2025)
# These resources were successfully destroyed as they were replaced by the new GraphQL Lambda:
# - aws_lambda_function.legacy_graphql (legacy-sports-graphql-dev-graphql)
# - aws_iam_role.legacy_graphql_lambda (legacy-sports-graphql-dev-us-east-1-lambdaRole)
