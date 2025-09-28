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

function Test-ResourceExists {
    param([string]$ResourceType, [string]$ResourceId)
    
    try {
        switch ($ResourceType) {
            "Lambda" {
                aws lambda get-function --function-name $ResourceId --query 'Configuration.FunctionName' --output text 2>$null
                return $LASTEXITCODE -eq 0
            }
            "APIGateway" {
                aws apigateway get-rest-api --rest-api-id $ResourceId --query 'id' --output text 2>$null
                return $LASTEXITCODE -eq 0
            }
            "S3Bucket" {
                aws s3api head-bucket --bucket $ResourceId 2>$null
                return $LASTEXITCODE -eq 0
            }
            "IAMRole" {
                aws iam get-role --role-name $ResourceId --query 'Role.RoleName' --output text 2>$null
                return $LASTEXITCODE -eq 0
            }
        }
    }
    catch {
        return $false
    }
    return $false
}

function Archive-LegacyS3Data {
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
            return $false
        }
    } else {
        Write-Warning "Archive operation cancelled"
        return $false
    }
    
    return $true
}

function Remove-LegacyResources {
    Write-Warning "This will permanently delete legacy AWS resources!"
    Write-Host ""
    Show-LegacyResources
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to delete all legacy resources? This cannot be undone! (type 'DELETE' to confirm)"
    
    if ($confirm -ne 'DELETE') {
        Write-Warning "Cleanup cancelled. No resources were deleted."
        return
    }
    
    Write-Info "Starting cleanup of legacy resources..."
    
    # 1. Remove from Terraform state first (so Terraform doesn't try to manage them)
    Write-Info "Removing resources from Terraform state..."
    
    foreach ($category in $LegacyResources.Keys) {
        foreach ($terraformAddress in $LegacyResources[$category].Values) {
            Write-Host "  Removing $terraformAddress from Terraform state..."
            terraform state rm $terraformAddress
        }
    }
    
    # 2. Delete AWS resources
    Write-Info "Deleting AWS resources..."
    
    # Delete Lambda function
    $lambdaName = "legacy-sports-graphql-dev-graphql"
    if (Test-ResourceExists -ResourceType "Lambda" -ResourceId $lambdaName) {
        Write-Host "  Deleting Lambda function: $lambdaName"
        aws lambda delete-function --function-name $lambdaName
    }
    
    # Delete IAM role
    $roleName = "legacy-sports-graphql-dev-us-east-1-lambdaRole"
    if (Test-ResourceExists -ResourceType "IAMRole" -ResourceId $roleName) {
        Write-Host "  Deleting IAM role: $roleName"
        # First detach policies
        $attachedPolicies = aws iam list-attached-role-policies --role-name $roleName --query 'AttachedPolicies[].PolicyArn' --output text
        foreach ($policy in $attachedPolicies -split '\s+') {
            if ($policy) {
                aws iam detach-role-policy --role-name $roleName --policy-arn $policy
            }
        }
        aws iam delete-role --role-name $roleName
    }
    
    # Delete API Gateways
    foreach ($apiId in @("u65oy98s9d", "89vohxs7ta")) {
        if (Test-ResourceExists -ResourceType "APIGateway" -ResourceId $apiId) {
            Write-Host "  Deleting API Gateway: $apiId"
            aws apigateway delete-rest-api --rest-api-id $apiId
        }
    }
    
    # S3 bucket cleanup (ask for confirmation)
    $bucketName = "legacy-sports-dev-lambdas-f3d4b778"
    if (Test-ResourceExists -ResourceType "S3Bucket" -ResourceId $bucketName) {
        Write-Warning "S3 bucket '$bucketName' still contains data."
        $deleteBucket = Read-Host "Delete bucket and all contents? (y/N)"
        
        if ($deleteBucket -eq 'y' -or $deleteBucket -eq 'Y') {
            Write-Host "  Emptying and deleting S3 bucket: $bucketName"
            aws s3 rm "s3://$bucketName" --recursive
            aws s3 rb "s3://$bucketName"
        } else {
            Write-Warning "S3 bucket '$bucketName' was not deleted (contains data)"
        }
    }
    
    Write-Success "Legacy resource cleanup completed!"
    Write-Info "You may want to run 'terraform plan' to verify no unexpected changes"
}

function Show-Menu {
    Write-Host ""
    Write-Host "🏗️ Legacy Sports - Resource Management" -ForegroundColor Yellow
    Write-Host "=====================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. 📋 List imported legacy resources"
    Write-Host "2. 📦 Archive legacy S3 data to current bucket"
    Write-Host "3. 🗑️ Cleanup legacy resources (DESTRUCTIVE)"
    Write-Host "4. 📊 Show resource status"
    Write-Host "5. 🚪 Exit"
    Write-Host ""
}

function Show-ResourceStatus {
    Write-Info "Checking status of legacy resources..."
    Write-Host ""
    
    foreach ($category in $LegacyResources.Keys) {
        Write-Host "$category Resources:" -ForegroundColor Cyan
        foreach ($resource in $LegacyResources[$category].Keys) {
            $exists = Test-ResourceExists -ResourceType $category -ResourceId $resource
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
    Archive-LegacyS3Data
    exit
}

if ($CleanupLegacy) {
    Remove-LegacyResources
    exit
}

# Interactive menu
while ($true) {
    Show-Menu
    $choice = Read-Host "Select an option (1-5)"
    
    switch ($choice) {
        "1" {
            Show-LegacyResources
        }
        "2" {
            Archive-LegacyS3Data
        }
        "3" {
            Remove-LegacyResources
        }
        "4" {
            Show-ResourceStatus
        }
        "5" {
            Write-Info "Goodbye!"
            exit
        }
        default {
            Write-Warning "Invalid option. Please select 1-5."
        }
    }
    
    Write-Host ""
    Read-Host "Press Enter to continue..."
}
