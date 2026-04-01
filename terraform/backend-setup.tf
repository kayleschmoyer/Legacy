# This file creates the S3 bucket and DynamoDB table needed for Terraform state management
# 
# IMPORTANT: This is a bootstrap configuration
# 
# Initial Setup (one-time only):
# 1. Comment out the backend block in main.tf
# 2. Run: terraform init
# 3. Run: terraform apply -target=aws_s3_bucket.terraform_state -target=aws_dynamodb_table.terraform_locks
# 4. Uncomment the backend block in main.tf
# 5. Run: terraform init -migrate-state
# 6. Answer "yes" to migrate the local state to S3
#
# After initial setup, the backend will be managed automatically.

resource "aws_s3_bucket" "terraform_state" {
  bucket = "legacy-sports-terraform-state"

  # Prevent accidental deletion of this bucket
  lifecycle {
    prevent_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name        = "Terraform State Storage"
      Description = "Stores Terraform state files for legacy-sports infrastructure"
    }
  )
}

# Enable versioning to keep history of state files
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy to allow GitHub Actions role to access state
resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowGitHubActionsAccess"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.github_actions.arn
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.terraform_state.arn}/*"
      },
      {
        Sid    = "AllowGitHubActionsListBucket"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.github_actions.arn
        }
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.terraform_state.arn
      }
    ]
  })
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-state-locks"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Prevent accidental deletion of this table
  lifecycle {
    prevent_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name        = "Terraform State Locks"
      Description = "Prevents concurrent Terraform runs from corrupting state"
    }
  )
}

# Store the backend configuration in SSM for reference
resource "aws_ssm_parameter" "terraform_state_bucket" {
  name        = "/legacy-sports/${var.environment}/terraform/state-bucket"
  description = "S3 bucket name for Terraform state storage"
  type        = "String"
  value       = aws_s3_bucket.terraform_state.id

  tags = local.common_tags
}

resource "aws_ssm_parameter" "terraform_lock_table" {
  name        = "/legacy-sports/${var.environment}/terraform/lock-table"
  description = "DynamoDB table name for Terraform state locking"
  type        = "String"
  value       = aws_dynamodb_table.terraform_locks.id

  tags = local.common_tags
}
