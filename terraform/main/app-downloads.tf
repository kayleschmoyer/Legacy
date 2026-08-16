# LS-9454: Private S3 bucket holding the signed Android APK served by the gated
# download route (parent LS-9452).
#
# Deliberately a separate bucket from ci_artifacts rather than a prefix inside
# it: that bucket's lifecycle rule expires every object after 3 days
# (ci-artifacts.tf), which would silently delete the APK the download route
# depends on. Its shape is the right precedent, its retention is not.
#
# Nothing here is publicly reachable. The oauth-proxy Lambda reads objects to
# mint short-lived presigned URLs after checking the caller against the
# allowlist (LS-9455); GitHub Actions writes them from the Android build.

resource "aws_s3_bucket" "app_downloads" {
  bucket = "${local.name_prefix}-app-downloads"

  tags = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app_downloads" {
  bucket = aws_s3_bucket.app_downloads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "app_downloads" {
  bucket = aws_s3_bucket.app_downloads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# No object-expiration rule: release APKs must stay retrievable for as long as
# the build they belong to is installable. The only rule here reclaims failed
# multipart uploads, which are never a deliverable.
resource "aws_s3_bucket_lifecycle_configuration" "app_downloads" {
  bucket = aws_s3_bucket.app_downloads.id

  rule {
    id     = "abort-incomplete-app-download-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Write access for the Android build workflow, scoped to the android/ prefix.
# Mirrors aws_iam_policy.ci_artifacts: object actions on the prefix, plus a
# prefix-conditioned ListBucket so the workflow can verify its own upload.
resource "aws_iam_policy" "app_downloads_ci" {
  name        = "${local.name_prefix}-app-downloads-ci"
  description = "Allow GitHub Actions to publish signed Android APKs to the app-downloads bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.app_downloads.arn}/android/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.app_downloads.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["android/*"]
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_app_downloads" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.app_downloads_ci.arn
}

# s3:DeleteObject is intentionally omitted above. CI publishes new versioned
# keys and overwrites the `current` pointer; it never needs to remove a
# previously published build, and withholding delete keeps a compromised
# workflow token from erasing the download history.
