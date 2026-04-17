# =============================================================================
# LS-2794 — AWS CloudTrail audit logging
# =============================================================================
# Captures management events only (IAM, Lambda invocations via console,
# Secrets Manager reads, EventBridge changes, etc.) across every region. S3
# object-level and Lambda invoke data events are intentionally NOT enabled —
# they generate very high volume/cost and can be added later if a specific
# need arises. Required for incident response, forensics, and compliance
# frameworks (SOC 2, PCI DSS, ISO 27001).
#
# Trail events are delivered to a dedicated encrypted S3 bucket with log-file
# integrity validation enabled. A CloudWatch Logs destination powers a metric
# filter + alarm that notifies ops whenever the root account is used.

# Audit log retention is intentionally longer than application log retention.
# See local.cloudtrail_retention_days below for the per-environment values;
# production keeps CloudTrail logs for 365 days so incident responders can
# look back further than a month.
locals {
  cloudtrail_retention_days = {
    dev     = 30
    staging = 90
    prod    = 365
  }

  # Centralize the trail name/ARN so the bucket policy conditions and the
  # trail resource can never drift apart.
  cloudtrail_name = "${local.name_prefix}-trail"
  cloudtrail_arn  = "arn:aws:cloudtrail:${local.region}:${local.account_id}:trail/${local.name_prefix}-trail"
}

# ── S3 bucket for trail log delivery ─────────────────────────────────────────
# Random suffix guarantees global uniqueness for the bucket name and lets us
# recreate the bucket without fighting residual DNS/S3 namespace holds.
resource "random_id" "cloudtrail_bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket = "${local.name_prefix}-cloudtrail-logs-${random_id.cloudtrail_bucket_suffix.hex}"

  tags = merge(local.common_tags, {
    Component = "cloudtrail"
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    id     = "expire-cloudtrail-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = local.cloudtrail_retention_days[var.environment]
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Bucket policy: CloudTrail needs GetBucketAcl on the bucket and PutObject
# under AWSLogs/<account>/*. The AWS:SourceArn + AWS:SourceAccount conditions
# scope each grant to this specific trail in this specific account as
# defense-in-depth against confused-deputy style abuse of the CloudTrail
# service principal.
resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  depends_on = [aws_s3_bucket_public_access_block.cloudtrail_logs]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail_logs.arn
        Condition = {
          StringEquals = {
            "AWS:SourceArn"     = local.cloudtrail_arn
            "AWS:SourceAccount" = local.account_id
          }
        }
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail_logs.arn}/AWSLogs/${local.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"      = "bucket-owner-full-control"
            "AWS:SourceArn"     = local.cloudtrail_arn
            "AWS:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

# ── CloudWatch Logs destination ──────────────────────────────────────────────
# Mirroring the trail to CloudWatch Logs enables real-time metric filters and
# alarms (below) without having to parse S3 objects.
resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/${local.name_prefix}"
  retention_in_days = local.cloudtrail_retention_days[var.environment]

  tags = merge(local.common_tags, {
    Component = "cloudtrail"
  })
}

data "aws_iam_policy_document" "cloudtrail_cw_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cloudtrail_cw" {
  name               = "${local.name_prefix}-cloudtrail-cw"
  assume_role_policy = data.aws_iam_policy_document.cloudtrail_cw_assume.json

  tags = local.common_tags
}

resource "aws_iam_role_policy" "cloudtrail_cw" {
  name = "${local.name_prefix}-cloudtrail-cw"
  role = aws_iam_role.cloudtrail_cw.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
      }
    ]
  })
}

# ── Trail ────────────────────────────────────────────────────────────────────
resource "aws_cloudtrail" "main" {
  name                          = local.cloudtrail_name
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true # capture IAM, STS, CloudFront, etc.
  is_multi_region_trail         = true
  enable_log_file_validation    = true

  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_cw.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  # Bucket policy must exist before CloudTrail can validate write access.
  depends_on = [aws_s3_bucket_policy.cloudtrail_logs]

  tags = merge(local.common_tags, {
    Component = "cloudtrail"
  })
}

# ── Root account usage alarm ─────────────────────────────────────────────────
# CIS AWS Foundations 1.1 control: alert whenever root credentials make an
# API call. Root should never be used for day-to-day operations, so any hit
# here warrants immediate investigation.
resource "aws_cloudwatch_log_metric_filter" "root_account_usage" {
  name           = "${local.name_prefix}-root-account-usage"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name

  pattern = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"

  metric_transformation {
    name      = "${local.name_prefix}-RootAccountUsage"
    namespace = "LegacySports/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "root_account_usage" {
  alarm_name          = "${local.name_prefix}-root-account-usage"
  alarm_description   = "Root account used — investigate immediately. Root credentials should never be used for day-to-day operations."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  period              = 60

  namespace   = "LegacySports/Security"
  metric_name = "${local.name_prefix}-RootAccountUsage"
  statistic   = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}
