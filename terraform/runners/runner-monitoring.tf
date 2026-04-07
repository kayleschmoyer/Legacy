# =============================================================================
# Self-hosted runner CloudWatch alarms (LS-1655)
# =============================================================================
# Extracted from terraform/main/monitoring.tf as part of LS-2425 (state separation).
#
# These alarms monitor the four github-aws-runners module Lambdas plus the
# scale-up SQS queue depth. They live in terraform/runners/ because they
# reference resources owned by module.github_runners and we want them in the
# same state file so a runner-only apply can plan/apply them atomically.
#
# Cross-state dependency: aws_sns_topic.ops_alerts is defined in
# terraform/main/monitoring.tf and looked up here via a tag-based AWS data
# source (data.aws_sns_topic.ops_alerts in data.tf). The locals alias
# `local.ops_alerts_topic_arn` is what these alarms reference. Tag-based
# discovery avoids a plan-time ordering requirement between the two states.

# ─── Runner Lambda function names ─────────────────────────────────────────────
# Format: ${prefix}-{webhook|scale-up|scale-down|binaries-syncer}
# These names are derived from the github-aws-runners module's
# ${prefix}-{function} convention where prefix = "${local.name_prefix}-runner".
locals {
  runner_lambda_names = {
    runner_webhook         = "${local.name_prefix}-runner-webhook"
    runner_scale_up        = "${local.name_prefix}-runner-scale-up"
    runner_scale_down      = "${local.name_prefix}-runner-scale-down"
    runner_binaries_syncer = "${local.name_prefix}-runner-binaries-syncer"
  }
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

  alarm_actions = [local.ops_alerts_topic_arn]
  ok_actions    = [local.ops_alerts_topic_arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# ─── Runner scale-up queue depth alarm (LS-1655) ──────────────────────────────
# The scale-up Lambda reads from a FIFO SQS queue populated by the webhook Lambda.
# If messages sit in the queue for more than 5 consecutive minutes it means the
# scale-up Lambda is failing or throttled and no new runners are being launched
# despite queued jobs. Queue name follows the module convention: ${prefix}-queued-builds.fifo.

resource "aws_cloudwatch_metric_alarm" "runner_queue_depth" {
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

  alarm_actions = [local.ops_alerts_topic_arn]
  ok_actions    = [local.ops_alerts_topic_arn]

  # Missing data means the queue does not exist yet or has no messages — both
  # are normal, not a reason to alarm.
  treat_missing_data = "notBreaching"

  tags = local.common_tags
}

# ─── Runner cost anomaly detection (LS-1655) ──────────────────────────────────
# AWS Cost Anomaly Detection monitors runner EC2 spend filtered to the
# ghr:environment tag applied by the github-aws-runners module to all instances.
# Fires when the absolute anomaly impact exceeds $10 in a day, routing to the
# ops_alerts SNS topic alongside budget and Lambda error alerts.

resource "aws_ce_anomaly_monitor" "runner" {
  name         = "${local.name_prefix}-runner-cost-anomaly"
  monitor_type = "CUSTOM"

  # AWS Cost Explorer CreateAnomalyMonitor rejects compound And/Or expressions
  # in monitor_specification — only a single-dimension expression is allowed.
  # Filter on the ghr:environment tag alone; the tag is already runner-specific
  # so we don't need an additional SERVICE=EC2 filter.
  # AWS returns null for all other expression kinds; include them explicitly
  # as literal JSON nulls so jsonencode's output round-trips with what AWS
  # stores (otherwise terraform plans a perpetual replace on every run).
  monitor_specification = <<-JSON
    {
      "And": null,
      "CostCategories": null,
      "Dimensions": null,
      "Not": null,
      "Or": null,
      "Tags": {
        "Key": "user:ghr:environment",
        "Values": ["${local.name_prefix}-runner"],
        "MatchOptions": ["EQUALS"]
      }
    }
  JSON

  tags = local.common_tags
}

resource "aws_ce_anomaly_subscription" "runner" {
  name = "${local.name_prefix}-runner-cost-anomaly"
  # IMMEDIATE is required when using SNS subscribers — AWS only permits
  # DAILY/WEEKLY frequencies with Email subscriptions.
  frequency = "IMMEDIATE"

  monitor_arn_list = [aws_ce_anomaly_monitor.runner.arn]

  subscriber {
    type    = "SNS"
    address = local.ops_alerts_topic_arn
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
