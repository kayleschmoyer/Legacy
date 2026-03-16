#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Scan all open PRs and classify them by problem type for the agent sweep workflow.

.DESCRIPTION
    Queries GitHub for every open PR and produces a structured JSON summary covering
    three problem categories used by the pr-cleanup-sweep skill:
      1. CONFLICTING   - PRs with merge conflicts (need rebase)
      2. REVIEWS       - PRs with unresolved, non-outdated review threads
      3. CI_FAILING    - PRs with at least one failed/errored CI check
      4. CI_PENDING    - PRs with CI still running (in-progress/queued/pending)

    Output is written to scratch/pr-scan.json in the main repo so the agent can
    read structured data instead of parsing shell command output.

.PARAMETER Limit
    Maximum number of PRs to fetch (default: 200).

.PARAMETER OutputPath
    Path to write the JSON output. Defaults to scratch/pr-scan.json under the
    main repo (auto-detected via git).

.EXAMPLE
    .\scripts\scan-prs.ps1
    .\scripts\scan-prs.ps1 -Limit 100
    .\scripts\scan-prs.ps1 -OutputPath D:\tmp\scan.json

.OUTPUTS
    JSON file with shape:
    {
      "scannedAt": "ISO8601",
      "totalOpen": 38,
      "conflicting": [ { "number": 101, "title": "...", "headRefName": "..." } ],
      "reviews": [
        {
          "number": 102, "title": "...", "headRefName": "...",
          "threads": [ { "id": "...", "path": "...", "line": 42, "body": "..." } ]
        }
      ],
      "ciFailing": [ { "number": 103, "title": "...", "headRefName": "...", "failedChecks": ["lint","typecheck"] } ],
      "ciPending": [ { "number": 104, "title": "...", "headRefName": "..." } ],
      "clean": [ { "number": 105, "title": "...", "headRefName": "..." } ]
    }
#>

[CmdletBinding()]
param(
    [int]$Limit = 200,
    [string]$OutputPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Info { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor DarkGray }

# ---------------------------------------------------------------------------
# Locate main repo root and resolve output path
# ---------------------------------------------------------------------------

$repoRoot = git -C $PSScriptRoot rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    $repoRoot = git rev-parse --show-toplevel 2>$null
}
if (-not $repoRoot) {
    Write-Error "Cannot find git repo root. Run from inside the legacy-sports repo."
    exit 1
}
$repoRoot = $repoRoot -replace '/', '\'

if (-not $OutputPath) {
    $scratchDir = Join-Path $repoRoot "scratch"
    if (-not (Test-Path $scratchDir)) { New-Item -ItemType Directory -Path $scratchDir | Out-Null }
    $OutputPath = Join-Path $scratchDir "pr-scan.json"
}

# ---------------------------------------------------------------------------
# Step 1: Fetch all open PRs (basic fields + check rollup)
# ---------------------------------------------------------------------------

Write-Step "Fetching open PRs (limit $Limit)..."

$allPRs = gh pr list --state open --limit $Limit `
    --json number,title,headRefName,mergeable,statusCheckRollup |
    ConvertFrom-Json

Write-Info "Total open PRs: $($allPRs.Count)"

# ---------------------------------------------------------------------------
# Step 2: Classify by merge conflict and CI status (no extra API calls needed)
# ---------------------------------------------------------------------------

$conflicting = @()
$ciFailing   = @()
$ciPending   = @()
$ciClean     = @()  # no conflict, CI all green (reviews checked separately)

$failingConclusions = @("FAILURE", "ERROR", "CANCELLED", "TIMED_OUT")
$pendingStatuses    = @("IN_PROGRESS", "QUEUED", "PENDING")

foreach ($pr in $allPRs) {
    if ($pr.mergeable -eq "CONFLICTING") {
        $conflicting += [pscustomobject]@{
            number      = $pr.number
            title       = $pr.title
            headRefName = $pr.headRefName
        }
        # Still check CI so agent knows both problems exist
    }

    $checks = $pr.statusCheckRollup
    if (-not $checks) {
        # No CI data yet — treat as pending
        $ciPending += [pscustomobject]@{
            number      = $pr.number
            title       = $pr.title
            headRefName = $pr.headRefName
        }
        continue
    }

    $failed  = @($checks | Where-Object { $_.conclusion -in $failingConclusions })
    $pending = @($checks | Where-Object {
        ($_.conclusion -eq $null -or $_.conclusion -eq "") -and
        ($_.status -in $pendingStatuses)
    })

    if ($failed.Count -gt 0) {
        $ciFailing += [pscustomobject]@{
            number       = $pr.number
            title        = $pr.title
            headRefName  = $pr.headRefName
            failedChecks = @($failed | ForEach-Object { $_.name })
        }
    } elseif ($pending.Count -gt 0) {
        $ciPending += [pscustomobject]@{
            number      = $pr.number
            title       = $pr.title
            headRefName = $pr.headRefName
        }
    } else {
        # Only mark as clean if not already flagged as conflicting
        $isConflicting = $pr.mergeable -eq "CONFLICTING"
        if (-not $isConflicting) {
            $ciClean += [pscustomobject]@{
                number      = $pr.number
                title       = $pr.title
                headRefName = $pr.headRefName
            }
        }
    }
}

Write-Info "Conflicting: $($conflicting.Count)"
Write-Info "CI failing:  $($ciFailing.Count)"
Write-Info "CI pending:  $($ciPending.Count)"
Write-Info "CI clean:    $($ciClean.Count)"

# ---------------------------------------------------------------------------
# Step 3: Fetch unresolved review threads for each PR (GraphQL)
# ---------------------------------------------------------------------------

Write-Step "Checking review threads (GraphQL)..."

$repoInfo = gh repo view --json owner,name | ConvertFrom-Json
$owner = $repoInfo.owner.login
$repo  = $repoInfo.name

$reviewQuery = @'
query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 1) {
            nodes {
              path
              line
              body
            }
          }
        }
      }
    }
  }
}
'@

$reviewPRs = @()

foreach ($pr in $allPRs) {
    $allThreads = @()
    $cursor = $null

    do {
        $ghArgs = @(
            "api", "graphql",
            "-f", "query=$reviewQuery",
            "-f", "owner=$owner",
            "-f", "repo=$repo",
            "-F", "number=$($pr.number)"
        )
        if ($cursor) {
            $ghArgs += @("-f", "cursor=$cursor")
        }

        $result = & gh @ghArgs | ConvertFrom-Json

        $page = $result.data.repository.pullRequest.reviewThreads
        $allThreads += @($page.nodes)

        $hasNext = $page.pageInfo.hasNextPage
        $cursor  = $page.pageInfo.endCursor
    } while ($hasNext)

    $unresolved = @($allThreads | Where-Object {
        -not $_.isResolved -and -not $_.isOutdated
    })

    if ($unresolved.Count -gt 0) {
        $threadSummary = @($unresolved | ForEach-Object {
            $first = $_.comments.nodes | Select-Object -First 1
            [pscustomobject]@{
                id   = $_.id
                path = $first.path
                line = $first.line
                body = $first.body
            }
        })

        $reviewPRs += [pscustomobject]@{
            number      = $pr.number
            title       = $pr.title
            headRefName = $pr.headRefName
            threads     = $threadSummary
        }
        Write-Info "PR #$($pr.number): $($unresolved.Count) unresolved thread(s)"
    }
}

Write-Info "PRs with unresolved reviews: $($reviewPRs.Count)"

# ---------------------------------------------------------------------------
# Step 4: Build final output and write JSON
# ---------------------------------------------------------------------------

$output = [pscustomobject]@{
    scannedAt   = (Get-Date -Format "o")
    totalOpen   = $allPRs.Count
    conflicting = $conflicting
    reviews     = $reviewPRs
    ciFailing   = $ciFailing
    ciPending   = $ciPending
    clean       = $ciClean
}

$output | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $OutputPath

# ---------------------------------------------------------------------------
# Step 5: Print summary
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=== PR Scan Summary ===" -ForegroundColor Cyan
Write-Host "  Total open:   $($allPRs.Count)" -ForegroundColor White
Write-Host "  Conflicting:  $($conflicting.Count)" -ForegroundColor $(if ($conflicting.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "  Reviews:      $($reviewPRs.Count)" -ForegroundColor $(if ($reviewPRs.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "  CI failing:   $($ciFailing.Count)" -ForegroundColor $(if ($ciFailing.Count -gt 0) { "Red" } else { "Green" })
Write-Host "  CI pending:   $($ciPending.Count)" -ForegroundColor $(if ($ciPending.Count -gt 0) { "DarkYellow" } else { "Green" })
Write-Host ""
Write-Host "  Output: $OutputPath" -ForegroundColor DarkGray
