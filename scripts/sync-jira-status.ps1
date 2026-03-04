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
.EXAMPLE
    .\scripts\sync-jira-status.ps1
    Show status of all branches with Jira tickets
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
    [switch]$ShowAll
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

# Jira workflow order — transitions must walk through each intermediate status
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

# Function to get PR status for a branch
function Get-PRStatus {
    param([string]$Branch)
    
    if (-not $ghAvailable) {
        return @{ Exists = $false; State = "unknown"; Merged = $false }
    }
    
    try {
        # Clean branch name
        $cleanBranch = $Branch -replace '^remotes/origin/', ''
        
        # Method 1: Try direct PR list with branch head
        $prJson = gh pr list --head $cleanBranch --state all --json state,mergedAt,number --limit 10 2>$null
        
        if ($prJson) {
            $prs = $prJson | ConvertFrom-Json
            if ($prs -and $prs.Count -gt 0) {
                $pr = $prs[0]
                return @{
                    Exists = $true
                    State = $pr.state
                    Merged = ($pr.state -eq "MERGED" -or $pr.mergedAt)
                    Number = $pr.number
                }
            }
        }
        
        # Method 2: Search all PRs and filter by branch name in search
        $searchJson = gh pr list --search "head:$cleanBranch" --state all --json state,mergedAt,number,headRefName --limit 10 2>$null
        
        if ($searchJson) {
            $prs = $searchJson | ConvertFrom-Json
            $matchingPr = $prs | Where-Object { $_.headRefName -eq $cleanBranch } | Select-Object -First 1
            
            if ($matchingPr) {
                return @{
                    Exists = $true
                    State = $matchingPr.state
                    Merged = ($matchingPr.state -eq "MERGED" -or $matchingPr.mergedAt)
                    Number = $matchingPr.number
                }
            }
        }
        
        # Method 3: Try all recent PRs and match branch name
        $allPrsJson = gh pr list --state all --json state,mergedAt,number,headRefName --limit 100 2>$null
        
        if ($allPrsJson) {
            $allPrs = $allPrsJson | ConvertFrom-Json
            $matchingPr = $allPrs | Where-Object { $_.headRefName -eq $cleanBranch } | Select-Object -First 1
            
            if ($matchingPr) {
                return @{
                    Exists = $true
                    State = $matchingPr.state
                    Merged = ($matchingPr.state -eq "MERGED" -or $matchingPr.mergedAt)
                    Number = $matchingPr.number
                }
            }
        }
        
        return @{ Exists = $false; State = "none"; Merged = $false }
    } catch {
        Write-Verbose "Error checking PR status: $($_.Exception.Message)"
        return @{ Exists = $false; State = "unknown"; Merged = $false }
    }
}

# Get all branches
Write-Header "Fetching branches..."
$branches = git branch -a | ForEach-Object { $_.Trim() -replace '^\*\s*', '' -replace '^remotes/origin/', '' } | Where-Object { $_ -notmatch '^HEAD' } | Select-Object -Unique

Write-Info "Found $($branches.Count) unique branches"

# Extract Jira ticket keys from branch names
$ticketPattern = 'LS-\d+'
$branchTickets = @{}

foreach ($branch in $branches) {
    if ($branch -match $ticketPattern) {
        $ticketKey = $matches[0]
        if (-not $branchTickets.ContainsKey($ticketKey)) {
            $branchTickets[$ticketKey] = @()
        }
        $branchTickets[$ticketKey] += $branch
    } elseif ($ShowAll) {
        Write-Info "Branch without ticket: $branch"
    }
}

Write-Success "Found $($branchTickets.Count) branches with Jira tickets"

# Check each ticket status
Write-Header "Checking Jira ticket statuses..."

$results = @()

foreach ($ticketKey in $branchTickets.Keys | Sort-Object) {
    $branchList = $branchTickets[$ticketKey]
    
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

# Statistics
Write-Header "Statistics"
$totalTickets = $results.Count
$inSync = ($results | Where-Object { $_.Recommendation -eq "[OK] In sync" }).Count
$needsAttention = $totalTickets - $inSync

Write-Info "Total tickets: $totalTickets"
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
