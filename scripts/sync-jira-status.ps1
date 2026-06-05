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
.PARAMETER RollupScope
    Controls the hierarchical parent rollup pass that runs after the per-ticket
    sync. Branch-driven sync only ever touches issues that have their own branch
    or PR; a parent (Story, Epic, Initiative, ...) has no branch of its own, so
    its status is reconciled from its children instead.
      None    - skip the rollup pass entirely (legacy behavior).
      Touched - (default) reconcile the full ancestor chain of every ticket this
                run visited. Cheap; no extra discovery query.
      AllOpen - reconcile every parent in the hierarchy, regardless of whether
                any descendant had an active branch this run.
.EXAMPLE
    .\scripts\sync-jira-status.ps1 -AutoUpdate -RollupScope AllOpen
    Sync per-ticket statuses, then reconcile every parent from its children.
#>

param(
    [switch]$DryRun,
    [switch]$AutoUpdate,
    [switch]$ShowAll,
    [switch]$Recheck,
    [ValidateSet("None", "Touched", "AllOpen")]
    [string]$RollupScope = "Touched"
)

$ErrorActionPreference = "Stop"

# Pure rollup helpers (Get-RolledUpStatus, Get-TransitionPath, $JiraWorkflowOrder).
. (Join-Path $PSScriptRoot "lib/jira-rollup.ps1")

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

function Invoke-JiraTransition {
    <#
    .SYNOPSIS
        Transition a Jira ticket through intermediate statuses to reach the target.
    .DESCRIPTION
        Jira workflows require stepping through each adjacent status rather than
        jumping (To Do <-> In Progress <-> In Review <-> Done). This walks every
        intermediate transition, in either direction, so the ticket reaches the
        target whether that means advancing (leaf sync, parent activating) or
        regressing (a parent rolling back to In Progress when a child reopens).
        Step ordering comes from Get-TransitionPath (scripts/lib/jira-rollup.ps1).
    #>
    param(
        [string]$TicketKey,
        [string]$CurrentStatus,
        [string]$TargetStatus,
        [switch]$IsDryRun
    )

    # Reject malformed keys before they reach acli (injection guard).
    if (-not (Test-JiraKey $TicketKey)) {
        Write-Warning "Refusing to transition malformed ticket key '$TicketKey'"
        return $false
    }

    $path = Get-TransitionPath -CurrentStatus $CurrentStatus -TargetStatus $TargetStatus

    if ($path.Count -eq 0) {
        Write-Warning "Cannot transition $TicketKey from '$CurrentStatus' to '$TargetStatus' -- skipping"
        return $false
    }

    foreach ($nextStatus in $path) {
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

# Effective post-run status of each leaf the per-ticket pass visited: the target
# status when we transitioned (or would, under -DryRun), else the current status.
# The rollup pass reads this so a parent rolls up off what its children *became*
# this run, not their stale Jira value -- which also makes -DryRun rollups honest.
$effectiveStatus = @{}

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

        # Effective post-run status for the rollup pass: the target when we did
        # (or under -DryRun, would) transition it; otherwise its current status.
        $effective = $status
        if ($AutoUpdate -and $shouldUpdate -and $targetStatus -and ($DryRun -or $transitionOk)) {
            $effective = $targetStatus
        }
        $effectiveStatus[$ticketKey] = $effective

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

# ============================================================================
# Hierarchical parent rollup pass
# ============================================================================
# The per-ticket pass above only ever touches issues that have their own branch
# or PR. A parent (Story, Epic, Initiative, ...) has no branch of its own, so its
# status is reconciled here from its children -- at every level of the hierarchy
# (Task -> Story -> Epic -> Initiative). Reconciliation is bidirectional: a parent
# advances when a child starts and regresses when a child reopens.

$script:issueInfoCache = @{}
$script:childrenCache = @{}
# Parents whose children search hit the acli --limit ceiling. acli has no cursor
# pagination, so a capped result is a partial set; we record the key here and skip
# deriving a rollup status from it rather than acting on incomplete data.
$script:childrenTruncated = @{}
$script:rollupResults = @()

function Get-IssueRollupInfo {
    # One acli JSON view -> @{ Key; Status; Type; ParentKey }, or $null on failure.
    param([string]$Key)
    if ($script:issueInfoCache.ContainsKey($Key)) { return $script:issueInfoCache[$Key] }

    # Injection guard: never pass an unvalidated key to acli.
    if (-not (Test-JiraKey $Key)) {
        $script:issueInfoCache[$Key] = $null
        return $null
    }

    $json = acli jira workitem view $Key --fields "key,status,parent,issuetype" --json 2>$null
    $info = $null
    if ($LASTEXITCODE -eq 0 -and $json) {
        try {
            $obj = $json | ConvertFrom-Json
            $info = @{
                Key       = $Key
                Status    = $obj.fields.status.name
                Type      = $obj.fields.issuetype.name
                ParentKey = if ($obj.fields.parent) { $obj.fields.parent.key } else { $null }
            }
        } catch {
            $info = $null
        }
    }
    $script:issueInfoCache[$Key] = $info
    return $info
}

function Get-IssueChildren {
    # Direct children of $Key as @( @{ Key; Status }, ... ). Empty if none/leaf.
    param([string]$Key)
    if ($script:childrenCache.ContainsKey($Key)) { return , @($script:childrenCache[$Key]) }

    # Injection guard: $Key is interpolated into the JQL string below.
    if (-not (Test-JiraKey $Key)) {
        $script:childrenCache[$Key] = @()
        return , @()
    }

    # acli search exposes only --limit (no cursor/offset), so a parent with more
    # children than $childLimit is capped. When that happens we flag the parent as
    # truncated and the rollup caller skips deriving a status from the partial set
    # (see Invoke-ParentRollup) rather than risk a wrong derivation. The limit is
    # set well above realistic parents (QA page epics have tens of children).
    $childLimit = 500
    $json = acli jira workitem search --jql "parent = $Key" --fields "key,status,issuetype" --limit $childLimit --json 2>$null
    $children = @()
    if ($LASTEXITCODE -eq 0 -and $json) {
        try {
            $items = @($json | ConvertFrom-Json)
            if ($items.Count -ge $childLimit) {
                $script:childrenTruncated[$Key] = $true
                Write-Warning "Parent $Key has >= $childLimit children -- acli search has no cursor pagination, so the result is capped. Its rollup will be skipped to avoid deriving a status from a partial set."
            }
            foreach ($item in $items) {
                $children += @{ Key = $item.key; Status = $item.fields.status.name }
            }
        } catch { }
    }
    $script:childrenCache[$Key] = $children
    return , $children
}

function Invoke-ParentRollup {
    # Reconcile one parent from its children and record its effective status so
    # the next level up rolls off the post-run value.
    param([string]$ParentKey, $Children)

    # Guard against PowerShell unwrapping a single-element array to a scalar
    # (a bare hashtable's .Count is its key count, which would corrupt the rollup).
    $Children = @($Children)

    # If the children search was capped at the acli --limit ceiling, the set is
    # partial and deriving a rollup from it could produce a wrong status. Skip the
    # derivation and propagate the parent's real status so ancestors still roll up
    # off reality (never fabricate a status when the info fetch itself fails).
    if ($script:childrenTruncated[$ParentKey]) {
        $info = Get-IssueRollupInfo -Key $ParentKey
        if ($info) { $effectiveStatus[$ParentKey] = $info.Status }
        Write-Warning "Rollup skipped for $ParentKey -- children list was truncated (partial data)."
        return
    }

    if ($Children.Count -eq 0) {
        # Not actually a parent (or a transient search miss): propagate its real
        # status so any ancestor still unblocks and rolls up off reality. If the
        # info fetch itself failed, do NOT fabricate a status -- a bogus "To Do"
        # could wrongly regress an ancestor. Leave it unset and warn; the ancestor
        # falls back to this child's real Jira status from its own children search.
        $info = Get-IssueRollupInfo -Key $ParentKey
        if ($info) {
            $effectiveStatus[$ParentKey] = $info.Status
        } else {
            Write-Warning "Rollup: could not fetch status for $ParentKey; leaving it out of the rollup."
        }
        return
    }

    $childStatuses = @()
    foreach ($child in $Children) {
        if ($effectiveStatus.ContainsKey($child.Key)) {
            $childStatuses += $effectiveStatus[$child.Key]
        } else {
            $childStatuses += $child.Status
        }
    }

    $desired = Get-RolledUpStatus -ChildStatuses $childStatuses
    if (-not $desired) { return }

    $info = Get-IssueRollupInfo -Key $ParentKey
    $current = if ($info) { $info.Status } else { "UNKNOWN" }
    $type = if ($info) { $info.Type } else { "?" }

    # Default the propagated status to reality; only override to $desired when we
    # actually apply (or simulate under -DryRun), mirroring the leaf pass.
    $effectiveStatus[$ParentKey] = $current

    if ($current -eq $desired) {
        $recommendation = "[OK] In sync"
        Write-Host "[ROLLUP] $ParentKey ($type): $current" -ForegroundColor DarkGray
    } else {
        $recommendation = "Rollup: children imply '$desired' (currently '$current')"
        Write-Host "[ROLLUP] $ParentKey ($type): $current -> $desired" -ForegroundColor Cyan
        if ($AutoUpdate) {
            $ok = Invoke-JiraTransition -TicketKey $ParentKey -CurrentStatus $current -TargetStatus $desired -IsDryRun:$DryRun
            if ($DryRun -or $ok) {
                $effectiveStatus[$ParentKey] = $desired
            } elseif (-not $ok) {
                Write-Error "Failed to roll up $ParentKey from '$current' to '$desired'"
            }
        } else {
            Write-Warning $recommendation
        }
    }

    $script:rollupResults += [PSCustomObject]@{
        Ticket         = $ParentKey
        Branches       = "(parent: $type)"
        JiraStatus     = $current
        PRStatus       = "Rollup"
        Merged         = "N/A"
        Recommendation = $recommendation
    }
}

if ($RollupScope -ne "None") {
    Write-Header "Parent rollup pass ($RollupScope)..."

    # 1. Build the set of parent keys to reconcile.
    $parentSet = @{}

    if ($RollupScope -eq "Touched") {
        # Walk the ancestor chain of every ticket the per-ticket pass evaluated.
        foreach ($leafKey in @($effectiveStatus.Keys)) {
            $cursor = $leafKey
            $guard = 0
            while ($cursor -and $guard -lt 20) {
                $info = Get-IssueRollupInfo -Key $cursor
                if (-not $info -or -not $info.ParentKey) { break }
                $parentSet[$info.ParentKey] = $true
                $cursor = $info.ParentKey
                $guard++
            }
        }
    } elseif ($RollupScope -eq "AllOpen") {
        # One broad query yields every child + its parent for the project.
        $proj = $null
        foreach ($k in $branchTickets.Keys) {
            if ($k -match '^([A-Z][A-Z0-9_]+)-\d+') { $proj = $matches[1]; break }
        }
        # Injection guard: $proj is interpolated into the discovery JQL below.
        if (-not $proj -or -not (Test-JiraProjectKey $proj)) {
            Write-Warning "AllOpen rollup: could not determine a valid project key; skipping."
        } else {
            $discoveryLimit = 5000
            $allChildrenJson = acli jira workitem search --jql "project = $proj AND parent is not EMPTY" --fields "key,status,parent" --limit $discoveryLimit --json 2>$null
            if ($LASTEXITCODE -eq 0 -and $allChildrenJson) {
                try {
                    $allChildren = @($allChildrenJson | ConvertFrom-Json)
                    $discoveryTruncated = $allChildren.Count -ge $discoveryLimit
                    if ($discoveryTruncated) {
                        Write-Warning "AllOpen rollup hit the discovery cap ($discoveryLimit) -- acli search has no cursor pagination, so the child set is partial. Affected parents' rollups will be skipped to avoid deriving a status from incomplete data."
                    }
                    $grouped = @{}
                    foreach ($item in $allChildren) {
                        $pk = $item.fields.parent.key
                        if (-not $pk) { continue }
                        $parentSet[$pk] = $true
                        if (-not $grouped.ContainsKey($pk)) { $grouped[$pk] = @() }
                        $grouped[$pk] += @{ Key = $item.key; Status = $item.fields.status.name }
                    }
                    # Pre-seed the children cache so each parent skips a per-parent search.
                    foreach ($pk in $grouped.Keys) {
                        $script:childrenCache[$pk] = $grouped[$pk]
                        # When discovery was capped we cannot tell which parents got a
                        # complete child set, so mark them all truncated; each rollup
                        # then skips derivation rather than acting on partial data.
                        if ($discoveryTruncated) { $script:childrenTruncated[$pk] = $true }
                    }
                } catch {
                    Write-Warning "AllOpen rollup: could not parse discovery query; skipping."
                }
            }
        }
    }

    Write-Info "Reconciling $($parentSet.Count) parent(s)..."

    # 2. Reconcile bottom-up: finalize a parent only once every child that is
    #    itself a parent in our set has been finalized, so each level rolls up off
    #    its children's post-run statuses (and -DryRun simulations).
    $pending = New-Object System.Collections.Generic.List[string]
    foreach ($k in $parentSet.Keys) { [void]$pending.Add($k) }

    while ($pending.Count -gt 0) {
        $progressed = $false
        $remaining = New-Object System.Collections.Generic.List[string]

        foreach ($parentKey in $pending) {
            $children = @(Get-IssueChildren -Key $parentKey)
            $blocked = $false
            foreach ($child in $children) {
                if ($parentSet.ContainsKey($child.Key) -and -not $effectiveStatus.ContainsKey($child.Key)) {
                    $blocked = $true
                    break
                }
            }
            if ($blocked) {
                [void]$remaining.Add($parentKey)
                continue
            }
            Invoke-ParentRollup -ParentKey $parentKey -Children $children
            $progressed = $true
        }

        if (-not $progressed) {
            # No tree should cycle; if we stall, reconcile the rest with whatever
            # child statuses we have rather than loop forever.
            foreach ($parentKey in $remaining) {
                Invoke-ParentRollup -ParentKey $parentKey -Children (Get-IssueChildren -Key $parentKey)
            }
            break
        }
        $pending = $remaining
    }

    # Fold rollup rows into the combined summary below.
    if ($script:rollupResults.Count -gt 0) {
        $results += $script:rollupResults
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
