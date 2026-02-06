# SQS Queue for loading season stats
resource "aws_sqs_queue" "load_season_stats_dlq" {
  name = "${local.name_prefix}-load-season-stats-dlq.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  tags = local.common_tags
}

resource "aws_sqs_queue" "load_season_stats" {
  name = "${local.name_prefix}-load-season-stats.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 360     # 6 minutes (longer than lambda timeout)
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 10      # Long polling

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
      }
    ]
  })
}

# SQS Queue for loading game stats (matchup-specific stats from Baseball Reference)
resource "aws_sqs_queue" "load_game_stats_dlq" {
  name = "${local.name_prefix}-load-game-stats-dlq.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  tags = local.common_tags
}

resource "aws_sqs_queue" "load_game_stats" {
  name = "${local.name_prefix}-load-game-stats.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 900     # 15 minutes (longer than lambda timeout)
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 10      # Long polling

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
            "aws:RequestedRegion" = data.aws_region.current.name
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

  tags = local.common_tags
}

resource "aws_sqs_queue" "select_game" {
  name = "${local.name_prefix}-select-game.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 90      # 1.5 minutes (longer than lambda timeout)
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 10      # Long polling

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
            "aws:RequestedRegion" = data.aws_region.current.name
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

  tags = local.common_tags
}

resource "aws_sqs_queue" "automatic_drafts" {
  name = "${local.name_prefix}-automatic-drafts.fifo"

  fifo_queue                  = true
  content_based_deduplication = true

  # Message settings
  visibility_timeout_seconds = 300     # 5 minutes (longer than lambda timeout)
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 10      # Long polling

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
            "aws:RequestedRegion" = data.aws_region.current.name
          }
        }
      }
    ]
  })
}
