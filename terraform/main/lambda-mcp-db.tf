# MCP DB Server Lambda
# Hosts the tools/mcp/db-admin-server as an HTTP API Lambda for tunnel-free,
# read-only database access (LS-8114). Like the other hosted MCP servers it is
# reached via the HTTP API Gateway (lambda-mcp-api-gateway.tf) with a
# Cognito-issued bearer carrying the `mcp/db` scope.
#
# Unlike the Jira/GitHub/CI MCP Lambdas, this one runs *inside the VPC* (mirrors
# lambda-graphql.tf) so it can reach the private RDS instance directly. It
# authenticates to Postgres with the broad read-only `mcp_readonly` role via
# password auth — credentials come from Secrets Manager
# (mcp_readonly_db_credentials, LS-8115), so there is intentionally NO
# rds-db:connect IAM permission here (that is IAM-auth only, which graphql uses).

# ── IAM role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "mcp_db_lambda" {
  name        = "${local.name_prefix}-mcp-db-lambda-role"
  description = "Execution role for the MCP DB server Lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "mcp_db_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.mcp_db_lambda.name
}

# VPC access — required because the Lambda runs in private subnets to reach RDS
# (creates/manages the ENIs). Mirrors lambda-graphql.tf.
resource "aws_iam_role_policy_attachment" "mcp_db_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.mcp_db_lambda.name
}

resource "aws_iam_policy" "mcp_db_lambda_secrets" {
  name        = "${local.name_prefix}-mcp-db-lambda-secrets"
  description = "Allows the MCP DB Lambda to read DB credentials, the mcp_readonly role secret, and the Rollbar token from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          aws_secretsmanager_secret.database_credentials.arn,
          aws_secretsmanager_secret.mcp_readonly_db_credentials.arn,
          aws_secretsmanager_secret.rollbar_access_token.arn,
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "mcp_db_lambda_secrets" {
  policy_arn = aws_iam_policy.mcp_db_lambda_secrets.arn
  role       = aws_iam_role.mcp_db_lambda.name
}

# Self-invoke permission for the async db_migrate worker (LS-8563): the submit
# path fires an InvocationType=Event invoke of this same function carrying only
# { dbMigrateJobId }; the worker branch applies the migration batch with the
# full function timeout. The ARN is constructed (not referenced from
# aws_lambda_function.mcp_db) so this policy has no dependency on the function
# resource.
resource "aws_iam_policy" "mcp_db_lambda_self_invoke" {
  name        = "${local.name_prefix}-mcp-db-lambda-self-invoke"
  description = "Allows the MCP DB Lambda to async-invoke itself to run the db_migrate worker"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = ["arn:aws:lambda:${local.region}:${local.account_id}:function:${local.name_prefix}-mcp-db"]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "mcp_db_lambda_self_invoke" {
  policy_arn = aws_iam_policy.mcp_db_lambda_self_invoke.arn
  role       = aws_iam_role.mcp_db_lambda.name
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "mcp_db_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-mcp-db"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# ── Lambda function ───────────────────────────────────────────────────────────

data "aws_ssm_parameter" "mcp_db_lambda_version" {
  name       = "/legacy-sports/${var.environment}/lambda/mcp-db/version"
  depends_on = [aws_ssm_parameter.mcp_db_lambda_version]
}

resource "aws_lambda_function" "mcp_db" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "mcp-db/mcp-db-${data.aws_ssm_parameter.mcp_db_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-mcp-db"
  role          = aws_iam_role.mcp_db_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  # Dedicated ~15-min timeout for the async db_migrate worker branch (LS-8563).
  # The HTTP path is unaffected: API Gateway cuts sync callers at ~29s.
  timeout     = var.lambda_mcp_db_timeout
  memory_size = 256

  source_code_hash = data.aws_ssm_parameter.mcp_db_lambda_version.value
  # Deployed version marker read by the drift-check auditor (LS-8434)
  description = data.aws_ssm_parameter.mcp_db_lambda_version.value

  # Runs inside the VPC so it can reach the private RDS instance directly.
  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      # Connect straight to the RDS instance (not the proxy) using password auth
      # with the read-only mcp_readonly role. DB_SECRET_NAME holds the primary
      # app DB credentials; MCP_READONLY_SECRET_NAME holds the read-only role.
      DB_HOST                  = aws_db_instance.postgres.endpoint
      DB_SECRET_NAME           = aws_secretsmanager_secret.database_credentials.name
      MCP_READONLY_SECRET_NAME = aws_secretsmanager_secret.mcp_readonly_db_credentials.name

      # Worker DDL statement_timeout: just below the function timeout so
      # runaway DDL fails cleanly inside the worker's lifetime (LS-8563).
      DB_MIGRATION_STATEMENT_TIMEOUT_MS = tostring((var.lambda_mcp_db_timeout - 60) * 1000)

      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      ROLLBAR_ACCESS_TOKEN_SECRET_NAME    = aws_secretsmanager_secret.rollbar_access_token.name

      MCP_COGNITO_ISSUER   = local.mcp_cognito_issuer
      MCP_COGNITO_AUDIENCE = aws_cognito_user_pool_client.mcp_cli.id
      # Scopes advertised in this server's OAuth Protected Resource Metadata
      # (RFC 9728) — the claude.ai connector requests these during consent so
      # the issued access token carries `mcp/db` and passes the bearer-auth
      # scope check (mirrors lambda-mcp-jira.tf).
      MCP_OAUTH_SCOPES = "openid mcp/db"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.mcp_db_lambda_basic,
    aws_iam_role_policy_attachment.mcp_db_lambda_vpc,
    aws_iam_role_policy_attachment.mcp_db_lambda_secrets,
    aws_iam_role_policy_attachment.mcp_db_lambda_self_invoke,
    aws_cloudwatch_log_group.mcp_db_lambda,
  ]

  tags = local.common_tags
}
