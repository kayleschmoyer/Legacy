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
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-reviewer-telemetry-"
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

  lifecycle {
    create_before_destroy = true
  }
}

# Attach to the existing ci_artifacts OIDC role (trusts any branch + pull_request).
resource "aws_iam_role_policy_attachment" "ci_artifacts_reviewer_telemetry" {
  role       = aws_iam_role.ci_artifacts.name
  policy_arn = aws_iam_policy.reviewer_telemetry.arn

  # Paired with create_before_destroy on the policy above: the new attachment is
  # made before the old one is removed, so the role is never left without this
  # policy mid-apply. Added by hand -- this attachment's resource name does not
  # match the policy's, so scratch/convert-iam-policy.py deliberately refuses it
  # rather than converting the policy and leaving the attachment behind.
  lifecycle {
    create_before_destroy = true
  }
}

output "reviewer_telemetry_bucket_name" {
  description = "S3 bucket name for CI reviewer JSONL telemetry records"
  value       = aws_s3_bucket.reviewer_telemetry.bucket
  sensitive   = false
}
