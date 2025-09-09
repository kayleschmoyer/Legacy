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

# Lambda layer removed - oauth-proxy serverless.yml defines its own pg layer
# Lambda execution roles removed - Serverless Framework creates IAM roles automatically

# Lambda functions removed - Serverless Framework handles Lambda deployment
# Each service (oauth-proxy, db/graphql, stats-lambda) manages its own Lambda functions via serverless.yml

# Keep only shared infrastructure resources like S3 bucket and IAM roles









# Stats Lambda function removed - handled by stats-lambda serverless.yml
# The SQS event source mapping and IAM roles are managed by Serverless Framework

# CloudWatch Log Groups removed - Serverless Framework creates these automatically
