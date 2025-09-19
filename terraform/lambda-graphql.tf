# Data source to get the current GraphQL Lambda version from SSM
data "aws_ssm_parameter" "graphql_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/graphql/version"
}

# IAM role for the GraphQL Lambda
resource "aws_iam_role" "graphql_lambda" {
  name = "${local.name_prefix}-graphql-lambda-role"

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
        Resource = [
          aws_secretsmanager_secret.database_credentials.arn,
          aws_secretsmanager_secret.jwt_secret.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetRandomPassword",
          "secretsmanager:ListSecrets"
        ]
        Resource = "*"
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
          "arn:aws:rds-db:${local.region}:${local.account_id}:dbuser:${var.enable_rds_proxy ? aws_db_proxy.main[0].id : aws_db_instance.postgres.identifier}/*"
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

# Lambda function
resource "aws_lambda_function" "graphql" {
  s3_bucket         = aws_s3_bucket.lambda_deployments.bucket
  s3_key           = "db/db-${data.aws_ssm_parameter.graphql_lambda_version.value}.zip"
  function_name    = "${local.name_prefix}-graphql"
  role            = aws_iam_role.graphql_lambda.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 30
  memory_size     = 1024

  source_code_hash = data.aws_ssm_parameter.graphql_lambda_version.value

  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DB_CREDS_PATH = aws_secretsmanager_secret.database_credentials.name
      DB_HOST       = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      NODE_ENV      = var.environment
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.graphql_lambda_basic,
    aws_iam_role_policy_attachment.graphql_lambda_vpc,
    aws_iam_role_policy_attachment.graphql_lambda_secrets,
    aws_iam_role_policy_attachment.graphql_lambda_rds,
  ]

  tags = local.common_tags
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "graphql_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.graphql.function_name}"
  retention_in_days = 14

  tags = local.common_tags
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "graphql_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
