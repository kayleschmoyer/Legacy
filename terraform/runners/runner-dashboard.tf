# =============================================================================
# Runner Performance Monitoring Dashboard (LS-1666)
# =============================================================================
# Surfaces the key health and throughput signals for the self-hosted runner
# fleet: SQS queue depth/age (are jobs getting picked up?), Lambda invocation
# rates and error counts (are the orchestration functions healthy?), and
# scale-up duration (how long does it take to launch a runner?).
#
# Lives in terraform/runners/ as of LS-2425. Always created when this state
# is applied — the previous enable_github_runners gate is no longer needed
# now that runner state is fully separated from main/.
# =============================================================================

resource "aws_cloudwatch_dashboard" "runner" {
  dashboard_name = "${local.name_prefix}-runner-performance"

  dashboard_body = jsonencode({
    widgets = [

      # ── Title ──────────────────────────────────────────────────────────────
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 2
        properties = {
          markdown = "# Runner Fleet — Performance & Health\nSelf-hosted EC2 spot runners orchestrated via `github-aws-runners`. **Queue** widgets show job ingestion health; **Lambda** widgets show orchestration health; **Duration** shows scale-up latency."
        }
      },

      # ── Scale-up queue depth ───────────────────────────────────────────────
      # Sustained depth > 0 means jobs are waiting and scale-up Lambda is not
      # processing them — the most critical signal for runner availability.
      # Maximum shows the worst-case backlog; Minimum shows whether the queue
      # ever drained to zero within the period (healthy flush signal).
      {
        type   = "metric"
        x      = 0
        y      = 2
        width  = 12
        height = 6
        properties = {
          title   = "Scale-Up Queue — Visible Messages (max/min)"
          view    = "timeSeries"
          stacked = false
          period  = 60
          region  = local.region
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "${local.name_prefix}-runner-queued-builds.fifo",
              { stat = "Maximum", label = "Queued Jobs (max)", color = "#d62728" }
            ],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "${local.name_prefix}-runner-queued-builds.fifo",
              { stat = "Minimum", label = "Queued Jobs (min)", color = "#ff9896" }
            ],
          ]
          yAxis = { left = { min = 0, label = "Messages" } }
          annotations = {
            horizontal = [
              { label = "Alarm threshold", value = 1, color = "#d62728" }
            ]
          }
        }
      },

      # ── Queue message age ──────────────────────────────────────────────────
      # How long has the oldest unprocessed job been waiting? Complements the
      # depth metric — a low depth with high age means a job is stuck.
      {
        type   = "metric"
        x      = 12
        y      = 2
        width  = 12
        height = 6
        properties = {
          title   = "Scale-Up Queue — Oldest Message Age"
          view    = "timeSeries"
          stacked = false
          period  = 60
          region  = local.region
          stat    = "Maximum"
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", "${local.name_prefix}-runner-queued-builds.fifo",
              { label = "Age (seconds)", color = "#ff7f0e" }
            ],
          ]
          yAxis = { left = { min = 0, label = "Seconds" } }
        }
      },

      # ── Webhook Lambda — invocations + errors ─────────────────────────────
      # Invocations reflect GitHub webhook delivery volume. Errors mean events
      # are being dropped before they reach the scale-up queue.
      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "Webhook Lambda — Invocations & Errors"
          view    = "timeSeries"
          stacked = false
          period  = 300
          region  = local.region
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-runner-webhook",
              { stat = "Sum", label = "Invocations", color = "#1f77b4" }
            ],
            ["AWS/Lambda", "Errors", "FunctionName", "${local.name_prefix}-runner-webhook",
              { stat = "Sum", label = "Errors", color = "#d62728" }
            ],
          ]
          yAxis = { left = { min = 0, label = "Count" } }
        }
      },

      # ── Scale-up Lambda — invocations + errors ────────────────────────────
      # Each invocation attempts to launch one or more spot instances. Errors
      # mean runners are not being launched despite jobs in the queue.
      {
        type   = "metric"
        x      = 12
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "Scale-Up Lambda — Invocations & Errors"
          view    = "timeSeries"
          stacked = false
          period  = 300
          region  = local.region
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-runner-scale-up",
              { stat = "Sum", label = "Invocations", color = "#2ca02c" }
            ],
            ["AWS/Lambda", "Errors", "FunctionName", "${local.name_prefix}-runner-scale-up",
              { stat = "Sum", label = "Errors", color = "#d62728" }
            ],
          ]
          yAxis = { left = { min = 0, label = "Count" } }
        }
      },

      # ── Scale-down Lambda — invocations ───────────────────────────────────
      # Scale-down runs on a 1-minute cron. A drop in invocations means the
      # Lambda is failing to schedule, which will cause idle runner accumulation.
      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 6
        properties = {
          title   = "Scale-Down Lambda — Invocations & Errors"
          view    = "timeSeries"
          stacked = false
          period  = 300
          region  = local.region
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-runner-scale-down",
              { stat = "Sum", label = "Invocations", color = "#9467bd" }
            ],
            ["AWS/Lambda", "Errors", "FunctionName", "${local.name_prefix}-runner-scale-down",
              { stat = "Sum", label = "Errors", color = "#d62728" }
            ],
          ]
          yAxis = { left = { min = 0, label = "Count" } }
        }
      },

      # ── Scale-up Lambda — P50/P95 duration ────────────────────────────────
      # How long does the scale-up Lambda take to run? High p95 duration
      # (~15s timeout) may indicate EC2 fleet API slowness or spot capacity
      # constraints requiring multiple retry attempts.
      {
        type   = "metric"
        x      = 12
        y      = 14
        width  = 12
        height = 6
        properties = {
          title   = "Scale-Up Lambda — Duration (ms)"
          view    = "timeSeries"
          stacked = false
          period  = 300
          region  = local.region
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", "${local.name_prefix}-runner-scale-up",
              { stat = "p50", label = "p50", color = "#2ca02c" }
            ],
            ["AWS/Lambda", "Duration", "FunctionName", "${local.name_prefix}-runner-scale-up",
              { stat = "p95", label = "p95", color = "#ff7f0e" }
            ],
          ]
          yAxis = { left = { min = 0, label = "Milliseconds" } }
        }
      },

      # ── Alarm status ──────────────────────────────────────────────────────
      # At-a-glance health of all runner-related alarms so on-call can see
      # current state without navigating to the alarms console.
      # Note: The following alarm ARNs reference alarms created by the runner CloudWatch
      # alarms configuration (LS-1655/runner-cloudwatch-alarms). Ensure that configuration
      # is applied before or alongside this dashboard.
      {
        type   = "alarm"
        x      = 0
        y      = 20
        width  = 24
        height = 4
        properties = {
          title = "Runner Alarm Status"
          alarms = [
            "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name_prefix}-runner-webhook-errors",
            "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name_prefix}-runner-scale-up-errors",
            "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name_prefix}-runner-scale-down-errors",
            "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name_prefix}-runner-binaries-syncer-errors",
            "arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${local.name_prefix}-runner-queue-depth",
          ]
        }
      },
    ]
  })
}
