# MCP Rollbar Server Lambda
# Hosts tools/mcp/rollbar-server as an HTTP API Lambda for tunnel-free access
# to the Rollbar read API (LS-8142, mirroring the LS-8116/8117/8119 db-admin
# pattern). All callers reach it via the HTTP API Gateway
# (lambda-mcp-api-gateway.tf) with a Cognito-issued bearer carrying the
# `mcp/rollbar` scope.
#
# This Lambda runs OUTSIDE the VPC (unlike mcp_db) — it only needs to reach
# Secrets Manager and api.rollbar.com over the public internet.

# ── IAM role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "mcp_rollbar_lambda" {
  name        = "${local.name_prefix}-mcp-rollbar-lambda-role"
  description = "Execution role for the MCP Rollbar server Lambda"

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

resource "aws_iam_role_policy_attachment" "mcp_rollbar_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.mcp_rollbar_lambda.name
}

resource "aws_iam_policy" "mcp_rollbar_lambda_secrets" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-mcp-rollbar-lambda-secrets-"
  description = "Allows the MCP Rollbar Lambda to read the Rollbar read-scope access token from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          aws_secretsmanager_secret.rollbar_read_access_token.arn,
        ]
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "mcp_rollbar_lambda_secrets" {
  policy_arn = aws_iam_policy.mcp_rollbar_lambda_secrets.arn
  role       = aws_iam_role.mcp_rollbar_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "mcp_rollbar_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-mcp-rollbar"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# ── Lambda function ───────────────────────────────────────────────────────────

data "aws_ssm_parameter" "mcp_rollbar_lambda_version" {
  name       = "/legacy-sports/${var.environment}/lambda/mcp-rollbar/version"
  depends_on = [aws_ssm_parameter.mcp_rollbar_lambda_version]
}

resource "aws_lambda_function" "mcp_rollbar" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "mcp-rollbar/mcp-rollbar-${data.aws_ssm_parameter.mcp_rollbar_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-mcp-rollbar"
  role          = aws_iam_role.mcp_rollbar_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = var.lambda_timeout
  memory_size   = 256

  source_code_hash = data.aws_ssm_parameter.mcp_rollbar_lambda_version.value
  # Deployed version marker read by the drift-check auditor (LS-8434) — this
  # Lambda's missing description was why LS-8426's 12-day staleness went undetected.
  description = data.aws_ssm_parameter.mcp_rollbar_lambda_version.value

  environment {
    variables = {
      ROLLBAR_READ_TOKEN_SECRET_NAME = aws_secretsmanager_secret.rollbar_read_access_token.name

      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      MCP_COGNITO_ISSUER   = local.mcp_cognito_issuer
      MCP_COGNITO_AUDIENCE = aws_cognito_user_pool_client.mcp_cli.id
      # Scopes advertised in this server's OAuth Protected Resource Metadata
      # (RFC 9728) — the claude.ai connector requests these during consent so
      # the issued access token carries `mcp/rollbar` and passes the bearer-auth
      # scope check (mirrors lambda-mcp-jira.tf).
      MCP_OAUTH_SCOPES = "openid mcp/rollbar"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.mcp_rollbar_lambda_basic,
    aws_iam_role_policy_attachment.mcp_rollbar_lambda_secrets,
    aws_cloudwatch_log_group.mcp_rollbar_lambda,
  ]

  tags = local.common_tags
}
