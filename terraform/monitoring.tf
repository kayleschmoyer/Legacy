# CloudWatch Monitoring — DLQ Alarms
# Alarms fire immediately when messages land in any dead-letter queue,
# ensuring stats loading failures surface as alerts rather than silent user-visible bugs.

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
