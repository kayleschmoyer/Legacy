# Lambda Deployment Script for S3-based deployments (PowerShell)
# This script builds, packages, and uploads Lambda functions to S3
# Usage: .\deploy-lambda.ps1 <function-name> [environment]

param(
    [Parameter(Mandatory=$true)]
    [string]$FunctionName,
    
    [Parameter(Mandatory=$false)]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [string]$AwsRegion = "us-east-1"
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Function to create version string
function New-Version {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    try {
        $commitSha = git rev-parse --short HEAD 2>$null
    } catch {
        $commitSha = "unknown"
    }
    return "${timestamp}-${commitSha}"
}

# Function to get S3 bucket name
function Get-S3Bucket {
    try {
        $bucket = aws ssm get-parameter --name "/legacy-sports/${Environment}/s3/lambda-deployments-bucket" --query "Parameter.Value" --output text 2>$null
        if ($bucket -and $bucket -ne "None") {
            return $bucket
        }
    } catch {
        # Try terraform output as fallback
        try {
            $bucket = terraform output -raw lambda_deployments_bucket_name 2>$null
            if ($bucket) {
                return $bucket
            }
        } catch {
            Write-Error "Could not determine S3 bucket name. Make sure Terraform is applied or SSM parameter exists."
        }
    }
    Write-Error "Could not determine S3 bucket name"
}

# Function-specific configurations
switch ($FunctionName) {
    "graphql" {
        $LambdaDir = "lambdas/db"
        $BuildCommand = "npm run build"
        $DistDir = "dist"
        $SsmParam = "/legacy-sports/${Environment}/lambda/graphql/version"
    }
    "stats" {
        $LambdaDir = "lambdas/stats-lambda"
        $BuildCommand = "npx nx run stats-lambda:build"
        $DistDir = "dist"
        $SsmParam = "/legacy-sports/${Environment}/lambda/stats/version"
    }
    "oauth-proxy" {
        $LambdaDir = "lambdas/oauth-proxy"
        $BuildCommand = "npx nx run oauth-proxy:build"
        $DistDir = "dist"
        $SsmParam = "/legacy-sports/${Environment}/lambda/oauth-proxy/version"
    }
    "game-selection" {
        $LambdaDir = "lambdas/game-selection"
        $BuildCommand = "npx nx run game-selection:build"
        $DistDir = "dist"
        $SsmParam = "/legacy-sports/${Environment}/lambda/game-selection/version"
    }
    default {
        Write-Error "Unknown function name '$FunctionName'. Available functions: graphql, stats, oauth-proxy, game-selection"
    }
}

Write-Host "🚀 Deploying Lambda function: $FunctionName" -ForegroundColor Green
Write-Host "Environment: $Environment"
Write-Host "Lambda directory: $LambdaDir"

# Check if directory exists
if (-not (Test-Path $LambdaDir)) {
    Write-Error "Lambda directory '$LambdaDir' does not exist"
}

# Create version
$Version = New-Version
Write-Host "Version: $Version"

# Get S3 bucket name
$S3Bucket = Get-S3Bucket
Write-Host "S3 Bucket: $S3Bucket"

# Build the Lambda
Write-Host "📦 Building Lambda function..." -ForegroundColor Yellow
Push-Location $LambdaDir
try {
    Invoke-Expression $BuildCommand
} catch {
    Write-Error "Build failed: $($_.Exception.Message)"
}

# Verify build output exists
if (-not (Test-Path $DistDir)) {
    Write-Error "Build directory '$DistDir' does not exist after build"
}

# Create deployment package
Write-Host "📦 Creating deployment package..." -ForegroundColor Yellow
$PackageName = "${FunctionName}-${Version}.zip"

# Remove existing package if it exists
if (Test-Path $PackageName) {
    Remove-Item $PackageName -Force
}

# Create ZIP package
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory("$PWD\$DistDir", "$PWD\$PackageName")

# Upload to S3
Write-Host "☁️ Uploading to S3..." -ForegroundColor Cyan
$S3Key = "${FunctionName}/${PackageName}"
aws s3 cp $PackageName "s3://${S3Bucket}/${S3Key}" --region $AwsRegion

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to upload to S3"
}

# Update SSM parameter with new version
Write-Host "🔄 Updating SSM parameter..." -ForegroundColor Cyan
aws ssm put-parameter --name $SsmParam --value $Version --overwrite --region $AwsRegion

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to update SSM parameter"
}

# Cleanup local package
Remove-Item $PackageName -Force

Pop-Location

Write-Host "✅ Lambda deployment completed successfully!" -ForegroundColor Green
Write-Host "   Function: $FunctionName"
Write-Host "   Version: $Version"
Write-Host "   S3 Location: s3://${S3Bucket}/${S3Key}"
Write-Host "   SSM Parameter: $SsmParam"
Write-Host ""
Write-Host "🔄 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Run 'terraform plan' to see Lambda function updates"
Write-Host "   2. Run 'terraform apply' to deploy the new version"