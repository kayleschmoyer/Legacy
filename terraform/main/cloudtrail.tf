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
# integrity validation enabled — S3 is the sole delivery path (see LS-8908):
# the trail no longer mirrors to CloudWatch Logs, since the only consumer of
# that copy was a root-account-usage metric filter, and CloudTrail delivers
# console sign-in events to the default EventBridge bus natively. Real-time
# root-usage alerting now runs off an EventBridge rule (below) instead of a
# CloudWatch Logs metric filter + alarm, with zero CWL ingestion/storage cost
# for the full management-event stream. Ad-hoc historical queries over trail
# events now require Athena over the S3 bucket (see note near the bottom of
# this file — see the Glue catalog/crawler and Athena workgroup near the
# bottom of this file (LS-8922).

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

# ── Trail ────────────────────────────────────────────────────────────────────
resource "aws_cloudtrail" "main" {
  name                          = local.cloudtrail_name
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true # capture IAM, STS, CloudFront, etc.
  is_multi_region_trail         = true
  enable_log_file_validation    = true

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

# ── Root account console sign-in alarm (LS-8908) ─────────────────────────────
# CIS AWS Foundations 1.1 control: alert whenever the root account signs in.
# Root should never be used for day-to-day operations, so any hit here
# warrants immediate investigation.
#
# Previously implemented as a CloudWatch Logs metric filter + alarm fed by a
# full mirror of the CloudTrail management-event stream into CloudWatch Logs
# (see git history). That metric filter was the *only* consumer of the CWL
# copy of the trail, so paying to ingest/store every management event just to
# feed this one alarm was wasteful. CloudTrail delivers console sign-in
# events to the account's default EventBridge event bus natively — no log
# group needed — so this rule matches directly on that bus and publishes
# straight to the existing ops-alerts SNS topic (no intermediate CloudWatch
# alarm required either).
#
# Scope note: the old metric filter matched ANY root API call (console,
# CLI, or SDK use of root credentials). This EventBridge rule matches only
# root *console* sign-ins (matching CloudTrail's "AWS Console Sign-in via
# CloudTrail" notification), which is the dominant real-world root-misuse
# pattern but is narrower than the old alarm's coverage of root API/CLI
# calls made with long-lived root access keys. Root access keys are
# strongly discouraged and, per AWS best practice, should not exist on this
# account — if that changes, this rule needs revisiting.
#
# Validated the event_pattern below against AWS's documented sample root
# console sign-in CloudTrail event (see PR description for the sample event
# and validation method).
resource "aws_cloudwatch_event_rule" "root_console_signin" {
  name        = "${local.name_prefix}-root-console-signin"
  description = "Detect AWS root account console sign-ins (CIS AWS Foundations 1.1)"

  event_pattern = jsonencode({
    source        = ["aws.signin"]
    "detail-type" = ["AWS Console Sign-in via CloudTrail"]
    detail = {
      userIdentity = {
        type = ["Root"]
      }
    }
  })

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "root_console_signin_sns" {
  rule      = aws_cloudwatch_event_rule.root_console_signin.name
  target_id = "root-console-signin-sns"
  arn       = aws_sns_topic.ops_alerts.arn
}

# ── Ad-hoc forensic queries: Glue catalog + Athena (LS-8922) ─────────────────
# LS-8908 moved CloudTrail delivery to S3-only, which dropped CloudWatch Logs
# Insights as a way to run ad-hoc queries over trail events. This restores
# that capability via Athena: a Glue crawler catalogs the trail's S3 JSON
# records into a queryable table, and a dedicated Athena workgroup scopes
# query result storage/cost so this stays cheap and isolated from any other
# Athena usage in the account. The crawler is on-demand only (no schedule) —
# incident responders run it right before investigating so the catalog picks
# up any partitions added since the last run, and it costs nothing between
# uses.

# Athena requires somewhere to write query results; keep it private and
# short-lived since results are just re-derived from the trail data.
resource "aws_s3_bucket" "athena_results" {
  bucket = "${local.name_prefix}-cloudtrail-athena-results-${random_id.cloudtrail_bucket_suffix.hex}"

  tags = merge(local.common_tags, {
    Component = "cloudtrail"
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  rule {
    id     = "expire-athena-query-results"
    status = "Enabled"

    filter {}

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_glue_catalog_database" "cloudtrail" {
  name        = replace("${local.name_prefix}_cloudtrail", "-", "_")
  description = "Catalog of CloudTrail management events for ad-hoc Athena forensics (LS-8922)"
}

resource "aws_iam_role" "glue_cloudtrail_crawler" {
  name        = "${local.name_prefix}-glue-cloudtrail-crawler-role"
  description = "Execution role for the Glue crawler that catalogs CloudTrail logs for Athena"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "glue.amazonaws.com" }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "glue_cloudtrail_crawler_service" {
  role       = aws_iam_role.glue_cloudtrail_crawler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
}

# Scoped read access to just the CloudTrail bucket — the AWS-managed
# AWSGlueServiceRole policy above covers Glue/CloudWatch Logs permissions but
# grants no S3 access.
resource "aws_iam_role_policy" "glue_cloudtrail_crawler_s3" {
  name = "${local.name_prefix}-glue-cloudtrail-crawler-s3"
  role = aws_iam_role.glue_cloudtrail_crawler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListCloudTrailBucket"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.cloudtrail_logs.arn
      },
      {
        Sid      = "ReadCloudTrailObjects"
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.cloudtrail_logs.arn}/AWSLogs/${local.account_id}/CloudTrail/*"
      }
    ]
  })
}

# Crawls the CloudTrail JSON records into a single Athena-queryable table.
# Scoped to the CloudTrail/ prefix (not AWSLogs/<account>/ as a whole) so it
# never picks up unrelated log types (e.g. Config, VPC Flow Logs) that might
# later land in sibling prefixes of the same bucket.
resource "aws_glue_crawler" "cloudtrail" {
  name          = "${local.name_prefix}-cloudtrail-crawler"
  role          = aws_iam_role.glue_cloudtrail_crawler.arn
  database_name = aws_glue_catalog_database.cloudtrail.name

  s3_target {
    path = "s3://${aws_s3_bucket.cloudtrail_logs.id}/AWSLogs/${local.account_id}/CloudTrail/"
  }

  # CloudTrail delivers gzip-compressed JSON; the classifier below tells Glue
  # to read the un-gzipped records as an array-of-objects JSON document
  # rather than newline-delimited JSON.
  classifiers = [aws_glue_classifier.cloudtrail_json.name]

  schema_change_policy {
    update_behavior = "UPDATE_IN_DATABASE"
    delete_behavior = "LOG"
  }

  tags = merge(local.common_tags, {
    Component = "cloudtrail"
  })
}

resource "aws_glue_classifier" "cloudtrail_json" {
  name = "${local.name_prefix}-cloudtrail-json"

  json_classifier {
    json_path = "$.Records[*]"
  }
}

# Dedicated workgroup: pins query results to the bucket above, isolates cost
# tracking for CloudTrail forensics from any other Athena usage in the
# account, and enforces that every query in it uses this configuration
# (so nobody can silently point a query at a different, unmanaged results
# location).
resource "aws_athena_workgroup" "cloudtrail_forensics" {
  name        = "${local.name_prefix}-cloudtrail-forensics"
  description = "Ad-hoc forensic queries over CloudTrail S3 logs via the Glue catalog above (LS-8922)"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = false

    result_configuration {
      output_location = "s3://${aws_s3_bucket.athena_results.id}/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }

  tags = local.common_tags
}
