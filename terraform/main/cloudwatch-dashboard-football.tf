# CloudWatch Dashboard — Football Stats Ingest
# Mirrors the observability surface of the baseball/MLB ingest pipeline.
# Shows per-handler invocation counts, error rates, PFR fetch latency, and DLQ depth.

resource "aws_cloudwatch_dashboard" "football_stats_ingest" {
  dashboard_name = "${local.name_prefix}-football-stats-ingest"

  dashboard_body = jsonencode({
    widgets = [
      # ── Row 1: Handler invocation counts ───────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 8
        height = 6
        properties = {
          title  = "Football Handler — Invocations (success)"
          region = local.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["LegacySports/FootballIngest", "football.game_load.success", { label = "game_load success" }],
            ["LegacySports/FootballIngest", "football.season_load.success", { label = "season_load success" }],
            ["LegacySports/FootballIngest", "football.matchup_score.success", { label = "matchup_score success" }],
          ]
        }
      },
      # ── Row 1: Handler error counts ────────────────────────────────────────
      {
        type   = "metric"
        x      = 8
        y      = 0
        width  = 8
        height = 6
        properties = {
          title  = "Football Handler — Errors"
          region = local.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["LegacySports/FootballIngest", "football.game_load.failure", { label = "game_load failure", color = "#d62728" }],
            ["LegacySports/FootballIngest", "football.season_load.failure", { label = "season_load failure", color = "#ff7f0e" }],
            ["LegacySports/FootballIngest", "football.matchup_score.failure", { label = "matchup_score failure", color = "#8c564b" }],
          ]
        }
      },
      # ── Row 1: Load failure rate ───────────────────────────────────────────
      {
        type   = "metric"
        x      = 16
        y      = 0
        width  = 8
        height = 6
        properties = {
          title  = "Football Load Failure Rate (%)"
          region = local.region
          view   = "timeSeries"
          period = 300
          metrics = [
            [{ id = "f", expression = "100 * e / (e + s + 0.0001)", label = "game_load failure rate (%)", region = local.region }],
            ["LegacySports/FootballIngest", "football.game_load.failure", { id = "e", visible = false }],
            ["LegacySports/FootballIngest", "football.game_load.success", { id = "s", visible = false }],
          ]
          annotations = {
            horizontal = [{ value = 5, label = "5% threshold (alarm)", color = "#d62728" }]
          }
        }
      },
      # ── Row 2: PFR fetch latency ───────────────────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "PFR Fetch Latency (ms)"
          region = local.region
          view   = "timeSeries"
          period = 300
          metrics = [
            ["LegacySports/FootballIngest", "football.pfr_fetch.latency_ms", { stat = "p50", label = "p50" }],
            ["LegacySports/FootballIngest", "football.pfr_fetch.latency_ms", { stat = "p90", label = "p90" }],
            ["LegacySports/FootballIngest", "football.pfr_fetch.latency_ms", { stat = "p99", label = "p99", color = "#d62728" }],
          ]
          annotations = {
            horizontal = [{ value = 30000, label = "30s alarm threshold", color = "#d62728" }]
          }
        }
      },
      # ── Row 2: DLQ depth ──────────────────────────────────────────────────
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Football Stats DLQ Depth"
          region = local.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.load_football_stats_dlq.name, { label = "Football Stats DLQ visible", color = "#d62728" }],
            ["AWS/SQS", "ApproximateNumberOfMessagesNotVisible", "QueueName", aws_sqs_queue.load_football_stats_dlq.name, { label = "Football Stats DLQ in-flight", color = "#ff7f0e" }],
          ]
          annotations = {
            horizontal = [{ value = 1, label = "alarm threshold", color = "#d62728" }]
          }
        }
      },
      # ── Row 3: Lambda invocations and errors ──────────────────────────────
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "stats-lambda Invocations"
          region = local.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.stats.function_name, { label = "Invocations" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "stats-lambda Errors (AWS/Lambda)"
          region = local.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 300
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.stats.function_name, { label = "Lambda Errors", color = "#d62728" }],
          ]
        }
      },
    ]
  })
}
