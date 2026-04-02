# CloudWatch Monitoring — DLQ Alarms & Lambda Error Alarms
# DLQ alarms fire immediately when messages land in any dead-letter queue.
# Lambda error alarms fire when a function's error count exceeds the configured
# threshold within a rolling window, providing real-time visibility via Discord.

# ─── SNS topic ────────────────────────────────────────────────────────────────

resource "aws_sns_topic" "ops_alerts" {
  name = "${local.name_prefix}-ops-alerts"
  tags = local.common_tags
}

# Optional e-mail subscription — leave alert_email empty to skip.
resource "aws_sns_topic_subscription" "ops_alerts_email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ─── load-game-stats-dlq.fifo alarm ───────────────────────────────────────────
# This queue receives messages that exhausted maxReceiveCount on the main queue.
# Any message here means stats loading silently stalled for a matchup — alert immediately.

resource "aws_cloudwatch_metric_alarm" "load_game_stats_dlq_not_empty" {
  alarm_name          = "${local.name_prefix}-load-game-stats-dlq-not-empty"
  alarm_description   = "Messages landed in load-game-stats-dlq.fifo — stats loading stalled for one or more matchups. Redrive the DLQ to recover."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  period              = 60 # 1-minute granularity for fast detection

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesNotVisible"
  dimensions = {
    QueueName = aws_sqs_queue.load_game_stats_dlq.name
  }

  # Also alarm on visible messages — covers the window before they are received.
  # We use a math expression to sum both visible + in-flight.
  # CloudWatch math requires a single metric_query block set.

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# A companion alarm on visible messages to catch messages waiting to be received.
resource "aws_cloudwatch_metric_alarm" "load_game_stats_dlq_visible" {
  alarm_name          = "${local.name_prefix}-load-game-stats-dlq-visible"
  alarm_description   = "Visible messages in load-game-stats-dlq.fifo — stats batches expired into the DLQ."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  period              = 60

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  dimensions = {
    QueueName = aws_sqs_queue.load_game_stats_dlq.name
  }

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# ─── load-season-stats-dlq.fifo alarm ─────────────────────────────────────────
# The season-stats queue shares the same Lambda (concurrency=1), so it can face
# the same thundering-herd problem.  Alert on it too.

resource "aws_cloudwatch_metric_alarm" "load_season_stats_dlq_visible" {
  alarm_name          = "${local.name_prefix}-load-season-stats-dlq-visible"
  alarm_description   = "Visible messages in load-season-stats-dlq.fifo — season-stats batches expired into the DLQ."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  period              = 60

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  dimensions = {
    QueueName = aws_sqs_queue.load_season_stats_dlq.name
  }

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# ─── Lambda error alarms ─────────────────────────────────────────────────────
# One alarm per Lambda function, based on the Lambda Errors metric (count).
# When the error count breaches the threshold over the configured evaluation
# window, the alarm transitions to ALARM and notifies the ops_alerts SNS topic,
# which routes to the rollbar-discord Lambda → Discord channel.
#
# CloudWatch sends notifications on alarm state transitions (for example,
# OK → ALARM or ALARM → OK). The evaluation window is determined by the period
# and evaluation_periods values on each alarm; period does not act as a manual
# cooldown or re-fire delay.

locals {
  # Map of Terraform resource name → Lambda function resource reference.
  # Excludes rollbar-discord to avoid a self-referential alert loop.
  monitored_lambdas = {
    graphql         = aws_lambda_function.graphql
    oauth_proxy     = aws_lambda_function.oauth_proxy
    stats           = aws_lambda_function.stats
    stripe_webhook  = aws_lambda_function.stripe_webhook
    draft_processor = aws_lambda_function.draft_processor
    game_selection  = aws_lambda_function.game_selection
    jira_proxy      = aws_lambda_function.jira_proxy
    websocket       = aws_lambda_function.websocket
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = local.monitored_lambdas

  alarm_name          = "${local.name_prefix}-${each.key}-errors"
  alarm_description   = "Lambda ${each.value.function_name} error count met or exceeded ${var.lambda_error_alarm_threshold} in ${var.lambda_error_alarm_evaluation_periods}x${var.lambda_error_alarm_period}s (${var.lambda_error_alarm_evaluation_periods * var.lambda_error_alarm_period}s window)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.lambda_error_alarm_threshold
  evaluation_periods  = var.lambda_error_alarm_evaluation_periods
  period              = var.lambda_error_alarm_period

  namespace   = "AWS/Lambda"
  metric_name = "Errors"
  dimensions = {
    FunctionName = each.value.function_name
  }

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# ─── Runner Lambda error alarms (LS-1655) ─────────────────────────────────────
# The github-aws-runners module creates four Lambdas that are not in the
# monitored_lambdas map above because they are module-managed resources with
# no direct aws_lambda_function reference. Names are derived from the module's
# ${prefix}-{function} convention where prefix = "${local.name_prefix}-runner".
# All four alarms are gated on enable_github_runners so they are not created
# in environments without self-hosted runners.

locals {
  # Runner Lambda function names as created by the github-aws-runners module.
  # Format: ${prefix}-{webhook|scale-up|scale-down|binaries-syncer}
  runner_lambda_names = var.enable_github_runners ? {
    runner_webhook         = "${local.name_prefix}-runner-webhook"
    runner_scale_up        = "${local.name_prefix}-runner-scale-up"
    runner_scale_down      = "${local.name_prefix}-runner-scale-down"
    runner_binaries_syncer = "${local.name_prefix}-runner-binaries-syncer"
  } : {}
}

resource "aws_cloudwatch_metric_alarm" "runner_lambda_errors" {
  for_each = local.runner_lambda_names

  alarm_name          = "${local.name_prefix}-${each.key}-errors"
  alarm_description   = "Runner Lambda ${each.value} error count met or exceeded ${var.lambda_error_alarm_threshold} in ${var.lambda_error_alarm_evaluation_periods}x${var.lambda_error_alarm_period}s. Errors in webhook/scale-up/scale-down Lambdas prevent new runners from launching."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.lambda_error_alarm_threshold
  evaluation_periods  = var.lambda_error_alarm_evaluation_periods
  period              = var.lambda_error_alarm_period

  namespace   = "AWS/Lambda"
  metric_name = "Errors"
  dimensions = {
    FunctionName = each.value
  }

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# ─── Runner scale-up queue depth alarm (LS-1655) ──────────────────────────────
# The scale-up Lambda reads from a FIFO SQS queue populated by the webhook Lambda.
# If messages sit in the queue for more than 5 consecutive minutes it means the
# scale-up Lambda is failing or throttled and no new runners are being launched
# despite queued jobs. Queue name follows the module convention: ${prefix}-queued-builds.fifo.

resource "aws_cloudwatch_metric_alarm" "runner_queue_depth" {
  count = var.enable_github_runners ? 1 : 0

  alarm_name          = "${local.name_prefix}-runner-queue-depth"
  alarm_description   = "Runner scale-up queue has visible messages for 5+ consecutive minutes — scale-up Lambda may be failing. New CI jobs will not get runners until resolved."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 5 # 5 consecutive 1-minute periods = 5-minute sustained queue
  period              = 60

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  dimensions = {
    QueueName = "${local.name_prefix}-runner-queued-builds.fifo"
  }

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  # Missing data means the queue does not exist yet (runners disabled) or has
  # no messages — both are normal, not a reason to alarm.
  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# ─── Runner cost anomaly detection (LS-1655) ──────────────────────────────────
# AWS Cost Anomaly Detection monitors runner EC2 spend filtered to the
# ghr:environment tag applied by the github-aws-runners module to all instances.
# Fires when the absolute anomaly impact exceeds $10 in a day, routing to the
# ops_alerts SNS topic alongside budget and Lambda error alerts.

resource "aws_ce_anomaly_monitor" "runner" {
  count        = var.enable_github_runners ? 1 : 0
  name         = "${local.name_prefix}-runner-cost-anomaly"
  monitor_type = "CUSTOM"

  # Filter to EC2 costs tagged with the runner environment tag so we only watch
  # runner spend, not the whole account.
  monitor_specification = jsonencode({
    And = [
      {
        Dimensions = {
          Key          = "SERVICE"
          Values       = ["Amazon Elastic Compute Cloud - Compute"]
          MatchOptions = ["EQUALS"]
        }
      },
      {
        Tags = {
          Key          = "ghr:environment"
          Values       = ["${local.name_prefix}-runner"]
          MatchOptions = ["EQUALS"]
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_ce_anomaly_subscription" "runner" {
  count     = var.enable_github_runners ? 1 : 0
  name      = "${local.name_prefix}-runner-cost-anomaly"
  frequency = "DAILY"

  monitor_arn_list = [aws_ce_anomaly_monitor.runner[0].arn]

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.ops_alerts.arn
  }

  # Alert when the detected anomaly's estimated dollar impact is ≥ $10.
  # Spot runners are cheap (~$48/month total), so $10 is a meaningful spike.
  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["10"]
    }
  }

  tags = local.common_tags
}
