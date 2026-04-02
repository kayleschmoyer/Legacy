# =============================================================================
# Image Upload Lambda
# Accepts raw image uploads, runs NSFW classification via Cloudflare AI,
# and stores accepted images in the team logos S3 bucket.
# =============================================================================

# IAM execution role
resource "aws_iam_role" "image_upload_lambda" {
  name        = "${local.name_prefix}-image-upload-lambda-role"
  description = "Execution role for the Image Upload Lambda"

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

resource "aws_iam_role_policy_attachment" "image_upload_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.image_upload_lambda.name
}

resource "aws_iam_role_policy_attachment" "image_upload_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.image_upload_lambda.name
}

# Allow Lambda to write images to the team logos bucket
resource "aws_iam_policy" "image_upload_lambda_s3" {
  name        = "${local.name_prefix}-image-upload-lambda-s3"
  description = "Allow image-upload Lambda to write team logo images to S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.team_logos.arn}/*"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "image_upload_lambda_s3" {
  policy_arn = aws_iam_policy.image_upload_lambda_s3.arn
  role       = aws_iam_role.image_upload_lambda.name
}

# Allow Lambda to read the JWT secret from Secrets Manager
resource "aws_iam_policy" "image_upload_lambda_secrets" {
  name        = "${local.name_prefix}-image-upload-lambda-secrets"
  description = "Allow image-upload Lambda to read the JWT secret from Secrets Manager"

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
          aws_secretsmanager_secret.jwt_secret.arn,
          aws_secretsmanager_secret.cloudflare_ai_api_token.arn,
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "image_upload_lambda_secrets" {
  policy_arn = aws_iam_policy.image_upload_lambda_secrets.arn
  role       = aws_iam_role.image_upload_lambda.name
}

# Cloudflare AI API token — stored in Secrets Manager
resource "aws_secretsmanager_secret" "cloudflare_ai_api_token" {
  name                    = "${local.name_prefix}-cloudflare-ai-api-token"
  description             = "Cloudflare Workers AI API token for image NSFW classification"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "cloudflare_ai_api_token" {
  secret_id     = aws_secretsmanager_secret.cloudflare_ai_api_token.id
  secret_string = var.cloudflare_ai_api_token
}

# One-time import: this block migrates an existing log group into Terraform state.
# The log group was auto-created by AWS when the Lambda was first invoked; without
# this import Terraform would fail with ResourceAlreadyExistsException on apply.
# Remove this import block after the initial `terraform apply` succeeds so that
# new environments can create the log group normally via the resource block below.
import {
  to = aws_cloudwatch_log_group.image_upload_lambda
  id = "/aws/lambda/${local.name_prefix}-image-upload"
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "image_upload_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-image-upload"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# Lambda Function
resource "aws_lambda_function" "image_upload" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "image-upload/image-upload-${aws_ssm_parameter.image_upload_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-image-upload"
  role          = aws_iam_role.image_upload_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 512

  source_code_hash = aws_ssm_parameter.image_upload_lambda_version.value

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      NODE_ENV             = var.environment
      LOG_LEVEL            = "info"
      CORS_ALLOWED_ORIGINS = "https://${var.domain_name},https://www.${var.domain_name}"

      # JWT validation — reads from Secrets Manager at startup
      JWT_SECRET_NAME = aws_secretsmanager_secret.jwt_secret.name

      # Cloudflare Workers AI
      CLOUDFLARE_ACCOUNT_ID    = var.cloudflare_account_id
      CLOUDFLARE_AI_TOKEN_PATH = aws_secretsmanager_secret.cloudflare_ai_api_token.name

      # S3 storage for logo images
      LOGOS_BUCKET_NAME = aws_s3_bucket.team_logos.bucket
      AWS_REGION        = var.aws_region

      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.image_upload_lambda_basic,
    aws_iam_role_policy_attachment.image_upload_lambda_vpc,
    aws_iam_role_policy_attachment.image_upload_lambda_s3,
    aws_iam_role_policy_attachment.image_upload_lambda_secrets,
    aws_cloudwatch_log_group.image_upload_lambda,
  ]

  tags = local.common_tags
}

# ── API Gateway Integration ──────────────────────────────────────────────────

resource "aws_api_gateway_resource" "image_upload" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "images"
}

resource "aws_api_gateway_resource" "image_upload_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.image_upload.id
  path_part   = "{proxy+}"
}

# OPTIONS (CORS preflight) on /images
resource "aws_api_gateway_method" "image_upload_root_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.image_upload.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "image_upload_root_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.image_upload.id
  http_method             = aws_api_gateway_method.image_upload_root_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.image_upload.invoke_arn
}

# POST /images (root)
resource "aws_api_gateway_method" "image_upload_root_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.image_upload.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "image_upload_root_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.image_upload.id
  http_method             = aws_api_gateway_method.image_upload_root_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.image_upload.invoke_arn

  content_handling = "CONVERT_TO_BINARY"
}

# OPTIONS (CORS preflight) on /images/{proxy+}
resource "aws_api_gateway_method" "image_upload_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.image_upload_paths.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "image_upload_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.image_upload_paths.id
  http_method             = aws_api_gateway_method.image_upload_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.image_upload.invoke_arn
}

# GET /images/{proxy+} — used for health-check endpoints (/images/health, /images/upload/health)
resource "aws_api_gateway_method" "image_upload_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.image_upload_paths.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "image_upload_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.image_upload_paths.id
  http_method             = aws_api_gateway_method.image_upload_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.image_upload.invoke_arn
}

# POST /images/{proxy+}
resource "aws_api_gateway_method" "image_upload_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.image_upload_paths.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "image_upload_post" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.image_upload_paths.id
  http_method             = aws_api_gateway_method.image_upload_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.image_upload.invoke_arn

  content_handling = "CONVERT_TO_BINARY"
}

# Lambda invoke permissions for API Gateway
resource "aws_lambda_permission" "image_upload_api_root" {
  statement_id  = "AllowAPIGatewayInvokeRoot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.image_upload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/images"
}

resource "aws_lambda_permission" "image_upload_api_paths" {
  statement_id  = "AllowAPIGatewayInvokePaths"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.image_upload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/images/*"
}
