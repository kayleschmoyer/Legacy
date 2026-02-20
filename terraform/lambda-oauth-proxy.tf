# OAuth Proxy Lambda Configuration
resource "aws_iam_role" "oauth_proxy_lambda" {
  name        = "${local.name_prefix}-oauth-proxy-lambda-role"
  description = "Execution role for the OAuth Proxy Lambda function"

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

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.oauth_proxy_lambda.name
}

# OAuth Lambda now requires VPC access for private subnet deployment
resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.oauth_proxy_lambda.name
}

# OAuth Lambda secrets - OAuth + Database secrets for secure user management
resource "aws_iam_policy" "oauth_proxy_lambda_secrets" {
  name        = "${local.name_prefix}-oauth-proxy-lambda-secrets"
  description = "IAM policy for OAuth Lambda to access OAuth and database secrets securely"

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
          # OAuth secrets
          aws_secretsmanager_secret.google_oauth_client_secret.arn,
          aws_secretsmanager_secret.jwt_secret.arn,
          aws_secretsmanager_secret.oauth_proxy_cookie_secret.arn,
          # Database secrets for private user management
          aws_secretsmanager_secret.database_credentials.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_secrets" {
  policy_arn = aws_iam_policy.oauth_proxy_lambda_secrets.arn
  role       = aws_iam_role.oauth_proxy_lambda.name
}

# OAuth Lambda RDS access for secure user management operations
resource "aws_iam_policy" "oauth_proxy_lambda_rds" {
  name        = "${local.name_prefix}-oauth-proxy-lambda-rds-v2"
  description = "IAM policy for OAuth Lambda to access RDS for secure user management"

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

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_rds" {
  policy_arn = aws_iam_policy.oauth_proxy_lambda_rds.arn
  role       = aws_iam_role.oauth_proxy_lambda.name
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "oauth_proxy_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-oauth-proxy"
  retention_in_days = var.environment == "dev" ? 7 : 14

  tags = local.common_tags
}

# Data source to get the current OAuth Proxy Lambda version from SSM
data "aws_ssm_parameter" "oauth_proxy_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/oauth-proxy/version"
}

# Lambda Function
resource "aws_lambda_function" "oauth_proxy" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "oauth-proxy/oauth-proxy-${data.aws_ssm_parameter.oauth_proxy_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-oauth-proxy"
  role          = aws_iam_role.oauth_proxy_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = var.environment == "dev" ? 512 : 1024 # Increased for combined functionality

  source_code_hash = data.aws_ssm_parameter.oauth_proxy_lambda_version.value

  # OAuth Lambda in PRIVATE subnets with VPC endpoints for secure internet access
  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      # Google OAuth configuration
      CLIENT_ID                       = var.google_oauth_client_id
      GOOGLE_OAUTH_CLIENT_SECRET_PATH = aws_secretsmanager_secret.google_oauth_client_secret.name
      JWT_SECRET_KEY_PATH             = aws_secretsmanager_secret.jwt_secret.name
      COOKIE_SECRET_KEY_PATH          = aws_secretsmanager_secret.oauth_proxy_cookie_secret.name

      # Database configuration for direct user management (secure, private)
      DB_SECRET_NAME        = aws_secretsmanager_secret.database_credentials.name
      DB_HOST               = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      USE_LOCAL_CREDENTIALS = "false"

      # Runtime configuration
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "debug"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Sentry configuration
      SENTRY_DSN                = var.sentry_dsn
      SENTRY_TRACES_SAMPLE_RATE = "0.1"
      SENTRY_DEBUG              = "false"
      SENTRY_RELEASE            = "legacy-sports-oauth-proxy@${data.aws_ssm_parameter.oauth_proxy_lambda_version.value}"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.oauth_proxy_lambda_basic,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_vpc,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_secrets,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_rds,
    aws_cloudwatch_log_group.oauth_proxy_lambda
  ]

  tags = local.common_tags
}

# API Gateway Integration for OAuth Proxy
resource "aws_api_gateway_resource" "oauth_proxy" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "oauth"
}

# OPTIONS method for CORS on root oauth resource
resource "aws_api_gateway_method" "oauth_proxy_root_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_root_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy.id
  http_method = aws_api_gateway_method.oauth_proxy_root_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_method_response" "oauth_proxy_root_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy.id
  http_method = aws_api_gateway_method.oauth_proxy_root_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "oauth_proxy_root_options" {
  depends_on = [aws_api_gateway_integration.oauth_proxy_root_options]

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy.id
  http_method = aws_api_gateway_method.oauth_proxy_root_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ANY method for root oauth resource
resource "aws_api_gateway_method" "oauth_proxy_root_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_root_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.oauth_proxy.id
  http_method             = aws_api_gateway_method.oauth_proxy_root_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.oauth_proxy.invoke_arn
}

# Catch-all resource for OAuth proxy paths
resource "aws_api_gateway_resource" "oauth_proxy_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.oauth_proxy.id
  path_part   = "{proxy+}"
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "oauth_proxy_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method = aws_api_gateway_method.oauth_proxy_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_method_response" "oauth_proxy_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method = aws_api_gateway_method.oauth_proxy_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "oauth_proxy_options" {
  depends_on = [aws_api_gateway_integration.oauth_proxy_options]

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method = aws_api_gateway_method.oauth_proxy_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ANY method for OAuth proxy
resource "aws_api_gateway_method" "oauth_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method             = aws_api_gateway_method.oauth_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.oauth_proxy.invoke_arn
}

# Lambda permission for API Gateway (root oauth path)
resource "aws_lambda_permission" "oauth_proxy_api_gateway_root" {
  statement_id  = "AllowExecutionFromAPIGatewayRoot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.oauth_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/oauth"
}

# Lambda permission for API Gateway (proxy paths)
resource "aws_lambda_permission" "oauth_proxy_api_gateway_paths" {
  statement_id  = "AllowExecutionFromAPIGatewayPaths"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.oauth_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/oauth/*"
}
