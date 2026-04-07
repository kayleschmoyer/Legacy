# Stats Lambda Configuration
resource "aws_iam_role" "stats_lambda" {
  name        = "${local.name_prefix}-stats-lambda-role"
  description = "Execution role for the Stats Lambda function"

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

resource "aws_iam_role_policy_attachment" "stats_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.stats_lambda.name
}

# IAM policy for VPC access
resource "aws_iam_role_policy_attachment" "stats_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.stats_lambda.name
}

# Custom policy for Stats Lambda
resource "aws_iam_policy" "stats_lambda_secrets" {
  name        = "${local.name_prefix}-stats-lambda-secrets"
  description = "IAM policy for Stats Lambda to access secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = concat(
          [
            aws_secretsmanager_secret.database_credentials.arn
          ],
          var.mlb_data_api_key != "" ? [aws_secretsmanager_secret.mlb_data_api_key[0].arn] : []
        )
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_policy" "stats_lambda_sqs" {
  name        = "${local.name_prefix}-stats-lambda-sqs"
  description = "IAM policy for Stats Lambda to access SQS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.load_season_stats.arn,
          aws_sqs_queue.load_game_stats.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.websocket_connections.arn,
          "${aws_dynamodb_table.websocket_connections.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = [
          "${aws_apigatewayv2_api.websocket.execution_arn}/*/*/@connections/*"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "stats_lambda_secrets" {
  policy_arn = aws_iam_policy.stats_lambda_secrets.arn
  role       = aws_iam_role.stats_lambda.name
}

resource "aws_iam_role_policy_attachment" "stats_lambda_sqs" {
  policy_arn = aws_iam_policy.stats_lambda_sqs.arn
  role       = aws_iam_role.stats_lambda.name
}

# IAM policy for RDS access
resource "aws_iam_policy" "stats_lambda_rds" {
  name        = "${local.name_prefix}-stats-lambda-rds"
  description = "IAM policy for Stats Lambda to access RDS"

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

resource "aws_iam_role_policy_attachment" "stats_lambda_rds" {
  policy_arn = aws_iam_policy.stats_lambda_rds.arn
  role       = aws_iam_role.stats_lambda.name
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "stats_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-stats"
  retention_in_days = local.log_retention_days[var.environment]

  tags       = local.common_tags
  depends_on = [aws_vpc_endpoint.logs]
}

# Data source to get the current Stats Lambda version from SSM
data "aws_ssm_parameter" "stats_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/stats/version"
}

# Lambda Function
resource "aws_lambda_function" "stats" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "stats/stats-${data.aws_ssm_parameter.stats_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-stats"
  role          = aws_iam_role.stats_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.environment == "dev" ? 600 : var.lambda_stats_timeout
  memory_size   = var.environment == "dev" ? 256 : 512 # Lower memory for dev

  reserved_concurrent_executions = 1 # Enforce single instance to prevent rate limiting

  source_code_hash = data.aws_ssm_parameter.stats_lambda_version.value

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      # New unified credential system environment variables
      DB_SECRET_NAME        = aws_secretsmanager_secret.database_credentials.name
      DB_HOST               = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      USE_LOCAL_CREDENTIALS = "false"

      # Legacy support - keep DB_CREDS_PATH as fallback
      DB_CREDS_PATH = aws_secretsmanager_secret.database_credentials.name

      SQS_LOAD_SEASON_STATS_URL = aws_sqs_queue.load_season_stats.url
      SQS_LOAD_GAME_STATS_URL   = aws_sqs_queue.load_game_stats.url
      # Legacy support - keep SQS_QUEUE_URL for backward compatibility
      SQS_QUEUE_URL = aws_sqs_queue.load_season_stats.url

      # WebSocket configuration
      CONNECTIONS_TABLE_NAME = aws_dynamodb_table.websocket_connections.name
      WEBSOCKET_ENDPOINT     = replace(aws_apigatewayv2_stage.websocket.invoke_url, "wss://", "https://")

      NODE_ENV                            = var.environment
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Rollbar error tracking
      ROLLBAR_ACCESS_TOKEN = var.rollbar_access_token

      # MLB data provider configuration
      MLB_DATA_PROVIDER            = var.mlb_data_provider
      MLB_DATA_API_KEY_SECRET_NAME = var.mlb_data_api_key != "" ? aws_secretsmanager_secret.mlb_data_api_key[0].name : ""
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.stats_lambda_basic,
    aws_iam_role_policy_attachment.stats_lambda_vpc,
    aws_iam_role_policy_attachment.stats_lambda_secrets,
    aws_iam_role_policy_attachment.stats_lambda_sqs,
    aws_iam_role_policy_attachment.stats_lambda_rds,
    aws_cloudwatch_log_group.stats_lambda
  ]

  tags = local.common_tags
}

# API Gateway Integration for Stats
resource "aws_api_gateway_resource" "stats" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "stats"
}

# Catch-all resource for stats paths
resource "aws_api_gateway_resource" "stats_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.stats.id
  path_part   = "{proxy+}"
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "stats_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.stats_paths.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "stats_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.stats_paths.id
  http_method = aws_api_gateway_method.stats_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_method_response" "stats_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.stats_paths.id
  http_method = aws_api_gateway_method.stats_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "stats_options" {
  depends_on = [aws_api_gateway_integration.stats_options]

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.stats_paths.id
  http_method = aws_api_gateway_method.stats_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# POST method for stats processing
resource "aws_api_gateway_method" "stats_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.stats_paths.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "stats_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.stats_paths.id
  http_method             = aws_api_gateway_method.stats_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.stats.invoke_arn
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "stats_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stats.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}

# SQS Event Source Mapping for Stats Lambda (Season Stats)
resource "aws_lambda_event_source_mapping" "stats_sqs_season" {
  event_source_arn = aws_sqs_queue.load_season_stats.arn
  function_name    = aws_lambda_function.stats.arn

  # Batch processing configuration
  batch_size = 10
  # Note: maximum_batching_window_in_seconds is not supported for FIFO queues

  # Error handling
  function_response_types = ["ReportBatchItemFailures"]

  depends_on = [
    aws_lambda_function.stats,
    aws_sqs_queue.load_season_stats
  ]
}

# SQS Event Source Mapping for Stats Lambda (Game Stats)
resource "aws_lambda_event_source_mapping" "stats_sqs_game" {
  event_source_arn = aws_sqs_queue.load_game_stats.arn
  function_name    = aws_lambda_function.stats.arn

  # Batch processing configuration
  # batch_size=1 keeps each invocation to at most 1 matchup (~8 players × 3 stat types = 24 BBRef
  # requests × 4s spacing = ~96s baseline). The previous value of 5 multiplied that to 480s,
  # leaving no headroom for 429 exponential backoff (15s→30s→60s per retried URL).
  batch_size = 1
  # Note: maximum_batching_window_in_seconds is not supported for FIFO queues

  # Error handling
  function_response_types = ["ReportBatchItemFailures"]

  depends_on = [
    aws_lambda_function.stats,
    aws_sqs_queue.load_game_stats
  ]
}
