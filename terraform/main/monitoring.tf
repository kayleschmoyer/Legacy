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

# ─── Football ingestion alarms ────────────────────────────────────────────────
# These alarms fire on custom metrics emitted by the football handlers in stats-lambda.
# Metric namespace: LegacySports/FootballIngest
# SEV-2 pages on-call immediately; SEV-3 notifies without paging.

# Football load failure rate > 5% over a 15-minute window — SEV-2 page.
# Covers game_load failures. season_load failures are observable via the DLQ alarm below.
resource "aws_cloudwatch_metric_alarm" "football_load_failure_rate" {
  alarm_name          = "${local.name_prefix}-football-load-failure-rate"
  alarm_description   = "Football stats load failure rate exceeded 5% over 15 minutes. Check stats-lambda logs for football handler errors."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  evaluation_periods  = 3
  # period is not set at the resource level when using metric_query blocks;
  # each metric sub-block carries its own period.

  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  metric_query {
    id          = "failure_count"
    return_data = false

    metric {
      namespace   = "LegacySports/FootballIngest"
      metric_name = "football.game_load.failure"
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id          = "success_count"
    return_data = false

    metric {
      namespace   = "LegacySports/FootballIngest"
      metric_name = "football.game_load.success"
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id          = "failure_rate"
    return_data = true
    expression  = "100 * failure_count / (failure_count + success_count + 0.0001)"
    label       = "Football Load Failure Rate (%)"
  }

  tags = local.common_tags
}

# Football DLQ depth > 0 — SEV-2 page (football messages exhausted retries).
resource "aws_cloudwatch_metric_alarm" "load_football_stats_dlq_visible" {
  alarm_name          = "${local.name_prefix}-load-football-stats-dlq-visible"
  alarm_description   = "Visible messages in load-football-stats-dlq.fifo — football stats batches expired into the DLQ."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  period              = 60

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  dimensions = {
    QueueName = aws_sqs_queue.load_football_stats_dlq.name
  }

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# PFR fetch latency p99 > 30 seconds over 30 minutes — SEV-3 notify.
# Pro Football Reference rate-limiting or connectivity degradation.
resource "aws_cloudwatch_metric_alarm" "football_pfr_fetch_latency_p99" {
  alarm_name          = "${local.name_prefix}-football-pfr-fetch-latency-p99"
  alarm_description   = "PFR fetch latency p99 exceeded 30 seconds over 30 minutes. Pro Football Reference may be rate-limiting or degraded."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 30000 # 30 seconds in milliseconds
  evaluation_periods  = 6
  period              = 300 # 5-minute periods × 6 = 30-minute window

  namespace   = "LegacySports/FootballIngest"
  metric_name = "football.pfr_fetch.latency_ms"
  dimensions  = {}

  extended_statistic = "p99"

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

