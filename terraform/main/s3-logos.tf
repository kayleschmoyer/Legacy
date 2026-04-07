# =============================================================================
# S3 Bucket — Team Logo Images
# Stores team avatar and banner images uploaded via the image-upload Lambda.
# Objects are publicly readable so they can be used as team branding URLs.
# =============================================================================

resource "random_id" "logos_bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "team_logos" {
  bucket = "${local.name_prefix}-team-logos-${random_id.logos_bucket_suffix.hex}"

  tags = merge(local.common_tags, {
    Component = "team-logos"
  })
}

resource "aws_s3_bucket_versioning" "team_logos" {
  bucket = aws_s3_bucket.team_logos.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "team_logos" {
  bucket = aws_s3_bucket.team_logos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Allow public read access for logo images
resource "aws_s3_bucket_public_access_block" "team_logos" {
  bucket = aws_s3_bucket.team_logos.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "team_logos_public_read" {
  bucket = aws_s3_bucket.team_logos.id

  depends_on = [aws_s3_bucket_public_access_block.team_logos]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.team_logos.arn}/*"
      }
    ]
  })
}

# CORS configuration so web browsers can access images cross-origin
resource "aws_s3_bucket_cors_configuration" "team_logos" {
  bucket = aws_s3_bucket.team_logos.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["https://${var.domain_name}", "https://www.${var.domain_name}"]
    expose_headers  = []
    max_age_seconds = 86400
  }
}

# Lifecycle policy: delete objects older than 1 year to control storage costs
resource "aws_s3_bucket_lifecycle_configuration" "team_logos" {
  bucket = aws_s3_bucket.team_logos.id

  rule {
    id     = "expire-old-logos"
    status = "Enabled"

    expiration {
      days = 365
    }
  }
}

# SSM parameter so other resources and CI/CD can look up the bucket name
resource "aws_ssm_parameter" "team_logos_bucket_name" {
  name        = "/legacy-sports/${var.environment}/s3/team-logos-bucket"
  description = "S3 bucket name for team logo images"
  type        = "String"
  value       = aws_s3_bucket.team_logos.bucket

  tags = merge(local.common_tags, {
    Component = "team-logos"
  })
}
