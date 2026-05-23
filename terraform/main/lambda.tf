# S3 Bucket for Lambda deployment packages
resource "aws_s3_bucket" "lambda_deployments" {
  bucket = "${local.name_prefix}-lambdas-${random_id.bucket_suffix.hex}"

  tags = local.common_tags
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_versioning" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy to manage old Lambda package versions
resource "aws_s3_bucket_lifecycle_configuration" "lambda_deployments" {
  bucket = aws_s3_bucket.lambda_deployments.id

  rule {
    id     = "lambda_artifacts_cleanup"
    status = "Enabled"

    # Apply to all objects in the bucket
    filter {}

    # Keep current versions but clean up old ones
    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# IAM policy for CI/CD to upload Lambda packages
resource "aws_iam_policy" "lambda_deployment_policy" {
  name        = "${local.name_prefix}-lambda-deployment"
  description = "Policy for CI/CD to upload Lambda packages and update SSM parameters"

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
          aws_s3_bucket.lambda_deployments.arn,
          "${aws_s3_bucket.lambda_deployments.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:PutParameter",
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = [
          "arn:aws:ssm:${local.region}:${local.account_id}:parameter/legacy-sports/${var.environment}/lambda/*/version"
        ]
      }
    ]
  })

  tags = local.common_tags
}

# Lambda layer removed - oauth-proxy serverless.yml defines its own pg layer
# Lambda execution roles removed - Serverless Framework creates IAM roles automatically

# Lambda functions removed - Serverless Framework handles Lambda deployment
# Each service (oauth-proxy, db/graphql, stats-lambda) manages its own Lambda functions via serverless.yml

# Keep only shared infrastructure resources like S3 bucket and IAM roles









# Stats Lambda function removed - handled by stats-lambda serverless.yml
# The SQS event source mapping and IAM roles are managed by Serverless Framework

# CloudWatch Log Groups removed - Serverless Framework creates these automatically

# Legacy S3 bucket and configurations (DECOMMISSIONED on September 26, 2025)
# Successfully destroyed and replaced with the new deployment bucket:
# - aws_s3_bucket.legacy_lambda_deployments (legacy-sports-dev-lambdas-f3d4b778)
# - aws_s3_bucket_versioning.legacy_lambda_deployments
# - aws_s3_bucket_server_side_encryption_configuration.legacy_lambda_deployments  
# - aws_s3_bucket_public_access_block.legacy_lambda_deployments
# 
# The new deployment bucket is: aws_s3_bucket.lambda_deployments
