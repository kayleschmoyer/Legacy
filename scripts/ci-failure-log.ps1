#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Fetch failed CI logs for a PR and save them to scratch/ for agent analysis.

.DESCRIPTION
    Given a PR number, this script:
      1. Finds the most recent failed CI run for the PR's branch.
      2. Downloads the failed-step logs via `gh run view --log-failed`.
      3. Saves the raw log to scratch/pr-<N>-ci.txt.
      4. Prints a human-readable summary of which jobs/steps failed and the
         first error lines from each, so the agent can immediately see the
         category of failure without parsing the raw log.

    If no failed run exists (CI is still running or all passed), prints a
    message and exits 0.

.PARAMETER PRNumber
    The pull request number (integer).

.PARAMETER OutputDir
    Directory to write the log file. Defaults to scratch/ under the repo root.

.EXAMPLE
    .\scripts\ci-failure-log.ps1 -PRNumber 1234
    .\scripts\ci-failure-log.ps1 1234 -OutputDir D:\tmp
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [int]$PRNumber,

    [string]$OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step  { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Info  { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor DarkGray }
function Write-Warn  { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# Resolve output directory
# ---------------------------------------------------------------------------

if (-not $OutputDir) {
    $repoRoot = git rev-parse --show-toplevel 2>$null
    if (-not $repoRoot) {
        Write-Error "Cannot locate git repo root. Run from within the legacy-sports repo."
        exit 1
    }
    $OutputDir = Join-Path ($repoRoot -replace '/', '\') "scratch"
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$logFile = Join-Path $OutputDir "pr-$PRNumber-ci.txt"

# ---------------------------------------------------------------------------
# Step 1: Get the PR's branch name
# ---------------------------------------------------------------------------

Write-Step "Looking up PR #$PRNumber..."

$pr = gh pr view $PRNumber --json headRefName,title | ConvertFrom-Json
$branch = $pr.headRefName

Write-Info "Branch: $branch"
Write-Info "Title:  $($pr.title)"

# ---------------------------------------------------------------------------
# Step 2: Find the most recent failed run on this branch
# ---------------------------------------------------------------------------

Write-Step "Finding failed CI run for branch '$branch'..."

$runs = gh run list --branch $branch --status failure --limit 5 --json databaseId,displayTitle,createdAt,workflowName |
    ConvertFrom-Json

if (-not $runs -or $runs.Count -eq 0) {
    # Also check for cancelled or errored
    $runsFallback = gh run list --branch $branch --limit 10 --json databaseId,displayTitle,createdAt,workflowName,conclusion |
        ConvertFrom-Json

    $failed = @($runsFallback | Where-Object { $_.conclusion -in @("failure","cancelled","timed_out","startup_failure") })

    if ($failed.Count -eq 0) {
        Write-Warn "No failed CI runs found for branch '$branch'. CI may still be running or all passing."
        exit 0
    }
    $runs = $failed
}

$runId = $runs[0].databaseId
Write-Info "Run ID:    $runId"
Write-Info "Workflow:  $($runs[0].workflowName)"
Write-Info "Title:     $($runs[0].displayTitle)"

# ---------------------------------------------------------------------------
# Step 3: Download failed-step logs
# ---------------------------------------------------------------------------

Write-Step "Downloading failed step logs → $logFile"

gh run view $runId --log-failed > $logFile

Write-Ok "Saved to $logFile"

# ---------------------------------------------------------------------------
# Step 4: Parse log for a quick summary
# ---------------------------------------------------------------------------

Write-Step "Summarising failures..."

$rawLines = Get-Content $logFile

# Each line is prefixed with "<job-name>  <step-name>  <timestamp>  <text>"
# We want to find lines containing error markers
$errorPatterns = @(
    ' error TS',          # TypeScript errors
    '\berror\b',          # Generic errors (case-insensitive)
    'FAIL ',              # Jest FAIL lines
    'Expected:',          # Jest assertion failures
    '##\[error\]',        # GitHub Actions error annotations
    'ESLint',             # ESLint errors
    ' problems (',        # ESLint summary (N problems (M errors...))
    'timed.out',          # Timeout
    'FAILED',             # Test/build failures
    'Cannot find module', # Module resolution
    'error: ',            # Generic error prefix
)

$errorLines = @($rawLines | Where-Object {
    $line = $_
    $errorPatterns | Where-Object { $line -match $_ }
} | Select-Object -First 30)

# Extract distinct job names from top-level failures
$failedJobs = @($rawLines |
    Where-Object { $_ -match '##\[error\]' } |
    ForEach-Object {
        if ($_ -match '^([^\t]+)\t') { $Matches[1] } else { $null }
    } |
    Where-Object { $_ } |
    Select-Object -Unique -First 10)

Write-Host ""
Write-Host "=== CI Failure Summary for PR #$PRNumber ===" -ForegroundColor Cyan
Write-Host "  Branch:  $branch" -ForegroundColor White
Write-Host "  Run ID:  $runId" -ForegroundColor White
Write-Host "  Log:     $logFile" -ForegroundColor DarkGray

if ($failedJobs.Count -gt 0) {
    Write-Host ""
    Write-Host "  Failed jobs:" -ForegroundColor Yellow
    foreach ($job in $failedJobs) {
        Write-Host "    - $job" -ForegroundColor Yellow
    }
}

if ($errorLines.Count -gt 0) {
    Write-Host ""
    Write-Host "  Key error lines:" -ForegroundColor Red
    foreach ($line in $errorLines) {
        # Trim the job/step/timestamp prefix to show just the content
        $content = $line -replace '^[^\t]*\t[^\t]*\t[^\t]*\t', ''
        Write-Host "    $content" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Warn "No error lines matched known patterns — read $logFile directly."
}

Write-Host ""
Write-Info "Agent: read scratch/pr-$PRNumber-ci.txt for full context before attempting a fix."
