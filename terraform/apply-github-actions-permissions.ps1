# Script to apply GitHub Actions IAM policy updates
# This grants the GitHub Actions role the necessary permissions for Terraform state locking

$ErrorActionPreference = "Stop"

Write-Host "Applying GitHub Actions IAM policy updates..." -ForegroundColor Cyan

Set-Location -Path $PSScriptRoot

# Apply only the GitHub Actions role and policy changes
terraform apply -target="aws_iam_role.github_actions" -target="aws_iam_role_policy.github_actions_additional" -target="aws_iam_role_policy_attachment.github_actions_lambda_deployment" -auto-approve

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! GitHub Actions IAM policies updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The GitHub Actions role now has permissions for:"
    Write-Host "  - S3 bucket access (Terraform state)"
    Write-Host "  - DynamoDB table access (state locking)"
    Write-Host "  - Lambda deployments"
} else {
    Write-Host "Error: Failed to apply IAM policy updates" -ForegroundColor Red
    exit 1
}
