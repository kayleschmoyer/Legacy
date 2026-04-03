# =============================================================================
# Runner pnpm Store S3 Cache (LS-1663)
# =============================================================================
# Stores a tarball of the pnpm content-addressable store so new runner
# instances can restore a warm cache on boot instead of downloading all
# packages fresh. Cold-start time improvement: typically 3-5 minutes → <30s
# for pnpm install on the first job of a new instance.
#
# Cache key: pnpm-store/latest.tar.gz (rolling — updated after every job)
# Restore: runs during userdata_pre_install, before the runner agent registers
# Sync:    runs in background after each job via runner_hook_job_completed
#
# Bucket name matches the permissions boundary pattern (${prefix}-runner-*)
# so no boundary changes are needed — just the IAM policy below.
# =============================================================================

resource "aws_s3_bucket" "runner_cache" {
  count  = var.enable_github_runners ? 1 : 0
  bucket = "${local.name_prefix}-runner-cache"
  tags   = local.common_tags

  # Ensure the GitHub Actions apply role's IAM policies are updated before
  # creating the bucket to prevent AccessDenied races when s3:CreateBucket
  # permission is added in the same apply as this resource is first created.
  depends_on = [aws_iam_role_policy.github_actions_additional]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "runner_cache" {
  count  = var.enable_github_runners ? 1 : 0
  bucket = aws_s3_bucket.runner_cache[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "runner_cache" {
  count  = var.enable_github_runners ? 1 : 0
  bucket = aws_s3_bucket.runner_cache[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "runner_cache" {
  count  = var.enable_github_runners ? 1 : 0
  bucket = aws_s3_bucket.runner_cache[0].id

  rule {
    id     = "expire-stale-tarballs"
    status = "Enabled"

    filter {}

    # Expire tarballs after 30 days. If no job has run for 30 days the cache
    # is stale and the next boot downloads fresh anyway.
    expiration {
      days = 30
    }

    # Clean up incomplete multipart uploads to avoid orphaned parts accumulating.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ── IAM policy: grant runner EC2 instances access to the cache bucket ────────
# The permissions boundary already permits this bucket (${prefix}-runner-* pattern)
# but the module's runner EC2 role also needs an attached policy granting access.

resource "aws_iam_policy" "runner_cache" {
  count       = var.enable_github_runners ? 1 : 0
  name        = "${local.name_prefix}-runner-cache-access"
  description = "Grants runner EC2 instances read/write access to the pnpm store cache bucket."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "S3CacheObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.runner_cache[0].arn}/*"
      },
      {
        Sid      = "S3CacheBucket"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.runner_cache[0].arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["pnpm-store/*"]
          }
        }
      },
    ]
  })

  tags = local.common_tags

  # Ensure the GitHub Actions apply role's IAM policies are updated before
  # creating this policy to prevent AccessDenied races when iam:CreatePolicy
  # permission is added in the same apply as this resource is first created.
  depends_on = [aws_iam_role_policy.github_actions_additional]
}
