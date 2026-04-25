# GitHub Webhook Lambda Configuration
# Handles two webhook routes:
#
# POST /github-webhook     — pull_request_review_thread events from GitHub.
#   Updates the bot-review check run via the Review Bot app (ID: 3142924).
#   This closes the gap where cloud agents cannot dispatch the
#   copilot-auto-approve.yml workflow (no actions:write) after resolving
#   review threads. (LS-3033)
#
# POST /github-webhook/jira — issue_updated events from Jira Automation.
#   Fires a repository_dispatch (jira-issue-updated) to GitHub so that
#   jira-status-audit.yml runs immediately on manual Jira transitions
#   rather than waiting for the weekly backstop cron.
#   Auth: shared bearer token in X-Jira-Webhook-Secret header.

# ── Secrets Manager (externally managed values) ───────────────────────────────

resource "aws_secretsmanager_secret" "github_webhook_secret" {
  name_prefix = "${local.name_prefix}-github-webhook-secret-"
  description = "HMAC-SHA256 secret used to verify GitHub webhook signatures for the github-webhook Lambda"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "github_bot_app_private_key" {
  name_prefix = "${local.name_prefix}-github-bot-app-private-key-"
  description = "RSA PEM private key for the Review Bot GitHub App (ID: 3142924) — used by the github-webhook Lambda to generate installation tokens"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "jira_webhook_secret" {
  name_prefix = "${local.name_prefix}-jira-webhook-secret-"
  description = "Shared bearer token verified by the github-webhook Lambda for inbound Jira Automation webhooks (X-Jira-Webhook-Secret header). Configure the same value in Jira Automation's 'Send web request' action."

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "agent_author_app_private_key" {
  name_prefix = "${local.name_prefix}-agent-author-app-private-key-"
  description = "RSA PEM private key for the Agent Reviewer GitHub App (legacy-sports-review-bot, app ID stored in AGENT_AUTHOR_APP_ID env var). Used by the github-webhook Lambda to obtain short-lived installation tokens for repository_dispatch calls."

  tags = local.common_tags
}

# ── IAM role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "github_webhook_lambda" {
  name        = "${local.name_prefix}-github-webhook-lambda-role"
  description = "Execution role for the GitHub Webhook Lambda"

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

resource "aws_iam_role_policy_attachment" "github_webhook_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.github_webhook_lambda.name
}

resource "aws_iam_policy" "github_webhook_lambda_secrets" {
  name        = "${local.name_prefix}-github-webhook-lambda-secrets"
  description = "Allow the GitHub Webhook Lambda to read its secrets from Secrets Manager"

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
          aws_secretsmanager_secret.github_webhook_secret.arn,
          aws_secretsmanager_secret.github_bot_app_private_key.arn,
          aws_secretsmanager_secret.jira_webhook_secret.arn,
          aws_secretsmanager_secret.agent_author_app_private_key.arn,
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_webhook_lambda_secrets" {
  policy_arn = aws_iam_policy.github_webhook_lambda_secrets.arn
  role       = aws_iam_role.github_webhook_lambda.name
}

# ── Race-check SQS queue (LS-3838) ─────────────────────────────────────────────
# Delayed self-invocation queue used to close Copilot re-review race condition
# #2 (documented in `.agents/skills/pr-lifecycle/references/copilot-auto-approve-flow.md`).
#
# After each pull_request.synchronize, the Lambda requests a Copilot review and
# then enqueues a race-check message with DelaySeconds=90 here. SQS invokes the
# same Lambda 90 s later via the event source mapping below; the Lambda
# inspects current state and re-requests Copilot if the original request was
# silently dropped by GitHub.

resource "aws_sqs_queue" "github_webhook_race_check_dlq" {
  name = "${local.name_prefix}-github-webhook-race-check-dlq"

  message_retention_seconds = 1209600 # 14 days

  tags = local.common_tags
}

resource "aws_sqs_queue" "github_webhook_race_check" {
  name = "${local.name_prefix}-github-webhook-race-check"

  # Lambda timeout is 30 s; visibility must exceed that so SQS doesn't
  # re-deliver before the Lambda finishes. 60 s gives a comfortable margin.
  visibility_timeout_seconds = 60
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 10      # Long polling

  # Each message carries an attempt counter (1..3). Infrastructure-level retries
  # are a safety net for genuine Lambda failures; race-check re-enqueue is
  # handled by the handler itself (app-level retry) so maxReceiveCount=3 is fine.
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.github_webhook_race_check_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

resource "aws_iam_policy" "github_webhook_lambda_race_check_sqs" {
  name        = "${local.name_prefix}-github-webhook-lambda-race-check-sqs"
  description = "Allow the GitHub Webhook Lambda to send and consume race-check SQS messages"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ]
        Resource = aws_sqs_queue.github_webhook_race_check.arn
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_webhook_lambda_race_check_sqs" {
  policy_arn = aws_iam_policy.github_webhook_lambda_race_check_sqs.arn
  role       = aws_iam_role.github_webhook_lambda.name
}

# Queue-level policy — explicitly scopes who may poll the queue. Matches the
# pattern established in terraform/main/sqs.tf for every other Lambda-consumed
# queue in this project (load_season_stats, load_game_stats, select_game,
# automatic_drafts).
resource "aws_sqs_queue_policy" "github_webhook_race_check" {
  queue_url = aws_sqs_queue.github_webhook_race_check.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-github-webhook-race-check-policy"
    Statement = [
      {
        Sid    = "AllowLambdaServiceAccess"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ]
        Resource = aws_sqs_queue.github_webhook_race_check.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_lambda_function.github_webhook.arn
          }
        }
      },
      {
        Sid    = "AllowApplicationSendMessages"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = [
          "sqs:SendMessage"
        ]
        Resource = aws_sqs_queue.github_webhook_race_check.arn
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = data.aws_region.current.id
          }
        }
      }
    ]
  })
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "github_webhook_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-github-webhook"
  retention_in_days = local.log_retention_days[var.environment]

  tags       = local.common_tags
  depends_on = [aws_vpc_endpoint.logs]
}

# ── Lambda Function ───────────────────────────────────────────────────────────

resource "aws_ssm_parameter" "github_webhook_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/github-webhook/version"
  description = "Current version of the GitHub Webhook Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "github-webhook"
  })
}

# Stores the Terraform-assigned secret names (with random suffixes) so that CI
# and setup scripts can look them up via ssm:GetParameter instead of
# secretsmanager:ListSecrets (which is a *-resource action not in the policy).
resource "aws_ssm_parameter" "agent_author_app_private_key_secret_name" {
  name        = "/legacy-sports/${var.environment}/lambda/github-webhook/agent-author-app-private-key-secret-name"
  description = "Exact Secrets Manager secret name for the agent_author_app_private_key — read by lambda-terraform-apply to sync the Review Bot private key without needing secretsmanager:ListSecrets"
  type        = "String"
  value       = aws_secretsmanager_secret.agent_author_app_private_key.name

  tags = merge(local.common_tags, {
    Component = "github-webhook"
    Function  = "github-webhook"
  })
}

resource "aws_ssm_parameter" "github_webhook_secret_name" {
  name        = "/legacy-sports/${var.environment}/lambda/github-webhook/github-webhook-secret-name"
  description = "Exact Secrets Manager secret name for the github_webhook_secret — populate via: aws secretsmanager put-secret-value --secret-id <value> --secret-string <hex-secret>"
  type        = "String"
  value       = aws_secretsmanager_secret.github_webhook_secret.name

  tags = merge(local.common_tags, {
    Component = "github-webhook"
    Function  = "github-webhook"
  })
}

resource "aws_ssm_parameter" "jira_webhook_secret_name" {
  name        = "/legacy-sports/${var.environment}/lambda/github-webhook/jira-webhook-secret-name"
  description = "Exact Secrets Manager secret name for the jira_webhook_secret — read by setup-jira-webhook.sh without needing secretsmanager:ListSecrets"
  type        = "String"
  value       = aws_secretsmanager_secret.jira_webhook_secret.name

  tags = merge(local.common_tags, {
    Component = "github-webhook"
    Function  = "github-webhook"
  })
}

resource "aws_lambda_function" "github_webhook" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "github-webhook/github-webhook-${aws_ssm_parameter.github_webhook_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-github-webhook"
  role          = aws_iam_role.github_webhook_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 128

  source_code_hash = aws_ssm_parameter.github_webhook_lambda_version.value

  environment {
    variables = {
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "info"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
      WEBHOOK_SECRET_SECRET_NAME          = aws_secretsmanager_secret.github_webhook_secret.name
      BOT_APP_PRIVATE_KEY_SECRET_NAME     = aws_secretsmanager_secret.github_bot_app_private_key.name
      JIRA_WEBHOOK_SECRET_SECRET_NAME          = aws_secretsmanager_secret.jira_webhook_secret.name
      AGENT_AUTHOR_APP_PRIVATE_KEY_SECRET_NAME = aws_secretsmanager_secret.agent_author_app_private_key.name
      AGENT_AUTHOR_APP_ID                      = tostring(var.agent_author_app_id)
      GITHUB_REPO                              = "${var.github_username}/${var.project_name}"
      RACE_CHECK_QUEUE_URL                     = aws_sqs_queue.github_webhook_race_check.url
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.github_webhook_lambda_basic,
    aws_iam_role_policy_attachment.github_webhook_lambda_secrets,
    aws_iam_role_policy_attachment.github_webhook_lambda_race_check_sqs,
    aws_cloudwatch_log_group.github_webhook_lambda,
  ]

  tags = local.common_tags
}

# Event source mapping: race-check SQS → same Lambda (one-at-a-time processing).
resource "aws_lambda_event_source_mapping" "github_webhook_race_check_sqs" {
  event_source_arn = aws_sqs_queue.github_webhook_race_check.arn
  function_name    = aws_lambda_function.github_webhook.arn

  batch_size                         = 1
  maximum_batching_window_in_seconds = 0

  depends_on = [
    aws_lambda_function.github_webhook,
    aws_iam_role_policy_attachment.github_webhook_lambda_race_check_sqs,
  ]
}

# ── API Gateway Integration ───────────────────────────────────────────────────

resource "aws_api_gateway_resource" "github_webhook" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "github-webhook"
}

resource "aws_api_gateway_resource" "github_webhook_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.github_webhook.id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "github_webhook_root_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.github_webhook.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "github_webhook_root_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.github_webhook.id
  http_method             = aws_api_gateway_method.github_webhook_root_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.github_webhook.invoke_arn
}

resource "aws_api_gateway_method" "github_webhook_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.github_webhook_paths.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "github_webhook_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.github_webhook_paths.id
  http_method             = aws_api_gateway_method.github_webhook_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.github_webhook.invoke_arn
}

resource "aws_lambda_permission" "github_webhook_api_gateway_root" {
  statement_id  = "AllowExecutionFromAPIGatewayRoot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.github_webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/github-webhook"
}

resource "aws_lambda_permission" "github_webhook_api_gateway_paths" {
  statement_id  = "AllowExecutionFromAPIGatewayPaths"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.github_webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/github-webhook/*"
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "github_webhook_url" {
  description = "GitHub webhook endpoint URL — configure in GitHub App/repo webhook settings with pull_request_review_thread events"
  value       = "${local.api_base_url}/github-webhook"
}

output "jira_webhook_url" {
  description = "Jira webhook endpoint URL — configure in Jira Automation 'Send web request' action; set X-Jira-Webhook-Secret header to the secret value stored in Secrets Manager for jira_webhook_secret"
  value       = "${local.api_base_url}/github-webhook/jira"
}
