#!/bin/bash
# Script to fix S3 bucket permissions for GitHub Actions
# Run this locally to grant the GitHub Actions role access to the Terraform state bucket

set -e

BUCKET_NAME="legacy-sports-terraform-state"
GITHUB_ROLE_ARN="arn:aws:iam::176661590736:role/legacy-sports-dev-github-actions"
REGION="us-east-1"

echo "🔧 Applying bucket policy to allow GitHub Actions access..."

aws s3api put-bucket-policy \
  --bucket "$BUCKET_NAME" \
  --region "$REGION" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"AllowGitHubActionsAccess\",
        \"Effect\": \"Allow\",
        \"Principal\": {
          \"AWS\": \"$GITHUB_ROLE_ARN\"
        },
        \"Action\": [
          \"s3:GetObject\",
          \"s3:PutObject\",
          \"s3:DeleteObject\"
        ],
        \"Resource\": \"arn:aws:s3:::$BUCKET_NAME/*\"
      },
      {
        \"Sid\": \"AllowGitHubActionsListBucket\",
        \"Effect\": \"Allow\",
        \"Principal\": {
          \"AWS\": \"$GITHUB_ROLE_ARN\"
        },
        \"Action\": \"s3:ListBucket\",
        \"Resource\": \"arn:aws:s3:::$BUCKET_NAME\"
      }
    ]
  }"

echo "✅ Bucket policy applied successfully!"
echo ""
echo "The GitHub Actions role can now access the Terraform state bucket."
