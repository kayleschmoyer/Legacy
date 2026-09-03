# LS-9817: S3 bucket holding the Retrosheet corpus, one object per
# (brefId, season), used as the primary source for game-level baseball stats.
#
# Why this exists: the Baseball Reference scraper is capped at 15 requests per
# minute GLOBALLY -- an in-process limiter in lib/bref-client made global by
# `reserved_concurrent_executions = 1` on the stats Lambda. That ceilings the
# whole pipeline at roughly 37 matchups/hour, which is what stalls nightly
# integration runs and would make a cold cache take ~300 hours to warm
# (LS-9809). Retrosheet is static files, so the cap does not apply.
#
# The corpus is small: ~135 MiB gzipped across ~102k objects covering
# 1897-2025. Pre-1897 player-seasons are not published by Retrosheet and
# continue to fall back to the scraper.
#
# Data source and attribution -- Retrosheet's terms require that the following
# appear prominently wherever this data (or a product built on it) is
# distributed:
#
#   The information used here was obtained free of charge from and is
#   copyrighted by Retrosheet. Interested parties may contact Retrosheet at
#   "www.retrosheet.org".

resource "aws_s3_bucket" "retrosheet_corpus" {
  bucket = "${local.name_prefix}-retrosheet-corpus"

  tags = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "retrosheet_corpus" {
  bucket = aws_s3_bucket.retrosheet_corpus.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "retrosheet_corpus" {
  bucket = aws_s3_bucket.retrosheet_corpus.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Deliberately NO lifecycle expiration: unlike ci-artifacts, this is a durable
# reference corpus. Historical box scores are immutable, so an object written
# once stays valid indefinitely. Versioning guards against a bad re-ingest
# overwriting good data.
resource "aws_s3_bucket_versioning" "retrosheet_corpus" {
  bucket = aws_s3_bucket.retrosheet_corpus.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Keep non-current versions briefly so a bad re-ingest can be rolled back
# without paying to store every historical revision forever.
resource "aws_s3_bucket_lifecycle_configuration" "retrosheet_corpus" {
  bucket = aws_s3_bucket.retrosheet_corpus.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Read-only access for the stats Lambda. The ingest path (CLI) runs with
# operator credentials and is intentionally not granted write access here --
# the Lambda must never be able to mutate the corpus it reads.
resource "aws_iam_policy" "stats_lambda_retrosheet_read" {
  name        = "${local.name_prefix}-stats-lambda-retrosheet-read"
  description = "Allow the stats Lambda to read the Retrosheet corpus from S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.retrosheet_corpus.arn}/*"
      },
      {
        # Needed so a missing object returns a clean 404 (NoSuchKey) instead of
        # an AccessDenied, which is what lets the provider distinguish "not in
        # the corpus, fall back to scraping" from a real failure.
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.retrosheet_corpus.arn
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "stats_lambda_retrosheet_read" {
  role       = aws_iam_role.stats_lambda.name
  policy_arn = aws_iam_policy.stats_lambda_retrosheet_read.arn
}

output "retrosheet_corpus_bucket" {
  description = "S3 bucket holding the Retrosheet game-stat corpus"
  value       = aws_s3_bucket.retrosheet_corpus.bucket
}
