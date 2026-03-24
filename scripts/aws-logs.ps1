#!/usr/bin/env pwsh
<#
.SYNOPSIS
    View AWS CloudWatch logs for Lambda functions with proper encoding

.DESCRIPTION
    Wrapper script for AWS CLI logs with proper encoding configuration
    to avoid Unicode/emoji errors and pagination issues.

.PARAMETER Function
    Lambda function name (without prefix/suffix)
    Examples: graphql, db, oauth-proxy, stats, game-selection

.PARAMETER Since
    Time range for logs. Examples: 5m, 1h, 2d

.PARAMETER Follow
    Follow logs in real-time

.PARAMETER Filter
    Filter pattern for log messages

.PARAMETER Environment
    Environment (dev or prod). Default: dev

.EXAMPLE
    .\scripts\aws-logs.ps1 -Function graphql -Since 1h

.EXAMPLE
    .\scripts\aws-logs.ps1 -Function stats -Since 30m -Filter "ERROR"

.EXAMPLE
    .\scripts\aws-logs.ps1 -Function db -Follow
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('graphql', 'db', 'oauth-proxy', 'notifications', 'stats', 'stats-lambda', 'game-selection', 'draft-processor', 'websocket', 'apple-iap', 'stripe-webhook', 'rollbar-discord')]
    [string]$Function,
    
    [string]$Since = "1h",
    
    [string]$Filter,
    
    [switch]$Follow,
    
    [ValidateSet('dev', 'prod')]
    [string]$Environment = 'dev'
)

# Configure AWS CLI environment variables
# These prevent common errors when viewing logs
$env:AWS_PAGER = ""                # Disable pagination that causes ---more--- prompts
$env:PYTHONIOENCODING = "utf-8"    # Handle Unicode characters and emojis in logs

# Normalize function name (actual AWS log group names)
$functionName = $Function
if ($Function -eq 'stats-lambda') {
    # Allow both 'stats' and 'stats-lambda' to work, but actual log group is 'stats'
    $functionName = 'stats'
}

# Construct log group name
$logGroup = "/aws/lambda/legacy-sports-$Environment-$functionName"

Write-Host "Viewing logs for: $logGroup" -ForegroundColor Cyan
Write-Host "Time range: $Since" -ForegroundColor Gray

# Build AWS command
$cmd = @(
    'aws', 'logs', 'tail', "`"$logGroup`"",
    '--since', $Since,
    '--no-cli-pager'
)

if ($Filter) {
    $cmd += '--filter-pattern', "`"$Filter`""
    Write-Host "Filter: $Filter" -ForegroundColor Gray
}

if ($Follow) {
    $cmd += '--follow'
    Write-Host "Mode: Following logs (Ctrl+C to stop)" -ForegroundColor Yellow
}

Write-Host ""

# Execute command
& $cmd[0] $cmd[1..($cmd.Length-1)]
