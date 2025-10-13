# Script to fix S3 bucket permissions for GitHub Actions
# Run this locally to grant the GitHub Actions role access to the Terraform state bucket

$ErrorActionPreference = "Stop"

$BUCKET_NAME = "legacy-sports-terraform-state"
$GITHUB_ROLE_ARN = "arn:aws:iam::176661590736:role/legacy-sports-dev-github-actions"
$REGION = "us-east-1"

Write-Host "Applying bucket policy to allow GitHub Actions access..." -ForegroundColor Cyan

$policyJson = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowGitHubActionsAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "$GITHUB_ROLE_ARN"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    },
    {
      "Sid": "AllowGitHubActionsListBucket",
      "Effect": "Allow",
      "Principal": {
        "AWS": "$GITHUB_ROLE_ARN"
      },
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::$BUCKET_NAME"
    }
  ]
}
"@

# Write policy to temporary file to avoid command-line escaping issues
$tempFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tempFile, $policyJson, [System.Text.UTF8Encoding]::new($false))

aws s3api put-bucket-policy `
    --bucket $BUCKET_NAME `
    --region $REGION `
    --policy "file://$tempFile"

# Clean up temp file
Remove-Item $tempFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Bucket policy applied successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The GitHub Actions role can now access the Terraform state bucket."
} else {
    Write-Host "Error: Failed to apply bucket policy" -ForegroundColor Red
    exit 1
}
