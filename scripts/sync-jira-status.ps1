#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Synchronize Jira ticket statuses with associated Git branches
.DESCRIPTION
    This script examines all Git branches, extracts Jira ticket keys,
    and reports on ticket statuses. It can optionally update Jira statuses
    based on branch/PR state (e.g., merged PR → Done, open PR → In Review).
    Only a merged PR is Done evidence; a branch that is merely an ancestor of
    main is reported for manual review (in a squash-merge repo that shape is
    almost always a zero-commit leftover, not merged work). Tickets that have
    children are never transitioned here — the rollup pass derives their
    status from their children.

    Shared policy with .github/workflows/jira-branch-sync.yml and
    jira-status-audit.yml (LS-8583 — see scripts/lib/jira-rollup.ps1 for the
    mirrored helpers and full rationale):
      - Leaf-ticket transitions (this per-ticket pass) are forward-only,
        full stop — mirroring jira-status-audit.yml's periodic guard call,
        under which jira-branch-sync's one narrow downgrade (In Review ->
        In Progress on a specific PR action) never applies.
      - Parent/epic rollup is deliberately bidirectional — mirroring
        jira-status-audit.yml's epic audit, which explicitly demotes a Done
        epic when a child reopens — but only once children are ALL In Review
        or Done does a parent reach "In Review" (LS-4683; a lone Done child
        is never "active work" on its own).
      - Ticket-key selection for agent branches (claude/*) is marker-first
        (the PR body's <!-- jira-link --> block), falling back to the PR
        title then the branch name — matching tools/jira-sync exactly, so a
        PR title mentioning an unrelated ticket (e.g. "port of LS-5910")
        never gets swept in.
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
      Touched - (default) reconcile every visited ticket that is itself a
                parent, plus the full ancestor chain of every ticket this run
                visited. Cheap; no extra discovery query.
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

# Pure rollup + shared-policy helpers (Get-RolledUpStatus, Get-TransitionPath,
# Test-ForwardOnlyTransition, Get-DeclaredTicketKey, Get-JiraTicketKeys,
# $JiraWorkflowOrder) -- see that file's header for the LS-8583 parity notes.
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

# ----------------------------------------------------------------------------
# Jira issue lookup helpers (shared by the leaf pass and the rollup pass).
# Defined before the leaf loop because the leaf pass consults Get-IssueChildren
# to refuse branch-driven transitions on parent tickets (LS-8582).
# ----------------------------------------------------------------------------

$script:issueInfoCache = @{}
$script:childrenCache = @{}
# Parents whose children search hit the acli --limit ceiling. acli has no cursor
# pagination, so a capped result is a partial set; we record the key here and skip
# deriving a rollup status from it rather than acting on incomplete data.
$script:childrenTruncated = @{}
# Tickets the leaf pass visited that turned out to be parents; the rollup pass
# reconciles them from their children (the leaf pass never transitions them).
$script:touchedParents = @{}

function Get-IssueRollupInfo {
    # One acli JSON view -> @{ Key; Status; Type; ParentKey; Labels }, or $null on failure.
    param([string]$Key)
    if ($script:issueInfoCache.ContainsKey($Key)) { return $script:issueInfoCache[$Key] }

    # Injection guard: never pass an unvalidated key to acli.
    if (-not (Test-JiraKey $Key)) {
        $script:issueInfoCache[$Key] = $null
        return $null
    }

    $json = acli jira workitem view $Key --fields "key,status,parent,issuetype,labels" --json 2>$null
    $info = $null
    if ($LASTEXITCODE -eq 0 -and $json) {
        # ConvertFrom-JsonArray for uniform, version-stable parsing; a view
        # returns one object, so take the first (and only) element.
        $obj = (ConvertFrom-JsonArray $json) | Select-Object -First 1
        if ($obj -and $obj.fields) {
            $info = @{
                Key       = $Key
                Status    = $obj.fields.status.name
                Type      = $obj.fields.issuetype.name
                ParentKey = if ($obj.fields.parent) { $obj.fields.parent.key } else { $null }
                Labels    = @($obj.fields.labels)
            }
        }
    }
    $script:issueInfoCache[$Key] = $info
    return $info
}

function Get-IssueChildren {
    # Direct children of $Key as @( @{ Key; Status }, ... ). Empty if none/leaf.
    #
    # Return convention: plain `return $children` (NO comma wrap). Every caller
    # wraps the call in @(...), and @(f) around a comma-wrapped return yields a
    # ONE-element array nesting the real array — for a childless ticket that is
    # @( @() ), whose .Key member-enumerates to $null and crashed the rollup
    # ordering pass / made every Done leaf look like a parent (LS-8582).
    # Plain return + @(caller) gives the correct per-item array in all cases.
    param([string]$Key)
    if ($script:childrenCache.ContainsKey($Key)) { return @($script:childrenCache[$Key]) }

    # Injection guard: $Key is interpolated into the JQL string below.
    if (-not (Test-JiraKey $Key)) {
        $script:childrenCache[$Key] = @()
        return @()
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
        # ConvertFrom-JsonArray: version-stable array parsing -- the previous
        # @($json | ConvertFrom-Json) collapsed to Count=1 under PS 5.1, which
        # disabled the truncation guard and broke per-child keys (LS-8582).
        $items = ConvertFrom-JsonArray $json
        if ($items.Count -ge $childLimit) {
            $script:childrenTruncated[$Key] = $true
            Write-Warning "Parent $Key has >= $childLimit children -- acli search has no cursor pagination, so the result is capped. Its rollup will be skipped to avoid deriving a status from a partial set."
        }
        foreach ($item in $items) {
            if ($item -and $item.key) {
                $children += @{ Key = $item.key; Status = $item.fields.status.name }
            }
        }
        # A transient acli failure (rate limit, malformed page) can yield items
        # that aren't issues. Surface it: a silent drop here once let a junk
        # entry masquerade as a child and crash the rollup ordering pass.
        if ($items.Count -ne $children.Count) {
            Write-Warning "Get-IssueChildren($Key): dropped $($items.Count - $children.Count) non-issue item(s) from the children search result."
        }
    }
    $script:childrenCache[$Key] = $children
    return $children
}

# Get all branches
Write-Header "Fetching branches..."
# '^[*+]\s*': git prefixes the current branch with '*' and branches checked
# out in linked worktrees with '+'. Both must be stripped or the dirty name
# ("+ claude/x") misses every PR-map lookup and duplicates its clean twin.
$branches = git branch -a | ForEach-Object { $_.Trim() -replace '^[*+]\s*', '' -replace '^remotes/origin/', '' } | Where-Object { $_ -notmatch '^HEAD' } | Select-Object -Unique

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
        # ConvertFrom-JsonArray, not @($x | ConvertFrom-Json): under Windows
        # PowerShell 5.1 the latter collapses the whole PR array into a single
        # element, leaving prMap with one garbage Object[]-keyed entry and
        # every branch lookup false (LS-8582).
        $allPrs = ConvertFrom-JsonArray $allPrsJson
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

# For agent branches, resolve the declared ticket key from the pre-fetched PR
# map (marker-first, matching tools/jira-sync -- see Get-DeclaredTicketKey in
# scripts/lib/jira-rollup.ps1) instead of issuing one gh call per branch.
#
# LS-8583: this used to sweep ALL title keys plus a body closing-keyword scan
# that included "completes" (not a real GitHub keyword -- the previous
# "matching GHA logic" comment was stale) and could associate a PR with every
# ticket its title merely mentioned (e.g. "port of LS-5910" pulling in a
# foreign, unrelated ticket). Get-DeclaredTicketKey resolves exactly the one
# ticket a PR declares: its <!-- jira-link --> marker primary, falling back
# to the first title key, then the first branch-name key.
if ($agentBranches.Count -gt 0 -and $ghAvailable) {
    Write-Info "Resolving ticket keys for $($agentBranches.Count) agent branch(es) via marker-first key selection..."

    foreach ($branch in $agentBranches) {
        if (-not $prMap.ContainsKey($branch)) {
            if ($ShowAll) { Write-Info "Agent branch without PR: $branch" }
            continue
        }

        $pr = $prMap[$branch]
        $ticketKey = Get-DeclaredTicketKey -Title $pr.title -Body $pr.body -Branch $branch

        if (-not $ticketKey) {
            if ($ShowAll) { Write-Info "Agent branch $branch -> no declared ticket (no jira-link marker, title key, or branch key)" }
            continue
        }

        if (-not $branchTickets.ContainsKey($ticketKey)) {
            $branchTickets[$ticketKey] = @()
        }
        if ($branchTickets[$ticketKey] -notcontains $branch) {
            $branchTickets[$ticketKey] += $branch
        }
        Write-Info "Agent branch $branch -> $ticketKey (PR #$($pr.number))"
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

    # Get ticket info from Jira (JSON avoids false-positive regex matches against
    # description/comment text that may contain "Status: <some text>").
    try {
        # 2>$null, not 2>&1: an acli warning on stderr would corrupt the JSON
        # and silently degrade the status to UNKNOWN.
        $ticketJson = acli jira workitem view $ticketKey --fields "key,status" --json 2>$null | Out-String

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

        # ConvertFrom-JsonArray for uniform, version-stable parsing (returns @()
        # on malformed output, so a null-safe chain degrades to UNKNOWN).
        $ticketObj = (ConvertFrom-JsonArray $ticketJson) | Select-Object -First 1
        $status = $ticketObj.fields.status.name
        if (-not $status) { $status = "UNKNOWN" }
        
        # Check if branches are merged and PR status
        $mergedBranches = @()
        $activeBranches = @()
        $closedPRBranches = @()  # Branches whose PR was closed without merging (abandoned/restarted)
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
            } elseif ($branchPRInfo.Exists -and $branchPRInfo.State -eq "CLOSED") {
                # A closed (non-merged) PR means the branch was abandoned or the ticket
                # was restarted. Do not treat it as an active branch.
                $closedPRBranches += $cleanBranch
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

        if ($closedPRBranches.Count -gt 0) {
            Write-Info "Closed-PR branches (abandoned/restarted): $($closedPRBranches -join ', ')"
        }

        # Determine recommendation based on PR and branch state
        $recommendation = ""
        $shouldUpdate = $false
        $targetStatus = ""

        # Terminal non-Done statuses cannot be transitioned via the normal workflow.
        # Leave them as-is and report in sync so they don't appear as "needs attention".
        # ($JiraTerminalStatuses comes from scripts/lib/jira-rollup.ps1, shared with
        # the rollup derivation so both passes agree on what "terminal" means.)
        if ($status -in $JiraTerminalStatuses) {
            $recommendation = "[OK] $status - skipping transition"
            $effectiveStatus[$ticketKey] = $status
            Write-Success $recommendation
            $results += [PSCustomObject]@{
                Ticket     = $ticketKey
                Branches   = $branchList -join ', '
                JiraStatus = $status
                PRStatus   = if ($prInfo -and $prInfo.Exists) { if ($prInfo.Merged) { "Merged" } else { $prInfo.State } } else { "None" }
                Merged     = if ($mergedBranches.Count -gt 0) { "Yes" } else { "No" }
                Recommendation = $recommendation
            }
            continue
        }

        # Priority 1: PR merged → Done
        if ($prInfo -and $prInfo.Merged -and $status -ne "Done") {
            $recommendation = "PR merged but ticket not Done"
            $shouldUpdate = $true
            $targetStatus = "Done"
        }
        # Priority 2: branch is an ancestor of main but there is no merged PR.
        # NOT Done evidence in a squash-merge repo: a really-merged PR's branch
        # tip never becomes an ancestor of main (the squash commit is a new
        # SHA) -- the branches that DO show up in `git branch --merged main`
        # are typically zero-commit worktree leftovers, which walked three
        # epics to Done on 2026-07-22 (LS-8582). Report for manual review only.
        elseif ($mergedBranches.Count -gt 0 -and $status -ne "Done") {
            $recommendation = "Branch is ancestor of main but no merged PR found - verify manually (not auto-transitioned)"
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
        # Priority 5: Only closed (non-merged) PRs — branch was abandoned or ticket restarted
        elseif ($closedPRBranches.Count -gt 0 -and $mergedBranches.Count -eq 0 -and $activeBranches.Count -eq 0) {
            $recommendation = "PR closed without merging - may be abandoned or restarted; verify ticket status"
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

        # Shared monotonic policy (LS-8583): leaf-ticket transitions in this
        # script's periodic reconciliation are forward-only, full stop --
        # mirroring jira-status-audit.yml's periodic guard call, under which
        # jira-branch-sync's one narrow downgrade (In Review -> In Progress on
        # a specific PR action) never applies. See Test-ForwardOnlyTransition
        # in scripts/lib/jira-rollup.ps1 for the full rationale. The priority
        # chain above never proposes a backward move today, so this is a
        # defensive parity guard against future regressions, not a live fix.
        if ($shouldUpdate -and $targetStatus -and -not (Test-ForwardOnlyTransition -Current $status -Target $targetStatus)) {
            Write-Warning "Refusing to transition $ticketKey from '$status' to '$targetStatus' -- backward move violates the shared monotonic policy; manual review needed"
            $recommendation = "Guard refused: '$status' -> '$targetStatus' is a backward move (shared monotonic policy) -- manual review needed"
            $shouldUpdate = $false
            $targetStatus = ""
        }

        # Parent guard (LS-8582): a ticket with children is never transitioned
        # from branch/PR evidence -- its status is derived from its children in
        # the rollup pass. Only pay the children lookup when it matters: a
        # transition is pending, or a Done status is about to enter the ledger.
        $isParent = $false
        if ($shouldUpdate -or $status -eq "Done") {
            $isParent = (@(Get-IssueChildren -Key $ticketKey)).Count -gt 0
        }
        if ($isParent) {
            $script:touchedParents[$ticketKey] = $true
            if ($shouldUpdate) {
                $recommendation = "Parent ticket - branch/PR evidence ignored; status derives from children (rollup pass)"
                $shouldUpdate = $false
                $targetStatus = ""
            }
        }

        # Auto-update if enabled
        $transitionOk = $false
        if ($AutoUpdate -and $shouldUpdate -and $targetStatus) {
            $transitionOk = Invoke-JiraTransition -TicketKey $ticketKey -CurrentStatus $status -TargetStatus $targetStatus -IsDryRun:$DryRun
            if ($transitionOk -or $DryRun) {
                # Transition succeeded (or was simulated): treat as in sync for statistics.
                $recommendation = "[OK] In sync"
            } else {
                Write-Error "Failed to transition $ticketKey from '$status' to '$targetStatus'"
            }
        }

        if ($recommendation -eq "[OK] In sync") {
            Write-Success $recommendation
        } elseif ($recommendation) {
            Write-Warning $recommendation
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
        # it to Done. Never record during a dry run (no real state changed), and
        # never record a parent: its status is children-derived and can regress
        # when a child reopens, so it must stay visible to future runs.
        $reachedDone = ($status -eq "Done") -or ($targetStatus -eq "Done" -and $transitionOk)
        if ($reachedDone -and -not $isParent -and -not $DryRun -and -not $doneCache.ContainsKey($ticketKey)) {
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
#
# This is a deliberate policy decision (LS-8583), not an oversight: it mirrors
# jira-status-audit.yml's own epic-rollup audit, which explicitly demotes a
# Done epic back to In Progress/In Review when a child is reopened (LS-4683)
# -- see that workflow's "Epic audit" step comment. Get-RolledUpStatus
# (scripts/lib/jira-rollup.ps1) derives the exact same tiers that workflow's
# bash uses, so a demotion only ever fires when children have genuinely
# regressed, never from a stale/incorrect derivation.

$script:rollupResults = @()

function Invoke-ParentRollup {
    # Reconcile one parent from its children and record its effective status so
    # the next level up rolls off the post-run value.
    param([string]$ParentKey, $Children)

    # Guard against PowerShell unwrapping a single-element array to a scalar
    # (a bare hashtable's .Count is its key count, which would corrupt the
    # rollup), and drop null entries so an empty pipeline result ($null) can't
    # masquerade as one child.
    $Children = @($Children | Where-Object { $_ })

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
        # Defensive: a malformed child (null entry or missing Key) must not
        # feed the derivation or throw on hashtable lookup.
        if (-not $child -or -not $child.Key) {
            Write-Warning "Rollup: malformed child entry under $ParentKey -- skipping it."
            continue
        }
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

    # pinned-status: manual pin honored by jira-branch-sync; honor it here too
    # so the nightly reconciliation doesn't fight a deliberate override.
    if ($info -and @($info.Labels) -contains 'pinned-status') {
        $effectiveStatus[$ParentKey] = $current
        Write-Host "[ROLLUP] $ParentKey ($type): $current (pinned-status - skipping auto-sync)" -ForegroundColor DarkGray
        $script:rollupResults += [PSCustomObject]@{
            Ticket         = $ParentKey
            Branches       = "(parent: $type)"
            JiraStatus     = $current
            PRStatus       = "Rollup"
            Merged         = "N/A"
            Recommendation = "[OK] pinned-status - not auto-synced"
        }
        return
    }

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
        # Tickets the leaf pass visited that are themselves parents (e.g. an
        # epic with its own worktree branch) are reconciled too -- previously
        # only their ANCESTORS entered the set, so nothing ever corrected a
        # parent the leaf pass had touched (LS-8582).
        foreach ($k in @($script:touchedParents.Keys)) {
            $parentSet[$k] = $true
        }

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
                    # Version-stable array parsing (see ConvertFrom-JsonArray):
                    # under PS 5.1 the old pattern collapsed the discovery
                    # result to one element, reducing AllOpen to a no-op.
                    $allChildren = ConvertFrom-JsonArray $allChildrenJson
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
                # Defensive: skip malformed entries -- ContainsKey($null) throws
                # under $ErrorActionPreference = "Stop" (seen in the LS-8582
                # smoke run when a transient search result produced junk).
                if (-not $child -or -not $child.Key) { continue }
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
                Invoke-ParentRollup -ParentKey $parentKey -Children @(Get-IssueChildren -Key $parentKey)
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
