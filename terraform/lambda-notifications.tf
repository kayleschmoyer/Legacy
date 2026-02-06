# Notifications Lambda
# Processes matchup notification events from EventBridge

# SSM parameter for notifications lambda version
resource "aws_ssm_parameter" "notifications_lambda_version" {
  name  = "/legacy-sports/${var.environment}/lambda/notifications/version"
  type  = "String"
  value = "initial"

  tags = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

# Data source to get current version from SSM
data "aws_ssm_parameter" "notifications_lambda_version" {
  name = aws_ssm_parameter.notifications_lambda_version.name
}

# IAM role for notifications lambda
resource "aws_iam_role" "notifications_lambda" {
  name = "${local.name_prefix}-notifications-lambda-role"

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

# Basic execution policy
resource "aws_iam_role_policy_attachment" "notifications_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.notifications_lambda.name
}

# VPC execution policy
resource "aws_iam_role_policy_attachment" "notifications_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.notifications_lambda.name
}

# Secrets manager policy for database credentials
resource "aws_iam_policy" "notifications_lambda_secrets" {
  name        = "${local.name_prefix}-notifications-lambda-secrets"
  description = "Allow notifications lambda to read secrets"

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
          aws_secretsmanager_secret.database_credentials.arn,
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "notifications_lambda_secrets" {
  policy_arn = aws_iam_policy.notifications_lambda_secrets.arn
  role       = aws_iam_role.notifications_lambda.name
}

# RDS connection policy
resource "aws_iam_policy" "notifications_lambda_rds" {
  name        = "${local.name_prefix}-notifications-lambda-rds"
  description = "Allow notifications lambda to connect to RDS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = "arn:aws:rds-db:${local.region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.postgres.id}/*"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "notifications_lambda_rds" {
  policy_arn = aws_iam_policy.notifications_lambda_rds.arn
  role       = aws_iam_role.notifications_lambda.name
}

# Notifications Lambda function
resource "aws_lambda_function" "notifications" {
  function_name = "${local.name_prefix}-notifications"
  role          = aws_iam_role.notifications_lambda.arn

  # S3-based deployment
  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = "notifications/notifications-${data.aws_ssm_parameter.notifications_lambda_version.value}.zip"

  handler     = "index.handler"
  runtime     = "nodejs20.x"
  timeout     = 60
  memory_size = var.environment == "dev" ? 256 : 512

  # VPC configuration for database access
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
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Sentry configuration
      SENTRY_DSN                = var.sentry_dsn
      SENTRY_TRACES_SAMPLE_RATE = "0.1"
      SENTRY_DEBUG              = "false"
      SENTRY_RELEASE            = "legacy-sports-notifications@${data.aws_ssm_parameter.notifications_lambda_version.value}"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.notifications_lambda_basic,
    aws_iam_role_policy_attachment.notifications_lambda_vpc,
    aws_iam_role_policy_attachment.notifications_lambda_secrets,
    aws_iam_role_policy_attachment.notifications_lambda_rds,
  ]

  tags = local.common_tags
}

# CloudWatch log group for notifications lambda
resource "aws_cloudwatch_log_group" "notifications_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.notifications.function_name}"
  retention_in_days = var.environment == "dev" ? 7 : 30

  tags = local.common_tags
}

# EventBridge permission for notifications lambda
resource "aws_lambda_permission" "notifications_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notifications.function_name
  principal     = "events.amazonaws.com"
}
