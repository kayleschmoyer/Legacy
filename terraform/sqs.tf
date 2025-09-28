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
