# Jira Proxy Lambda Configuration
# This Lambda proxies bug report requests to the Jira API,
# keeping Jira credentials server-side in Secrets Manager.

# IAM role for the Jira Proxy Lambda
resource "aws_iam_role" "jira_proxy_lambda" {
  name        = "${local.name_prefix}-jira-proxy-lambda-role"
  description = "Execution role for the Jira Proxy Lambda function"

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

resource "aws_iam_role_policy_attachment" "jira_proxy_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.jira_proxy_lambda.name
}

# Policy granting access to the Jira credentials secret
resource "aws_iam_policy" "jira_proxy_lambda_secrets" {
  name        = "${local.name_prefix}-jira-proxy-lambda-secrets"
  description = "IAM policy for Jira Proxy Lambda to access Jira credentials in Secrets Manager"

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
          aws_secretsmanager_secret.jira_credentials.arn,
          aws_secretsmanager_secret.jwt_secret.arn
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "jira_proxy_lambda_secrets" {
  policy_arn = aws_iam_policy.jira_proxy_lambda_secrets.arn
  role       = aws_iam_role.jira_proxy_lambda.name
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "jira_proxy_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-jira-proxy"
  retention_in_days = var.environment == "dev" ? 7 : 14

  tags = local.common_tags
}

# Data source to get the current Jira Proxy Lambda version from SSM
data "aws_ssm_parameter" "jira_proxy_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/jira-proxy/version"
}

# Lambda Function (no VPC — only calls external Jira API)
resource "aws_lambda_function" "jira_proxy" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "jira-proxy/jira-proxy-${data.aws_ssm_parameter.jira_proxy_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-jira-proxy"
  role          = aws_iam_role.jira_proxy_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  memory_size   = 256

  source_code_hash = data.aws_ssm_parameter.jira_proxy_lambda_version.value

  environment {
    variables = {
      JIRA_SECRET_NAME              = aws_secretsmanager_secret.jira_credentials.name
      JIRA_PROJECT_KEY               = "LS"
      BUG_EPIC_KEY                   = "LS-1322"
      JWT_SECRET_NAME                = aws_secretsmanager_secret.jwt_secret.name
      NODE_ENV                       = var.environment
      LOG_LEVEL                      = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Rollbar error tracking
      ROLLBAR_ACCESS_TOKEN = var.rollbar_access_token
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.jira_proxy_lambda_basic,
    aws_iam_role_policy_attachment.jira_proxy_lambda_secrets,
    aws_cloudwatch_log_group.jira_proxy_lambda
  ]

  tags = local.common_tags
}

# API Gateway Integration for Jira Proxy
resource "aws_api_gateway_resource" "jira_proxy" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "jira"
}

# Catch-all sub-paths under /jira
resource "aws_api_gateway_resource" "jira_proxy_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.jira_proxy.id
  path_part   = "{proxy+}"
}

# OPTIONS method for CORS on root /jira resource
resource "aws_api_gateway_method" "jira_proxy_root_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.jira_proxy.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "jira_proxy_root_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.jira_proxy.id
  http_method = aws_api_gateway_method.jira_proxy_root_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "jira_proxy_root_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.jira_proxy.id
  http_method = aws_api_gateway_method.jira_proxy_root_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "jira_proxy_root_options" {
  depends_on = [aws_api_gateway_integration.jira_proxy_root_options]

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.jira_proxy.id
  http_method = aws_api_gateway_method.jira_proxy_root_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ANY method on root /jira resource
resource "aws_api_gateway_method" "jira_proxy_root_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.jira_proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "jira_proxy_root_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.jira_proxy.id
  http_method             = aws_api_gateway_method.jira_proxy_root_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.jira_proxy.invoke_arn
}

# OPTIONS method for CORS on /jira/{proxy+}
resource "aws_api_gateway_method" "jira_proxy_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.jira_proxy_paths.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "jira_proxy_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.jira_proxy_paths.id
  http_method = aws_api_gateway_method.jira_proxy_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({ statusCode = 200 })
  }
}

resource "aws_api_gateway_method_response" "jira_proxy_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.jira_proxy_paths.id
  http_method = aws_api_gateway_method.jira_proxy_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "jira_proxy_options" {
  depends_on = [aws_api_gateway_integration.jira_proxy_options]

  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.jira_proxy_paths.id
  http_method = aws_api_gateway_method.jira_proxy_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ANY method for /jira/{proxy+}
resource "aws_api_gateway_method" "jira_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.jira_proxy_paths.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "jira_proxy_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.jira_proxy_paths.id
  http_method             = aws_api_gateway_method.jira_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.jira_proxy.invoke_arn
}

# Lambda permission for API Gateway (root /jira path)
resource "aws_lambda_permission" "jira_proxy_api_gateway_root" {
  statement_id  = "AllowExecutionFromAPIGatewayRoot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.jira_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/jira"
}

# Lambda permission for API Gateway (sub-paths)
resource "aws_lambda_permission" "jira_proxy_api_gateway_paths" {
  statement_id  = "AllowExecutionFromAPIGatewayPaths"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.jira_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/jira/*"
}
