# LS-3861: S3 bucket for CI reviewer JSONL telemetry.
# One JSONL line per review run stored at reviews/{pr}/{sha}/{ts}-cycle{n}.jsonl.
# Write access is granted to the CI artifacts OIDC role (any branch + pull_request).
# Read access follows the standard project-bucket model: the GitHub Actions plan role
# has s3:GetObject on all ${local.name_prefix}-* buckets (github-actions-oidc.tf S3Read
# statement), so Terraform plan jobs and any workflow assuming that role can read records.

resource "aws_s3_bucket" "reviewer_telemetry" {
  bucket = "${local.name_prefix}-reviewer-telemetry"

  tags = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reviewer_telemetry" {
  bucket = aws_s3_bucket.reviewer_telemetry.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "reviewer_telemetry" {
  bucket = aws_s3_bucket.reviewer_telemetry.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "reviewer_telemetry" {
  bucket = aws_s3_bucket.reviewer_telemetry.id

  rule {
    id     = "expire-reviewer-telemetry"
    status = "Enabled"

    filter {
      prefix = "reviews/"
    }

    expiration {
      days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Write-only policy: reviewer workflow can upload records; no read or delete.
resource "aws_iam_policy" "reviewer_telemetry" {
  name        = "${local.name_prefix}-reviewer-telemetry"
  description = "Allow CI reviewer workflow to write JSONL telemetry to S3 via OIDC (write-only, not human-accessible)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.reviewer_telemetry.arn}/reviews/*"
      }
    ]
  })

  tags = local.common_tags
}

# Attach to the existing ci_artifacts OIDC role (trusts any branch + pull_request).
resource "aws_iam_role_policy_attachment" "ci_artifacts_reviewer_telemetry" {
  role       = aws_iam_role.ci_artifacts.name
  policy_arn = aws_iam_policy.reviewer_telemetry.arn
}

output "reviewer_telemetry_bucket_name" {
  description = "S3 bucket name for CI reviewer JSONL telemetry records"
  value       = aws_s3_bucket.reviewer_telemetry.bucket
  sensitive   = false
}
