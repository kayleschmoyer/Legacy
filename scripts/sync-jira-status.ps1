#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Synchronize Jira ticket statuses with associated Git branches
.DESCRIPTION
    This script examines all Git branches, extracts Jira ticket keys,
    and reports on ticket statuses. It can optionally update Jira statuses
    based on branch state (e.g., merged branches → Done).
.PARAMETER DryRun
    Show what would be done without making any changes
.PARAMETER AutoUpdate
    Automatically update Jira tickets based on branch state
.PARAMETER ShowAll
    Show all branches, including those without Jira tickets
.PARAMETER Recheck
    Ignore the done-ledger cache and re-evaluate every ticket, including those
    already confirmed Done on a previous run. By default, tickets recorded as
    Done in ~/.legacy-sports/jira-sync-done.json are skipped (no Jira lookup),
    since a Done ticket is terminal and will not change.
.EXAMPLE
    .\scripts\sync-jira-status.ps1
    Show status of all branches with Jira tickets (skips cached-Done tickets)
.EXAMPLE
    .\scripts\sync-jira-status.ps1 -Recheck
    Re-evaluate every ticket, ignoring the done-ledger cache
.EXAMPLE
    .\scripts\sync-jira-status.ps1 -AutoUpdate
    Automatically sync Jira statuses based on branch state
.EXAMPLE
    .\scripts\sync-jira-status.ps1 -DryRun -AutoUpdate
    Preview what would be updated without making changes
#>

param(
    [switch]$DryRun,
    [switch]$AutoUpdate,
    [switch]$ShowAll,
    [switch]$Recheck
)

$ErrorActionPreference = "Stop"

# Color functions for better output
function Write-Header {
    param([string]$Message)
    Write-Host "`n$Message" -ForegroundColor Cyan
    Write-Host ("=" * $Message.Length) -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Gray
}

# Refresh PATH for acli
Write-Info "Refreshing PATH for CLI tools..."
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Check if acli is available
try {
    $null = Get-Command acli -ErrorAction Stop
    Write-Success "Jira CLI (acli) found"
} catch {
    Write-Error "Jira CLI (acli) not found in PATH"
    Write-Info "Install from: https://developer.atlassian.com/cloud/jira/platform/jira-cli/"
    exit 1
}

# Check if gh (GitHub CLI) is available
try {
    $null = Get-Command gh -ErrorAction Stop
    Write-Success "GitHub CLI (gh) found"
    $ghAvailable = $true
} catch {
    Write-Warning "GitHub CLI (gh) not found - PR status detection will be skipped"
    Write-Info "Install from: https://cli.github.com/"
    $ghAvailable = $false
}

# Jira workflow order -- transitions must walk through each intermediate status
$workflowOrder = @("To Do", "In Progress", "In Review", "Done")

function Invoke-JiraTransition {
    <#
    .SYNOPSIS
        Transition a Jira ticket through intermediate statuses to reach the target.
    .DESCRIPTION
        Jira workflows require stepping through each status in order
        (To Do → In Progress → In Review → Done). This function walks through
        every intermediate transition so the ticket always reaches the target.
    #>
    param(
        [string]$TicketKey,
        [string]$CurrentStatus,
        [string]$TargetStatus,
        [switch]$IsDryRun
    )

    $currentIdx = $workflowOrder.IndexOf($CurrentStatus)
    $targetIdx  = $workflowOrder.IndexOf($TargetStatus)

    # If either status is unknown or already at/past target, skip
    if ($currentIdx -lt 0 -or $targetIdx -lt 0 -or $currentIdx -ge $targetIdx) {
        Write-Warning "Cannot transition $TicketKey from '$CurrentStatus' to '$TargetStatus' -- skipping"
        return $false
    }

    for ($i = $currentIdx + 1; $i -le $targetIdx; $i++) {
        $nextStatus = $workflowOrder[$i]
        if ($IsDryRun) {
            Write-Warning "DRY RUN: Would transition $TicketKey -> '$nextStatus'"
        } else {
            Write-Info "Transitioning $TicketKey -> '$nextStatus'..."
            acli jira workitem transition --key $TicketKey --status $nextStatus 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Error "Failed to transition $TicketKey to '$nextStatus'"
                return $false
            }
            Write-Success "Transitioned $TicketKey -> $nextStatus"
        }
    }

    return $true
}

# Function to get PR status for a branch (looked up from the pre-fetched PR map)
function Get-PRStatus {
    param([string]$Branch)

    $cleanBranch = $Branch -replace '^remotes/origin/', ''

    if ($script:prMap -and $script:prMap.ContainsKey($cleanBranch)) {
        $pr = $script:prMap[$cleanBranch]
        return @{
            Exists = $true
            State  = $pr.state
            Merged = ($pr.state -eq "MERGED" -or [bool]$pr.mergedAt)
            Number = $pr.number
        }
    }

    return @{ Exists = $false; State = "none"; Merged = $false }
}

# Get all branches
Write-Header "Fetching branches..."
$branches = git branch -a | ForEach-Object { $_.Trim() -replace '^\*\s*', '' -replace '^remotes/origin/', '' } | Where-Object { $_ -notmatch '^HEAD' } | Select-Object -Unique

Write-Info "Found $($branches.Count) unique branches"

# Pre-fetch every PR once and index by head branch name. This single bulk query
# replaces thousands of per-branch `gh pr list --head` calls (agent-branch ticket
# resolution + per-ticket PR status), turning O(branches) network calls into O(1).
# `gh pr list --limit N` paginates internally (100/page) up to N, so this is one
# logical query. The only ceiling is N itself; if it's hit we warn loudly below
# rather than silently truncating, and unmapped branches fall back to the
# `git branch --merged main` check.
$prFetchLimit = 5000
$prMap = @{}
if ($ghAvailable) {
    Write-Info "Fetching all PRs in one batch (gh paginates internally; this can take a moment)..."
    $allPrsJson = gh pr list --state all --json headRefName,title,body,number,state,mergedAt --limit $prFetchLimit 2>$null

    if ($allPrsJson) {
        $allPrs = @($allPrsJson | ConvertFrom-Json)
        if ($allPrs.Count -ge $prFetchLimit) {
            Write-Warning "Hit the PR fetch cap ($prFetchLimit) -- older PRs may be missing from the map; affected branches fall back to the git-merge check. Raise `$prFetchLimit if your repo has more PRs."
        }
        foreach ($pr in $allPrs) {
            # Keep the first (most recent) PR per branch; gh returns newest-first.
            if ($pr.headRefName -and -not $prMap.ContainsKey($pr.headRefName)) {
                $prMap[$pr.headRefName] = $pr
            }
        }
        Write-Success "Indexed $($prMap.Count) PR(s) by branch name"
    } else {
        Write-Warning "No PRs returned from gh -- PR status detection will be limited"
    }
}

# Extract Jira ticket keys from branch names, falling back to PR title/body for
# agent branches (claude/*) that embed no ticket key in the branch name.
$ticketPattern = 'LS-\d+'
$branchTickets = @{}

# Collect agent branches that need PR-based ticket discovery
$agentBranches = @()

foreach ($branch in $branches) {
    if ($branch -match $ticketPattern) {
        $ticketKey = $matches[0].ToUpper()
        if (-not $branchTickets.ContainsKey($ticketKey)) {
            $branchTickets[$ticketKey] = @()
        }
        $branchTickets[$ticketKey] += $branch
    } elseif ($branch -match '^claude/') {
        $agentBranches += $branch
    } elseif ($ShowAll) {
        Write-Info "Branch without ticket: $branch"
    }
}

# For agent branches, resolve the ticket key from the pre-fetched PR map
# (title + body) instead of issuing one gh call per branch.
if ($agentBranches.Count -gt 0 -and $ghAvailable) {
    Write-Info "Resolving ticket keys for $($agentBranches.Count) agent branch(es) from PR map..."

    foreach ($branch in $agentBranches) {
        if (-not $prMap.ContainsKey($branch)) {
            if ($ShowAll) { Write-Info "Agent branch without PR: $branch" }
            continue
        }

        $pr = $prMap[$branch]

        # Extract all LS-#### keys from PR title (all matches) and body
        # (only matches preceded by a closing keyword, matching GHA logic).
        $titleKeys = [regex]::Matches($pr.title, 'LS-\d+', 'IgnoreCase') |
                     ForEach-Object { $_.Value.ToUpper() }

        $bodyKeys = @()
        if ($pr.body) {
            $bodyKeys = [regex]::Matches(
                $pr.body,
                '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|complete[sd]?)\s+(LS-\d+)',
                'IgnoreCase'
            ) | ForEach-Object { $_.Groups[1].Value.ToUpper() }
        }

        $keys = @($titleKeys) + @($bodyKeys) | Select-Object -Unique

        foreach ($ticketKey in $keys) {
            if (-not $branchTickets.ContainsKey($ticketKey)) {
                $branchTickets[$ticketKey] = @()
            }
            if ($branchTickets[$ticketKey] -notcontains $branch) {
                $branchTickets[$ticketKey] += $branch
            }
            Write-Info "Agent branch $branch -> $ticketKey (PR #$($pr.number))"
        }
    }
}

Write-Success "Found $($branchTickets.Count) Jira ticket(s) across branches"

# Load the done-ledger: tickets confirmed Done on a previous run. A Done ticket
# is terminal, so we skip re-fetching it from Jira unless -Recheck is passed.
$doneCachePath = Join-Path (Join-Path $HOME ".legacy-sports") "jira-sync-done.json"
$doneCache = @{}
if (Test-Path $doneCachePath) {
    try {
        $rawCache = Get-Content $doneCachePath -Raw -ErrorAction Stop | ConvertFrom-Json
        foreach ($prop in $rawCache.PSObject.Properties) {
            $doneCache[$prop.Name] = $prop.Value
        }
        if ($Recheck) {
            Write-Info "Loaded $($doneCache.Count) cached Done ticket(s) -- -Recheck set, re-evaluating all"
        } else {
            Write-Info "Loaded $($doneCache.Count) cached Done ticket(s); these will be skipped (use -Recheck to override)"
        }
    } catch {
        Write-Warning "Could not read done-ledger ($doneCachePath); ignoring it this run"
        $doneCache = @{}
    }
}
$cacheDirty = $false
$skippedCount = 0

# Check each ticket status
Write-Header "Checking Jira ticket statuses..."

$results = @()

foreach ($ticketKey in $branchTickets.Keys | Sort-Object) {
    $branchList = $branchTickets[$ticketKey]

    # Skip tickets already confirmed Done on a prior run (unless -Recheck).
    if (-not $Recheck -and $doneCache.ContainsKey($ticketKey)) {
        $skippedCount++
        if ($ShowAll) {
            Write-Host "`n[SKIP] $ticketKey already Done & synced ($($doneCache[$ticketKey]))" -ForegroundColor DarkGray
        }
        continue
    }

    Write-Host "`n[TICKET] $ticketKey" -ForegroundColor Cyan
    Write-Info "Branches: $($branchList -join ', ')"

    # Get ticket info from Jira
    try {
        $ticketOutput = acli jira workitem view $ticketKey 2>&1 | Out-String
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not fetch ticket $ticketKey (may be deleted or inaccessible)"
            $results += [PSCustomObject]@{
                Ticket = $ticketKey
                Branches = $branchList -join ', '
                JiraStatus = "NOT FOUND"
                PRStatus = "N/A"
                Merged = "N/A"
                Recommendation = "Consider deleting branches"
            }
            continue
        }
        
        # Parse status from output
        if ($ticketOutput -match 'Status:\s*(.+?)(\r|\n|$)') {
            $status = $matches[1].Trim()
        } else {
            $status = "UNKNOWN"
        }
        
        # Check if branches are merged and PR status
        $mergedBranches = @()
        $activeBranches = @()
        $prInfo = $null
        
        # Check PR status first for all branches (more reliable than git merge check)
        foreach ($branch in $branchList) {
            $cleanBranch = $branch -replace '^remotes/origin/', ''
            $branchPRInfo = Get-PRStatus -Branch $cleanBranch
            
            # Use PR merged status as source of truth if available
            if ($branchPRInfo.Exists -and $branchPRInfo.Merged) {
                $mergedBranches += $cleanBranch
                if (-not $prInfo) {
                    $prInfo = $branchPRInfo
                }
            } else {
                # Fall back to git branch merge check
                $mergedCheck = git branch --merged main 2>$null | Where-Object { $_.Trim() -eq $cleanBranch }
                
                if ($mergedCheck) {
                    $mergedBranches += $cleanBranch
                } else {
                    $activeBranches += $cleanBranch
                    # Store PR info for active branches
                    if (-not $prInfo -and $branchPRInfo.Exists) {
                        $prInfo = $branchPRInfo
                    }
                }
            }
        }
        
        Write-Info "Status: $status"
        
        if ($prInfo -and $prInfo.Exists) {
            $prStateText = if ($prInfo.Merged) { "merged" } else { $prInfo.State }
            Write-Info "PR #$($prInfo.Number): $prStateText"
        }
        
        if ($mergedBranches.Count -gt 0) {
            Write-Info "Merged branches: $($mergedBranches -join ', ')"
        }
        
        if ($activeBranches.Count -gt 0) {
            Write-Info "Active branches: $($activeBranches -join ', ')"
        }
        
        # Determine recommendation based on PR and branch state
        $recommendation = ""
        $shouldUpdate = $false
        $targetStatus = ""
        
        # Priority 1: PR merged → Done
        if ($prInfo -and $prInfo.Merged -and $status -ne "Done") {
            $recommendation = "PR merged but ticket not Done"
            $shouldUpdate = $true
            $targetStatus = "Done"
        }
        # Priority 2: Branch merged to main → Done
        elseif ($mergedBranches.Count -gt 0 -and $status -ne "Done") {
            $recommendation = "Branch merged but ticket not Done"
            $shouldUpdate = $true
            $targetStatus = "Done"
        }
        # Priority 3: PR open → In Review
        elseif ($prInfo -and $prInfo.Exists -and $prInfo.State -eq "OPEN" -and $status -ne "In Review" -and $status -ne "Done") {
            $recommendation = "PR open but ticket not In Review"
            $shouldUpdate = $true
            $targetStatus = "In Review"
        }
        # Priority 4: Active branch with no PR → In Progress
        elseif ($activeBranches.Count -gt 0 -and -not ($prInfo -and $prInfo.Exists)) {
            if ($status -eq "To Do") {
                $recommendation = "Active branch but ticket in To Do - should be In Progress"
                $shouldUpdate = $true
                $targetStatus = "In Progress"
            } elseif ($status -eq "Done") {
                $recommendation = "Ticket Done but branch not merged - verify completion"
            } else {
                $recommendation = "Branch active and ticket in progress - OK"
            }
        }
        # All good
        elseif (($mergedBranches.Count -gt 0 -or ($prInfo -and $prInfo.Merged)) -and $status -eq "Done") {
            $recommendation = "[OK] In sync"
        }
        elseif ($prInfo -and $prInfo.Exists -and $prInfo.State -eq "OPEN" -and $status -eq "In Review") {
            $recommendation = "[OK] In sync"
        }
        elseif ($activeBranches.Count -gt 0 -and $status -in @("In Progress", "In Review")) {
            $recommendation = "[OK] In sync"
        }
        
        # Auto-update if enabled
        $transitionOk = $false
        if ($AutoUpdate -and $shouldUpdate -and $targetStatus) {
            $transitionOk = Invoke-JiraTransition -TicketKey $ticketKey -CurrentStatus $status -TargetStatus $targetStatus -IsDryRun:$DryRun
            if (-not $transitionOk -and -not $DryRun) {
                Write-Error "Failed to transition $ticketKey from '$status' to '$targetStatus'"
            }
        } elseif ($recommendation -and $recommendation -ne "[OK] In sync") {
            Write-Warning $recommendation
        } else {
            Write-Success $recommendation
        }
        
        $results += [PSCustomObject]@{
            Ticket = $ticketKey
            Branches = $branchList -join ', '
            JiraStatus = $status
            PRStatus = if ($prInfo -and $prInfo.Exists) { if ($prInfo.Merged) { "Merged" } else { $prInfo.State } } else { "None" }
            Merged = if ($mergedBranches.Count -gt 0) { "Yes" } else { "No" }
            Recommendation = $recommendation
        }

        # Record terminal (Done) tickets in the ledger so future runs skip them.
        # A ticket counts as Done if it was already Done, or we just transitioned
        # it to Done. Never record during a dry run (no real state changed).
        $reachedDone = ($status -eq "Done") -or ($targetStatus -eq "Done" -and $transitionOk)
        if ($reachedDone -and -not $DryRun -and -not $doneCache.ContainsKey($ticketKey)) {
            $doneCache[$ticketKey] = (Get-Date -Format "o")
            $cacheDirty = $true
        }

    } catch {
        $errorMsg = $_.Exception.Message
        Write-Error "Error processing $ticketKey - $errorMsg"
        $results += [PSCustomObject]@{
            Ticket = $ticketKey
            Branches = $branchList -join ', '
            JiraStatus = "ERROR"
            PRStatus = "N/A"
            Merged = "N/A"
            Recommendation = "Error: $errorMsg"
        }
    }
}

# Summary report
Write-Header "Summary Report"
$results | Format-Table -AutoSize

# Persist the done-ledger so the next run can skip terminal tickets.
if ($cacheDirty) {
    try {
        $cacheDir = Split-Path $doneCachePath -Parent
        if (-not (Test-Path $cacheDir)) {
            New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
        }
        $doneCache | ConvertTo-Json | Set-Content -Path $doneCachePath -Encoding UTF8
        Write-Success "Done-ledger updated: $($doneCache.Count) ticket(s) at $doneCachePath"
    } catch {
        Write-Warning "Could not write done-ledger ($doneCachePath): $($_.Exception.Message)"
    }
}

# Statistics
Write-Header "Statistics"
$totalTickets = $results.Count
$inSync = ($results | Where-Object { $_.Recommendation -eq "[OK] In sync" }).Count
$needsAttention = $totalTickets - $inSync

if ($skippedCount -gt 0) {
    Write-Info "Skipped (cached Done): $skippedCount  -- run with -Recheck to re-evaluate"
}
Write-Info "Total tickets evaluated: $totalTickets"
Write-Success "In sync: $inSync"

if ($needsAttention -gt 0) {
    Write-Warning "Needs attention: $needsAttention"
} else {
    Write-Success "All tickets are synchronized!"
}

if (-not $AutoUpdate -and $needsAttention -gt 0) {
    Write-Host "`n[TIP] Run with -AutoUpdate to automatically sync Jira statuses" -ForegroundColor Cyan
    Write-Host "      Or use -DryRun -AutoUpdate to preview changes first" -ForegroundColor Gray
}

Write-Host "`nDone!" -ForegroundColor Green
