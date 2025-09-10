# Game Selection Lambda Configuration
resource "aws_iam_role" "game_selection_lambda" {
  name = "${local.name_prefix}-game-selection-lambda-role"

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

resource "aws_iam_role_policy_attachment" "game_selection_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.game_selection_lambda.name
}

resource "aws_iam_role_policy_attachment" "game_selection_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.game_selection_lambda.name
}

# Custom policy for Game Selection Lambda
resource "aws_iam_policy" "game_selection_lambda_secrets" {
  name        = "${local.name_prefix}-game-selection-lambda-secrets"
  description = "IAM policy for Game Selection Lambda to access secrets"

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
          aws_secretsmanager_secret.database_credentials.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "game_selection_lambda_secrets" {
  policy_arn = aws_iam_policy.game_selection_lambda_secrets.arn
  role       = aws_iam_role.game_selection_lambda.name
}

# IAM policy for RDS access
resource "aws_iam_policy" "game_selection_lambda_rds" {
  name        = "${local.name_prefix}-game-selection-lambda-rds"
  description = "IAM policy for Game Selection Lambda to access RDS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = [
          "arn:aws:rds-db:${local.region}:${local.account_id}:dbuser:${var.enable_rds_proxy ? aws_db_proxy.main[0].id : aws_db_instance.postgres.identifier}/*"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "game_selection_lambda_rds" {
  policy_arn = aws_iam_policy.game_selection_lambda_rds.arn
  role       = aws_iam_role.game_selection_lambda.name
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "game_selection_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-game-selection"
  retention_in_days = 14

  tags = local.common_tags
}

# Build Game Selection Lambda
resource "null_resource" "build_game_selection_lambda" {
  triggers = {
    source_hash = sha256(join("", [
      for f in fileset("${path.module}/../lambdas/game-selection/src", "**/*.{ts,js,json}")
      : filesha256("${path.module}/../lambdas/game-selection/src/${f}")
    ]))
    package_json = filesha256("${path.module}/../lambdas/game-selection/project.json")
  }

  provisioner "local-exec" {
    command     = "npx nx run game-selection:build"
    working_dir = "${path.module}/.."
  }
}

# Archive Game Selection Lambda
data "archive_file" "game_selection_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/game-selection/dist"
  output_path = "${path.module}/../lambdas/game-selection/game-selection-lambda.zip"
  
  depends_on = [null_resource.build_game_selection_lambda]
}

# Lambda Function
resource "aws_lambda_function" "game_selection" {
  filename         = data.archive_file.game_selection_lambda.output_path
  function_name    = "${local.name_prefix}-game-selection"
  role            = aws_iam_role.game_selection_lambda.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 30
  memory_size     = 256

  source_code_hash = data.archive_file.game_selection_lambda.output_base64sha256

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DB_CREDS_PATH                       = aws_secretsmanager_secret.database_credentials.name
      DB_HOST                            = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      NODE_ENV                           = var.environment
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.game_selection_lambda_basic,
    aws_iam_role_policy_attachment.game_selection_lambda_vpc,
    aws_iam_role_policy_attachment.game_selection_lambda_secrets,
    aws_iam_role_policy_attachment.game_selection_lambda_rds,
    aws_cloudwatch_log_group.game_selection_lambda
  ]

  tags = local.common_tags
}

# API Gateway Integration for Game Selection
resource "aws_api_gateway_resource" "game_selection" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "games"
}

# Catch-all resource for game selection paths
resource "aws_api_gateway_resource" "game_selection_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.game_selection.id
  path_part   = "{proxy+}"
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "game_selection_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.game_selection_paths.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "game_selection_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.game_selection_paths.id
  http_method = aws_api_gateway_method.game_selection_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_method_response" "game_selection_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.game_selection_paths.id
  http_method = aws_api_gateway_method.game_selection_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "game_selection_options" {
  depends_on = [aws_api_gateway_integration.game_selection_options]
  
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.game_selection_paths.id
  http_method = aws_api_gateway_method.game_selection_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ANY method for game selection
resource "aws_api_gateway_method" "game_selection_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.game_selection_paths.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "game_selection_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.game_selection_paths.id
  http_method             = aws_api_gateway_method.game_selection_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.game_selection.invoke_arn
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "game_selection_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.game_selection.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
