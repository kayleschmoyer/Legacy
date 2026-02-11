#!/usr/bin/env pwsh
<#
.SYNOPSIS
    View AWS CloudWatch logs correlated with database timestamps

.DESCRIPTION
    Queries the database for a timestamp (like last_updated) and searches
    CloudWatch logs around that specific time period. This helps debug
    distributed system issues by finding logs relevant to when something
    actually happened, not just the most recent logs.

.PARAMETER Function
    Lambda function name (without prefix/suffix)
    Examples: graphql, db, oauth-proxy, stats, game-selection

.PARAMETER DbQuery
    SQL query that returns a timestamp column
    Example: "SELECT last_updated FROM game_stats WHERE game_id = 123 ORDER BY last_updated DESC LIMIT 1"

.PARAMETER TimestampColumn
    Name of the timestamp column in the query result. Default: detects first timestamp column

.PARAMETER WindowBefore
    Time window before the timestamp. Default: 5m (5 minutes)

.PARAMETER WindowAfter
    Time window after the timestamp. Default: 5m (5 minutes)

.PARAMETER Filter
    Filter pattern for log messages

.PARAMETER Environment
    Environment (dev or prod). Default: dev

.PARAMETER ShowQuery
    Display the database query results before showing logs

.EXAMPLE
    # Find logs for when a specific game's stats were last updated
    .\scripts\aws-logs-from-db.ps1 -Function stats -DbQuery "SELECT last_updated FROM game_stats WHERE game_id = 123 ORDER BY last_updated DESC LIMIT 1"

.EXAMPLE
    # Find logs for a league's draft with custom time window
    .\scripts\aws-logs-from-db.ps1 -Function draft-processor -DbQuery "SELECT draft_started_at FROM leagues WHERE id = 16" -WindowBefore 2m -WindowAfter 10m

.EXAMPLE
    # Find logs with error filter
    .\scripts\aws-logs-from-db.ps1 -Function graphql -DbQuery "SELECT created_at FROM errors WHERE id = 456" -Filter "ERROR"

.EXAMPLE
    # Show database results before logs
    .\scripts\aws-logs-from-db.ps1 -Function stats -DbQuery "SELECT game_id, last_updated FROM game_stats WHERE game_id = 123" -ShowQuery
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('graphql', 'db', 'oauth-proxy', 'notifications', 'stats', 'stats-lambda', 'game-selection', 'draft-processor', 'websocket')]
    [string]$Function,
    
    [Parameter(Mandatory=$true)]
    [string]$DbQuery,
    
    [string]$TimestampColumn,
    
    [string]$WindowBefore = "5m",
    
    [string]$WindowAfter = "5m",
    
    [string]$Filter,
    
    [ValidateSet('dev', 'prod')]
    [string]$Environment = 'dev',
    
    [switch]$ShowQuery
)

# Configure AWS CLI environment variables
$env:AWS_PAGER = ""
$env:PYTHONIOENCODING = "utf-8"

# Normalize function name
$functionName = $Function
if ($Function -eq 'stats-lambda') {
    $functionName = 'stats'
}

# Construct log group name
$logGroup = "/aws/lambda/legacy-sports-$Environment-$functionName"

Write-Host "=== CloudWatch Logs from Database Timestamp ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Query the database
Write-Host "1. Querying database..." -ForegroundColor Yellow
Write-Host "   Query: $DbQuery" -ForegroundColor Gray
Write-Host ""

$dbResult = & .\scripts\db-query.ps1 -Query $DbQuery -Format json 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Database query failed" -ForegroundColor Red
    Write-Host $dbResult
    exit 1
}

# Parse JSON result - extract only the JSON array from the output
try {
    # Find lines that start with [ or contain JSON (skip log lines)
    $lines = $dbResult -split "`n"
    $jsonLines = @()
    $inJson = $false
    
    foreach ($line in $lines) {
        if ($line -match '^\s*\[') {
            $inJson = $true
        }
        if ($inJson) {
            $jsonLines += $line
        }
        if ($inJson -and $line -match '^\s*\]\s*$') {
            break
        }
    }
    
    if ($jsonLines.Count -eq 0) {
        throw "Could not find JSON array in output"
    }
    
    $jsonString = $jsonLines -join "`n"
    $rows = $jsonString | ConvertFrom-Json
    
    if (-not $rows -or $rows.Count -eq 0) {
        Write-Host "Error: Query returned no results" -ForegroundColor Red
        exit 1
    }
    
    if ($ShowQuery) {
        Write-Host "   Query Results:" -ForegroundColor Gray
        $rows | Format-Table | Out-String | Write-Host
    }
    
    # Get first row
    $row = $rows[0]
    
    # Find timestamp column
    $timestampValue = $null
    if ($TimestampColumn) {
        # Use specified column
        if ($row.PSObject.Properties.Name -contains $TimestampColumn) {
            $timestampValue = $row.$TimestampColumn
        } else {
            Write-Host "Error: Column '$TimestampColumn' not found in query results" -ForegroundColor Red
            Write-Host "Available columns: $($row.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
            exit 1
        }
    } else {
        # Auto-detect first timestamp-like column
        $timestampColumns = @('last_updated', 'updated_at', 'created_at', 'draft_started_at', 'timestamp', 'occurred_at')
        
        foreach ($col in $timestampColumns) {
            if ($row.PSObject.Properties.Name -contains $col) {
                $timestampValue = $row.$col
                $TimestampColumn = $col
                break
            }
        }
        
        # If still not found, try first column that looks like a timestamp
        if (-not $timestampValue) {
            foreach ($prop in $row.PSObject.Properties) {
                if ($prop.Value -match '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}') {
                    $timestampValue = $prop.Value
                    $TimestampColumn = $prop.Name
                    break
                }
            }
        }
    }
    
    if (-not $timestampValue) {
        Write-Host "Error: Could not find timestamp column in query results" -ForegroundColor Red
        Write-Host "Available columns: $($row.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
        Write-Host "Specify column with -TimestampColumn parameter" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "   Found timestamp: $timestampValue ($TimestampColumn)" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "Error: Failed to parse database results" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host "Raw output:" -ForegroundColor Gray
    Write-Host $dbResult
    exit 1
}

# Step 2: Convert timestamp to CloudWatch time range
Write-Host "2. Calculating time range..." -ForegroundColor Yellow

try {
    # Parse the timestamp
    $dbTimestamp = [DateTime]::Parse($timestampValue)
    
    # Calculate start and end times
    $startTime = $dbTimestamp.AddMinutes(-[int]($WindowBefore -replace '\D'))
    $endTime = $dbTimestamp.AddMinutes([int]($WindowAfter -replace '\D'))
    
    # Convert to Unix epoch (seconds since 1970-01-01)
    $epoch = [DateTime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
    $startEpoch = [int64](($startTime.ToUniversalTime() - $epoch).TotalSeconds)
    $endEpoch = [int64](($endTime.ToUniversalTime() - $epoch).TotalSeconds)
    
    Write-Host "   Database time: $($dbTimestamp.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
    Write-Host "   Search window: $($startTime.ToString('HH:mm:ss')) to $($endTime.ToString('HH:mm:ss'))" -ForegroundColor Gray
    Write-Host "   Window: -$WindowBefore to +$WindowAfter from database time" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host "Error: Failed to parse timestamp '$timestampValue'" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# Step 3: Query CloudWatch logs
Write-Host "3. Searching CloudWatch logs..." -ForegroundColor Yellow
Write-Host "   Log group: $logGroup" -ForegroundColor Gray
if ($Filter) {
    Write-Host "   Filter: $Filter" -ForegroundColor Gray
}
Write-Host ""
Write-Host "=== Logs ===" -ForegroundColor Cyan
Write-Host ""

# Build AWS command with start-time and end-time
$cmd = @(
    'aws', 'logs', 'tail', "`"$logGroup`"",
    '--start-time', $startEpoch,
    '--end-time', $endEpoch,
    '--no-cli-pager'
)

if ($Filter) {
    $cmd += '--filter-pattern', "`"$Filter`""
}

# Execute command
& $cmd[0] $cmd[1..($cmd.Length-1)]

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Warning: CloudWatch query may have failed or returned no results" -ForegroundColor Yellow
    Write-Host "Check that the Lambda function was active during this time period" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Search Complete ===" -ForegroundColor Cyan
Write-Host "Searched: $($startTime.ToString('HH:mm:ss')) to $($endTime.ToString('HH:mm:ss'))" -ForegroundColor Gray
