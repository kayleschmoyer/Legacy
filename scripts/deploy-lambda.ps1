#Requires -Version 5.1

param(
    [Parameter(Mandatory = $true)]
    [string]$FunctionName,
    
    [Parameter(Mandatory = $false)]
    [string]$Environment = 'dev',
    
    [Parameter(Mandatory = $false)]
    [string]$AwsRegion = 'us-east-1'
)

# Set strict mode and error handling
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Store original location for cleanup
$OriginalLocation = Get-Location

# Setup cleanup trap
trap {
    Write-Host "Error occurred: $_" -ForegroundColor Red
    try {
        Pop-Location -ErrorAction SilentlyContinue
    } catch {
        Set-Location $OriginalLocation -ErrorAction SilentlyContinue
    }
    exit 1
}

Write-Host "🚀 Starting Lambda deployment for: $FunctionName" -ForegroundColor Green

# Function-specific configurations
switch ($FunctionName) {
    { $_ -in @('graphql', 'db') } {
        $LambdaDir = 'lambdas/db'
        $SsmParam = "/legacy-sports/${Environment}/lambda/graphql/version"
    }
    'stats' {
        $LambdaDir = 'lambdas/stats-lambda'
        $SsmParam = "/legacy-sports/${Environment}/lambda/stats/version"
    }
    'oauth-proxy' {
        $LambdaDir = 'lambdas/oauth-proxy'
        $SsmParam = "/legacy-sports/${Environment}/lambda/oauth-proxy/version"
    }
    'game-selection' {
        $LambdaDir = 'lambdas/game-selection'
        $SsmParam = "/legacy-sports/${Environment}/lambda/game-selection/version"
    }
    default {
        Write-Error "Unknown function name '$FunctionName'. Available: graphql, db, stats, oauth-proxy, game-selection"
    }
}

# Step 1: Build the lambda
Write-Host '📦 Step 1: Building lambda...' -ForegroundColor Yellow
if ($FunctionName -in @('graphql', 'db')) {
    # DB lambda is already built via nx
    Write-Host 'Using pre-built lambda (already compiled via nx)' -ForegroundColor Green
} else {
    # Build other lambdas
    npx nx run "${LambdaDir}:build"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed for $FunctionName"
    }
    Write-Host 'Build completed successfully' -ForegroundColor Green
}

# Step 2: Get S3 bucket
Write-Host '🪣 Step 2: Getting S3 bucket...' -ForegroundColor Yellow
try {
    $S3Bucket = aws ssm get-parameter --name "/legacy-sports/${Environment}/s3/lambda-deployments-bucket" --query 'Parameter.Value' --output text 2>$null
    if (-not $S3Bucket -or $S3Bucket -eq 'None') {
        Write-Host 'SSM parameter not found, trying Terraform output...' -ForegroundColor Yellow
        Push-Location terraform
        $S3Bucket = terraform output -raw lambda_deployment_bucket 2>$null
        Pop-Location
    }
    Write-Host "S3 Bucket: $S3Bucket" -ForegroundColor Green
} catch {
    Write-Error 'Could not determine S3 bucket name'
}

# Step 3: Create deployment package
Write-Host '📦 Step 3: Creating deployment package...' -ForegroundColor Yellow
$Version = Get-Date -Format 'yyyyMMdd-HHmmss'
try {
    $CommitSha = git rev-parse --short HEAD 2>$null
    $Version = "${Version}-${CommitSha}"
} catch {
    # Git not available, use timestamp only
}

$PackageName = "${FunctionName}-${Version}.zip"

# Change to lambda directory
Push-Location $LambdaDir
Write-Host "Working in: $(Get-Location)"

# Create zip from dist directory
if (-not (Test-Path 'dist')) {
    Write-Error "Dist directory not found in $LambdaDir"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory("$(Get-Location)\dist", "$(Get-Location)\$PackageName")
Write-Host "Created package: $PackageName" -ForegroundColor Green

# Step 4: Upload to S3
Write-Host '☁️ Step 4: Uploading to S3...' -ForegroundColor Yellow
$S3Key = "$FunctionName/$PackageName"
aws s3 cp $PackageName "s3://$S3Bucket/$S3Key" --region $AwsRegion

if ($LASTEXITCODE -ne 0) {
    Write-Error 'Failed to upload to S3'
}
Write-Host "Uploaded to: s3://$S3Bucket/$S3Key" -ForegroundColor Green

# Step 5: Update SSM parameter
Write-Host '🔄 Step 5: Updating version parameter...' -ForegroundColor Yellow
aws ssm put-parameter --name $SsmParam --value $Version --type String --overwrite --region $AwsRegion

if ($LASTEXITCODE -ne 0) {
    Write-Error 'Failed to update SSM parameter'
}
Write-Host "Updated parameter: $SsmParam = $Version" -ForegroundColor Green

# Cleanup
Remove-Item $PackageName -Force -ErrorAction SilentlyContinue
Pop-Location

Write-Host '✅ Deployment completed successfully!' -ForegroundColor Green
Write-Host "Next: Run 'terraform apply' to deploy version $Version"