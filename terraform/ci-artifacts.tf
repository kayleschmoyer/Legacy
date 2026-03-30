# LS-1963: S3 bucket for CI artifact handoffs between workflow jobs.
# Replaces GitHub Actions artifacts which share a limited storage quota.
# Objects auto-expire after 3 days via lifecycle policy.

resource "aws_s3_bucket" "ci_artifacts" {
  bucket = "${local.name_prefix}-ci-artifacts"

  tags = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ci_artifacts" {
  bucket = aws_s3_bucket.ci_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "ci_artifacts" {
  bucket = aws_s3_bucket.ci_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "ci_artifacts" {
  bucket = aws_s3_bucket.ci_artifacts.id

  rule {
    id     = "expire-ci-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 3
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# IAM policy for GitHub Actions to read/write CI artifacts
resource "aws_iam_policy" "ci_artifacts" {
  name        = "${local.name_prefix}-ci-artifacts"
  description = "Allow GitHub Actions to upload/download CI artifact handoffs via S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.ci_artifacts.arn,
          "${aws_s3_bucket.ci_artifacts.arn}/*"
        ]
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_ci_artifacts" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.ci_artifacts.arn
}
