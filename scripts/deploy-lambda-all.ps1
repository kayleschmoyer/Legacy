# Quick Lambda deployment script (PowerShell)
# Usage: .\deploy-lambda-all.ps1 [environment]

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying all Lambda functions to environment: $Environment" -ForegroundColor Green

# Array of Lambda functions to deploy
$Functions = @("graphql", "stats", "oauth-proxy", "game-selection", "draft-processor", "rollbar-discord")

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Deploy each function
foreach ($func in $Functions) {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host "Deploying $func Lambda..." -ForegroundColor Cyan
    Write-Host "==================================" -ForegroundColor Cyan
    
    & "$ScriptDir\deploy-lambda.ps1" -FunctionName $func -Environment $Environment
}

Write-Host ""
Write-Host "✅ All Lambda functions deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "🔄 Final steps:" -ForegroundColor Yellow
Write-Host "   1. Run 'cd terraform/main && terraform plan' to see all updates"
Write-Host "   2. Run 'terraform apply' to deploy all new versions"
