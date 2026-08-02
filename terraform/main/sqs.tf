# ─── Football stats queues ─────────────────────────────────────────────────────
# Separate FIFO queues for football game and season stats so football and baseball
# ingestion failures are independently observable and redriv-able.

resource "aws_sqs_queue" "load_football_stats_dlq" {
  name = "${local.name_prefix}-load-football-stats-dlq.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # DLQ messages need manual investigation/replay, so retain longer than the live queue.
  message_retention_seconds = 1209600 # 14 days

  tags = local.common_tags
}

resource "aws_sqs_queue" "load_football_stats" {
  name = "${local.name_prefix}-load-football-stats.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings — same profile as load-game-stats: one matchup per invocation,
  # 15-minute visibility window to cover PFR scrape + DB write latency.
  visibility_timeout_seconds = 900    # 15 minutes
  message_retention_seconds  = 345600 # 4 days (SQS default) — live queue, DLQ covers failure recovery
  receive_wait_time_seconds  = 10     # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.load_football_stats_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

resource "aws_sqs_queue_policy" "load_football_stats" {
  queue_url = aws_sqs_queue.load_football_stats.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-load-football-stats-policy"
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
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.load_football_stats.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_lambda_function.stats.arn
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
        Resource = aws_sqs_queue.load_football_stats.arn
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = data.aws_region.current.id
          }
        }
      }
    ]
  })
}

# ─── Baseball stats queues ─────────────────────────────────────────────────────
# SQS Queue for loading baseball season stats
resource "aws_sqs_queue" "load_season_stats_dlq" {
  name = "${local.name_prefix}-load-season-stats-dlq.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # DLQ messages need manual investigation/replay, so retain longer than the live queue.
  message_retention_seconds = 1209600 # 14 days

  tags = local.common_tags
}

resource "aws_sqs_queue" "load_season_stats" {
  name = "${local.name_prefix}-load-season-stats.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 360    # 6 minutes (longer than lambda timeout)
  message_retention_seconds  = 345600 # 4 days (SQS default) — live queue, DLQ covers failure recovery
  receive_wait_time_seconds  = 10     # Long polling

  # Redrive policy for dead letter queue
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.load_season_stats_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

# SQS Queue Policy - simplified since Serverless Framework manages Lambda permissions
resource "aws_sqs_queue_policy" "load_season_stats" {
  queue_url = aws_sqs_queue.load_season_stats.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-load-season-stats-policy"
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
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.load_season_stats.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_lambda_function.stats.arn
          }
        }
      }
    ]
  })
}

# SQS Queue for loading game stats (matchup-specific stats from Baseball Reference)
resource "aws_sqs_queue" "load_game_stats_dlq" {
  name = "${local.name_prefix}-load-game-stats-dlq.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # DLQ messages need manual investigation/replay, so retain longer than the live queue.
  message_retention_seconds = 1209600 # 14 days

  tags = local.common_tags
}

resource "aws_sqs_queue" "load_game_stats" {
  name = "${local.name_prefix}-load-game-stats.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 900    # 15 minutes (longer than lambda timeout)
  message_retention_seconds  = 345600 # 4 days (SQS default) — live queue, DLQ covers failure recovery
  receive_wait_time_seconds  = 10     # Long polling

  # Redrive policy for dead letter queue
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.load_game_stats_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

# SQS Queue Policy for load game stats
resource "aws_sqs_queue_policy" "load_game_stats" {
  queue_url = aws_sqs_queue.load_game_stats.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-load-game-stats-policy"
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
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.load_game_stats.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_lambda_function.stats.arn
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
        Resource = aws_sqs_queue.load_game_stats.arn
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = data.aws_region.current.id
          }
        }
      }
    ]
  })
}

# SQS Queue for game selection
resource "aws_sqs_queue" "select_game_dlq" {
  name = "${local.name_prefix}-select-game-dlq.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # DLQ messages need manual investigation/replay, so retain longer than the live queue.
  message_retention_seconds = 1209600 # 14 days

  tags = local.common_tags
}

resource "aws_sqs_queue" "select_game" {
  name = "${local.name_prefix}-select-game.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 90     # 1.5 minutes (longer than lambda timeout)
  message_retention_seconds  = 345600 # 4 days (SQS default) — live queue, DLQ covers failure recovery
  receive_wait_time_seconds  = 10     # Long polling

  # Redrive policy for dead letter queue
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.select_game_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

# SQS Queue Policy for game selection
resource "aws_sqs_queue_policy" "select_game" {
  queue_url = aws_sqs_queue.select_game.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-select-game-policy"
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
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.select_game.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_lambda_function.game_selection.arn
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
        Resource = aws_sqs_queue.select_game.arn
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = data.aws_region.current.id
          }
        }
      }
    ]
  })
}

# SQS Queue for processing automatic drafts
resource "aws_sqs_queue" "automatic_drafts_dlq" {
  name = "${local.name_prefix}-automatic-drafts-dlq.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # DLQ messages need manual investigation/replay, so retain longer than the live queue.
  message_retention_seconds = 1209600 # 14 days

  tags = local.common_tags
}

resource "aws_sqs_queue" "automatic_drafts" {
  name = "${local.name_prefix}-automatic-drafts.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 300    # 5 minutes (longer than lambda timeout)
  message_retention_seconds  = 345600 # 4 days (SQS default) — live queue, DLQ covers failure recovery
  receive_wait_time_seconds  = 10     # Long polling

  # Redrive policy for dead letter queue
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.automatic_drafts_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

# SQS Queue Policy for automatic drafts
resource "aws_sqs_queue_policy" "automatic_drafts" {
  queue_url = aws_sqs_queue.automatic_drafts.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-automatic-drafts-policy"
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
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.automatic_drafts.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_lambda_function.draft_processor.arn
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
        Resource = aws_sqs_queue.automatic_drafts.arn
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = data.aws_region.current.id
          }
        }
      }
    ]
  })
}

# ─── Notifications queue ────────────────────────────────────────────────────
# Push notification events (Expo + Web Push/VAPID). Producers: draft-processor
# (draft_completed) and stripe-webhook (trial_will_end, subscription_updated)
# via lib/aws-utils's NotificationPublisher, which reads NOTIFICATION_QUEUE_URL.
# Consumer: the notifications Lambda (lambdas/notifications/src/deliver.ts).
# Standard (non-FIFO) queue — delivery order across notification types doesn't
# matter, and standard queues give higher throughput than FIFO. LS-6838.

resource "aws_sqs_queue" "notifications_dlq" {
  name = "${local.name_prefix}-notifications-dlq"

  tags = local.common_tags
}

resource "aws_sqs_queue" "notifications_queue" {
  name = "${local.name_prefix}-notifications"

  # Message settings
  visibility_timeout_seconds = 120     # 2 minutes (longer than lambda timeout)
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 10      # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.notifications_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}

resource "aws_sqs_queue_policy" "notifications_queue" {
  queue_url = aws_sqs_queue.notifications_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-notifications-policy"
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
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.notifications_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_lambda_function.notifications.arn
          }
        }
      }
      # No AllowApplicationSendMessages/root statement here — unlike the other
      # queues in this file, draft-processor and stripe-webhook (the only two
      # producers) already have explicit least-privilege sqs:SendMessage IAM
      # role policies (draft_processor_lambda_notifications_sqs /
      # stripe_webhook_lambda_notifications_sqs below and in
      # lambda-stripe-webhook.tf), so a broad account-root grant here would be
      # redundant and violate least privilege.
    ]
  })
}
