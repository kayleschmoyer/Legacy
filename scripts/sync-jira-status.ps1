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
        
        # Check if branches are merged
        $mergedBranches = @()
        $activeBranches = @()
        
        foreach ($branch in $branchList) {
            $cleanBranch = $branch -replace '^remotes/origin/', ''
            $mergedCheck = git branch --merged main | Where-Object { $_.Trim() -eq $cleanBranch }
            
            if ($mergedCheck) {
                $mergedBranches += $cleanBranch
            } else {
                $activeBranches += $cleanBranch
            }
        }
        
        Write-Info "Status: $status"
        
        if ($mergedBranches.Count -gt 0) {
            Write-Info "Merged branches: $($mergedBranches -join ', ')"
        }
        
        if ($activeBranches.Count -gt 0) {
            Write-Info "Active branches: $($activeBranches -join ', ')"
        }
        
        # Determine recommendation
        $recommendation = ""
        $shouldUpdate = $false
        $targetStatus = ""
        
        if ($mergedBranches.Count -gt 0 -and $status -ne "Done") {
            $recommendation = "Branch merged but ticket not Done"
            $shouldUpdate = $true
            $targetStatus = "Done"
        } elseif ($mergedBranches.Count -eq 0 -and $activeBranches.Count -gt 0) {
            if ($status -eq "To Do") {
                $recommendation = "Active branch but ticket in To Do - consider updating to In Progress"
                $shouldUpdate = $true
                $targetStatus = "In Progress"
            } elseif ($status -eq "Done") {
                $recommendation = "Ticket Done but branch not merged - verify completion"
            } else {
                $recommendation = "Branch active and ticket in progress - OK"
            }
        } elseif ($mergedBranches.Count -gt 0 -and $status -eq "Done") {
            $recommendation = "[OK] In sync"
        }
        
        # Auto-update if enabled
        if ($AutoUpdate -and $shouldUpdate -and $targetStatus) {
            if ($DryRun) {
                Write-Warning "DRY RUN: Would update $ticketKey to '$targetStatus'"
            } else {
                Write-Info "Updating $ticketKey to '$targetStatus'..."
                acli jira workitem transition --key $ticketKey --status $targetStatus 2>&1 | Out-Null
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Updated $ticketKey to $targetStatus"
                } else {
                    Write-Error "Failed to update $ticketKey"
                }
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
