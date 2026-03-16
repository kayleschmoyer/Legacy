#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Resolve all unresolved, non-outdated review threads on a PR via GitHub GraphQL.

.DESCRIPTION
    Fetches every review thread on the specified PR number and calls the
    resolveReviewThread GraphQL mutation for each thread that is:
      - not already resolved
      - not outdated (the code that triggered the comment still exists)

    Exits 0 if all threads were resolved (or there were none).
    Exits 1 on any API error.

    Intended to be called immediately after pushing a fix so that threads are
    closed atomically with the push, rather than requiring a separate agent pass.

.PARAMETER PRNumber
    The pull request number (integer).

.EXAMPLE
    .\scripts\resolve-review-threads.ps1 -PRNumber 1234
    .\scripts\resolve-review-threads.ps1 1234
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [int]$PRNumber
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param([string]$msg) Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  [ok] $msg" -ForegroundColor Green }
function Write-Info { param([string]$msg) Write-Host "  [..] $msg" -ForegroundColor DarkGray }

# ---------------------------------------------------------------------------
# Step 1: Resolve owner/repo
# ---------------------------------------------------------------------------

$repoInfo = gh repo view --json owner,name | ConvertFrom-Json
$owner = $repoInfo.owner.login
$repo  = $repoInfo.name

# ---------------------------------------------------------------------------
# Step 2: Fetch all review threads
# ---------------------------------------------------------------------------

Write-Step "Fetching review threads for PR #$PRNumber..."

$fetchQuery = @'
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
            nodes { path line body }
          }
        }
      }
    }
  }
}
'@

$allThreads = @()
$cursor = $null

do {
    $ghArgs = @(
        "api", "graphql",
        "-f", "query=$fetchQuery",
        "-f", "owner=$owner",
        "-f", "repo=$repo",
        "-F", "number=$PRNumber"
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

$unresolved = @($allThreads | Where-Object { -not $_.isResolved -and -not $_.isOutdated })

if ($unresolved.Count -eq 0) {
    Write-Ok "No unresolved threads on PR #$PRNumber."
    exit 0
}

Write-Info "Found $($unresolved.Count) unresolved thread(s)."

# ---------------------------------------------------------------------------
# Step 3: Resolve each thread
# ---------------------------------------------------------------------------

$resolveMutation = @'
mutation($id: ID!) {
  resolveReviewThread(input: { threadId: $id }) {
    thread { id isResolved }
  }
}
'@

Write-Step "Resolving threads..."

$resolved = 0
$failed   = 0

foreach ($thread in $unresolved) {
    $first = $thread.comments.nodes | Select-Object -First 1
    $location = if ($first.path) { "$($first.path):$($first.line)" } else { "(no location)" }

    try {
        $mutResult = gh api graphql `
            -f query="$resolveMutation" `
            -f id=$($thread.id) |
            ConvertFrom-Json

        if ($mutResult.data.resolveReviewThread.thread.isResolved) {
            Write-Ok "Resolved thread at $location"
            $resolved++
        } else {
            Write-Warning "Thread at $location may not have resolved (API returned unexpected state)"
            $failed++
        }
    } catch {
        Write-Warning "Failed to resolve thread at $location: $_"
        $failed++
    }
}

# ---------------------------------------------------------------------------
# Step 4: Summary
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=== Thread Resolution Summary ===" -ForegroundColor Cyan
Write-Host "  PR:       #$PRNumber" -ForegroundColor White
Write-Host "  Resolved: $resolved" -ForegroundColor $(if ($resolved -gt 0) { "Green" } else { "DarkGray" })
if ($failed -gt 0) {
    Write-Host "  Failed:   $failed" -ForegroundColor Red
    exit 1
}
