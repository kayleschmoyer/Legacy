# Legacy Sports - Resource Import and Cleanup Script
# This script helps manage the discovery, import, and cleanup of legacy AWS resources

param(
    [switch]$ListLegacyResources,
    [switch]$CleanupLegacy,
    [switch]$ArchiveLegacyData,
    [string]$Action = ""
)

$ErrorActionPreference = "Stop"

# Color functions for better output
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "⚠️ $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "ℹ️ $Message" -ForegroundColor Cyan }

# Legacy resources that were imported
$LegacyResources = @{
    "Lambda" = @{
        "legacy-sports-graphql-dev-graphql" = "aws_lambda_function.legacy_graphql"
    }
    "IAMRole" = @{
        "legacy-sports-graphql-dev-us-east-1-lambdaRole" = "aws_iam_role.legacy_graphql_lambda"
    }
    "S3Bucket" = @{
        "legacy-sports-dev-lambdas-f3d4b778" = "aws_s3_bucket.legacy_lambda_deployments"
    }
    "APIGateway" = @{
        "u65oy98s9d" = "aws_api_gateway_rest_api.legacy_main"
        "89vohxs7ta" = "aws_api_gateway_rest_api.serverless_graphql"
    }
}

function Show-LegacyResources {
    Write-Host "🔍 Legacy Resources Currently Managed by Terraform:" -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($category in $LegacyResources.Keys) {
        Write-Host "$category Resources:" -ForegroundColor Cyan
        foreach ($resource in $LegacyResources[$category].Keys) {
            $terraformAddress = $LegacyResources[$category][$resource]
            Write-Host "  • $resource → $terraformAddress" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

function Show-ResourceStatus {
    Write-Info "Checking status of legacy resources..."
    Write-Host ""
    
    foreach ($category in $LegacyResources.Keys) {
        Write-Host "$category Resources:" -ForegroundColor Cyan
        foreach ($resource in $LegacyResources[$category].Keys) {
            try {
                switch ($category) {
                    "Lambda" {
                        aws lambda get-function --function-name $resource --query 'Configuration.FunctionName' --output text 2>$null | Out-Null
                        $exists = $LASTEXITCODE -eq 0
                    }
                    "APIGateway" {
                        aws apigateway get-rest-api --rest-api-id $resource --query 'id' --output text 2>$null | Out-Null
                        $exists = $LASTEXITCODE -eq 0
                    }
                    "S3Bucket" {
                        aws s3api head-bucket --bucket $resource 2>$null | Out-Null
                        $exists = $LASTEXITCODE -eq 0
                    }
                    "IAMRole" {
                        aws iam get-role --role-name $resource --query 'Role.RoleName' --output text 2>$null | Out-Null
                        $exists = $LASTEXITCODE -eq 0
                    }
                    default {
                        $exists = $false
                    }
                }
            }
            catch {
                $exists = $false
            }
            
            $status = if ($exists) { "✅ EXISTS" } else { "❌ NOT FOUND" }
            $color = if ($exists) { "Green" } else { "Red" }
            Write-Host "  $resource - $status" -ForegroundColor $color
        }
        Write-Host ""
    }
}

# Main script logic
if ($ListLegacyResources) {
    Show-LegacyResources
    exit
}

if ($ArchiveLegacyData) {
    $legacyBucket = "legacy-sports-dev-lambdas-f3d4b778"
    $currentBucket = "legacy-sports-dev-lambdas-cca20ad9"
    
    Write-Info "Archiving data from legacy S3 bucket to current bucket..."
    
    # Create archive folder in current bucket
    $archivePrefix = "archived-from-legacy-$(Get-Date -Format 'yyyy-MM-dd')"
    
    # List contents of legacy bucket
    Write-Host "Contents of legacy bucket:"
    aws s3 ls "s3://$legacyBucket/" --recursive --human-readable
    
    Write-Host ""
    $confirm = Read-Host "Do you want to copy all contents to the current bucket under '$archivePrefix/' ? (y/N)"
    
    if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        Write-Info "Copying legacy bucket contents to current bucket..."
        aws s3 cp "s3://$legacyBucket/" "s3://$currentBucket/$archivePrefix/" --recursive
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Successfully archived legacy bucket contents"
            Write-Info "Contents are now available at: s3://$currentBucket/$archivePrefix/"
        } else {
            Write-Error "Failed to archive legacy bucket contents"
        }
    } else {
        Write-Warning "Archive operation cancelled"
    }
    exit
}

if ($CleanupLegacy) {
    Write-Warning "This will permanently delete legacy AWS resources!"
    Write-Host ""
    Show-LegacyResources
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to delete all legacy resources? This cannot be undone! (type 'DELETE' to confirm)"
    
    if ($confirm -ne 'DELETE') {
        Write-Warning "Cleanup cancelled. No resources were deleted."
        exit
    }
    
    Write-Info "Starting cleanup of legacy resources..."
    Write-Warning "This feature is not yet implemented for safety reasons."
    Write-Info "Please manually delete resources after verifying they're no longer needed."
    exit
}

# If no parameters provided, show status
Write-Host "🏗️ Legacy Sports - Resource Management" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Usage:"
Write-Host "  .\manage-legacy-resources.ps1 -ListLegacyResources    # Show imported resources"
Write-Host "  .\manage-legacy-resources.ps1 -ArchiveLegacyData     # Archive S3 data"
Write-Host "  .\manage-legacy-resources.ps1 -CleanupLegacy         # Cleanup resources (careful!)"
Write-Host ""

Show-ResourceStatus
