# Draft Processor Lambda
# Processes draft messages from the automatic_drafts SQS queue

# SSM parameter for draft processor lambda version
resource "aws_ssm_parameter" "draft_processor_lambda_version" {
  name  = "/legacy-sports/${var.environment}/lambda/draft-processor/version"
  type  = "String"
  value = "initial"

  tags = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

# Data source to get current version from SSM
data "aws_ssm_parameter" "draft_processor_lambda_version" {
  name = aws_ssm_parameter.draft_processor_lambda_version.name
}

# IAM role for draft processor lambda
resource "aws_iam_role" "draft_processor_lambda" {
  name        = "${local.name_prefix}-draft-processor-lambda-role"
  description = "Execution role for the Draft Processor Lambda function"

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
resource "aws_iam_role_policy_attachment" "draft_processor_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.draft_processor_lambda.name
}

# VPC execution policy
resource "aws_iam_role_policy_attachment" "draft_processor_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.draft_processor_lambda.name
}

# Secrets manager policy for database credentials
resource "aws_iam_policy" "draft_processor_lambda_secrets" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-draft-processor-lambda-secrets-"
  description = "Allow draft processor lambda to read secrets"

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
          aws_secretsmanager_secret.rollbar_access_token.arn,
        ]
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "draft_processor_lambda_secrets" {
  policy_arn = aws_iam_policy.draft_processor_lambda_secrets.arn
  role       = aws_iam_role.draft_processor_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# RDS connection policy
resource "aws_iam_policy" "draft_processor_lambda_rds" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-draft-processor-lambda-rds-"
  description = "Allow draft processor lambda to connect to RDS"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = "arn:aws:rds-db:${local.region}:${data.aws_caller_identity.current.account_id}:dbuser:${aws_db_instance.postgres.id}/${var.database_username}"
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "draft_processor_lambda_rds" {
  policy_arn = aws_iam_policy.draft_processor_lambda_rds.arn
  role       = aws_iam_role.draft_processor_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# SQS permission policy for receiving messages from automatic_drafts queue
resource "aws_iam_policy" "draft_processor_lambda_sqs" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-draft-processor-lambda-sqs-"
  description = "Allow draft processor lambda to receive SQS messages"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.automatic_drafts.arn
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "draft_processor_lambda_sqs" {
  policy_arn = aws_iam_policy.draft_processor_lambda_sqs.arn
  role       = aws_iam_role.draft_processor_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# WebSocket/DynamoDB permissions for notifications
resource "aws_iam_policy" "draft_processor_lambda_websocket" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-draft-processor-lambda-websocket-"
  description = "Allow draft processor lambda to send WebSocket notifications"

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

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "draft_processor_lambda_websocket" {
  policy_arn = aws_iam_policy.draft_processor_lambda_websocket.arn
  role       = aws_iam_role.draft_processor_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# Permission to publish draft_completed push notification events onto the
# notifications queue (lib/aws-utils NotificationPublisher). LS-6838.
resource "aws_iam_policy" "draft_processor_lambda_notifications_sqs" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-draft-processor-lambda-notifications-sqs-"
  description = "Allow draft processor lambda to publish to the notifications queue"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.notifications_queue.arn
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "draft_processor_lambda_notifications_sqs" {
  policy_arn = aws_iam_policy.draft_processor_lambda_notifications_sqs.arn
  role       = aws_iam_role.draft_processor_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# Draft processor Lambda function
resource "aws_lambda_function" "draft_processor" {
  function_name = "${local.name_prefix}-draft-processor"
  role          = aws_iam_role.draft_processor_lambda.arn

  # S3-based deployment
  s3_bucket = aws_s3_bucket.lambda_deployments.bucket
  s3_key    = "draft-processor/draft-processor-${data.aws_ssm_parameter.draft_processor_lambda_version.value}.zip"
  # Deployed version marker read by the drift-check auditor (LS-8434)
  description = data.aws_ssm_parameter.draft_processor_lambda_version.value

  handler     = "index.handler"
  runtime     = "nodejs22.x"
  timeout     = 300
  memory_size = var.environment == "dev" ? 512 : 1024

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
      # DB_CERT_PATH intentionally omitted: the Lambda layer that mounted
      # /opt/certs/us-east-1-bundle.pem was removed. Modern RDS instances
      # (rds-ca-rsa2048-g1 or later) use Amazon Root CA certs trusted by
      # Node.js built-in CAs, so no explicit cert path is needed. See LS-3166.

      # Legacy support - keep DB_CREDS_PATH as fallback
      DB_CREDS_PATH = aws_secretsmanager_secret.database_credentials.name

      # Runtime configuration
      NODE_ENV                            = var.environment
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # WebSocket configuration for notifications
      CONNECTIONS_TABLE_NAME = aws_dynamodb_table.websocket_connections.name
      WEBSOCKET_ENDPOINT     = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${data.aws_region.current.id}.amazonaws.com/${var.environment}"

      # Rollbar error tracking (token fetched from Secrets Manager at cold-start)
      ROLLBAR_ACCESS_TOKEN_SECRET_NAME = aws_secretsmanager_secret.rollbar_access_token.name

      # Notifications queue — publishes draft_completed push notification events
      # (lib/aws-utils NotificationPublisher). LS-6838.
      NOTIFICATION_QUEUE_URL = aws_sqs_queue.notifications_queue.url
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.draft_processor_lambda_basic,
    aws_iam_role_policy_attachment.draft_processor_lambda_vpc,
    aws_iam_role_policy_attachment.draft_processor_lambda_secrets,
    aws_iam_role_policy_attachment.draft_processor_lambda_rds,
    aws_iam_role_policy_attachment.draft_processor_lambda_sqs,
    aws_iam_role_policy_attachment.draft_processor_lambda_notifications_sqs,
  ]

  tags = local.common_tags
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "draft_processor_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.draft_processor.function_name}"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# SQS Event Source Mapping - connects the SQS queue to the Lambda function
resource "aws_lambda_event_source_mapping" "draft_processor_sqs" {
  event_source_arn = aws_sqs_queue.automatic_drafts.arn
  function_name    = aws_lambda_function.draft_processor.arn

  # Batch configuration
  batch_size                         = 1 # Process one draft at a time
  maximum_batching_window_in_seconds = 0 # No batching delay

  # Error handling
  bisect_batch_on_function_error = false

  depends_on = [
    aws_lambda_function.draft_processor,
    aws_sqs_queue.automatic_drafts
  ]
}
