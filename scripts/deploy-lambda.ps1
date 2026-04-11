#Requires -Version 5.1

param(
    [Parameter(Mandatory = $true)]
    [string]$FunctionName,
    
    [Parameter(Mandatory = $false)]
    [string]$Environment = 'dev',
    
    [Parameter(Mandatory = $false)]
    [string]$AwsRegion = 'us-east-1'
)

# Set error handling (removing strict mode to avoid issues)
$ErrorActionPreference = 'Stop'

# Store original location for cleanup
$OriginalLocation = Get-Location

Write-Host "🚀 Starting Lambda deployment for: $FunctionName" -ForegroundColor Green

# Function-specific configurations
switch ($FunctionName) {
    'graphql' {
        $LambdaDir = 'lambdas/db'
        $ProjectName = 'db'
        $SsmParam = "/legacy-sports/${Environment}/lambda/graphql/version"
    }
    'stats' {
        $LambdaDir = 'lambdas/stats-lambda'
        $ProjectName = 'stats-lambda'
        $SsmParam = "/legacy-sports/${Environment}/lambda/stats/version"
    }
    'oauth-proxy' {
        $LambdaDir = 'lambdas/oauth-proxy'
        $ProjectName = 'oauth-proxy'
        $SsmParam = "/legacy-sports/${Environment}/lambda/oauth-proxy/version"
    }
    'game-selection' {
        $LambdaDir = 'lambdas/game-selection'
        $ProjectName = 'game-selection'
        $SsmParam = "/legacy-sports/${Environment}/lambda/game-selection/version"
    }
    'draft-processor' {
        $LambdaDir = 'lambdas/draft-processor'
        $ProjectName = 'draft-processor'
        $SsmParam = "/legacy-sports/${Environment}/lambda/draft-processor/version"
    }
    'websocket' {
        $LambdaDir = 'lambdas/websocket'
        $ProjectName = 'websocket'
        $SsmParam = "/legacy-sports/${Environment}/lambda/websocket/version"
    }
    'stripe-webhook' {
        $LambdaDir = 'lambdas/stripe-webhook'
        $ProjectName = 'stripe-webhook'
        $SsmParam = "/legacy-sports/${Environment}/lambda/stripe-webhook/version"
    }
    'rollbar-discord' {
        $LambdaDir = 'lambdas/rollbar-discord'
        $ProjectName = 'rollbar-discord'
        $SsmParam = "/legacy-sports/${Environment}/lambda/rollbar-discord/version"
    }
    'github-webhook' {
        $LambdaDir = 'lambdas/github-webhook'
        $ProjectName = 'github-webhook'
        $SsmParam = "/legacy-sports/${Environment}/lambda/github-webhook/version"
    }
    default {
        Write-Error "Unknown function name '$FunctionName'. Available: graphql, stats, oauth-proxy, game-selection, draft-processor, websocket, stripe-webhook, rollbar-discord, github-webhook"
    }
}

# Step 1: Build the lambda
Write-Host '📦 Step 1: Building lambda...' -ForegroundColor Yellow
if ($FunctionName -eq 'graphql') {
    # GraphQL lambda (db project) is already built via nx
    Write-Host 'Using pre-built lambda (already compiled via nx)' -ForegroundColor Green
} else {
    # Build other lambdas using the correct project name
    pnpm exec nx run "${ProjectName}:build"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed for $ProjectName"
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

# Determine dist directory location
$LocationPushed = $false
if ($FunctionName -eq 'websocket') {
    # Websocket lambda uses root-level dist
    $DistPath = "dist/lambdas/websocket"
    Write-Host "Using dist path: $DistPath"
} else {
    # Other lambdas have dist in their directory
    Push-Location $LambdaDir
    $LocationPushed = $true
    Write-Host "Working in: $(Get-Location)"
    $DistPath = "dist"
}

# Create zip from dist directory
if (-not (Test-Path $DistPath)) {
    Write-Error "Dist directory not found at $DistPath"
}

# Create version info file in dist directory for inclusion in package
$DeployTimestamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ'
$VersionInfo = @{
    version = $Version
    gitCommit = $CommitSha
    deployedAt = $DeployTimestamp
    environment = $Environment
} | ConvertTo-Json -Depth 2

$VersionInfo | Out-File -FilePath "$DistPath/version-info.json" -Encoding UTF8
Write-Host "Created version info: $Version (commit: $CommitSha)" -ForegroundColor Cyan

Add-Type -AssemblyName System.IO.Compression.FileSystem
$FullDistPath = (Resolve-Path $DistPath).Path
$ZipPath = Join-Path (Get-Location) $PackageName
[System.IO.Compression.ZipFile]::CreateFromDirectory($FullDistPath, $ZipPath)
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
if ($LocationPushed) {
    Pop-Location
}

Write-Host '✅ Deployment completed successfully!' -ForegroundColor Green
Write-Host "Next: Run 'terraform apply' to deploy version $Version" -ForegroundColor Cyan
