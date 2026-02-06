#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Smart branch creation with automatic Jira ticket linking
.DESCRIPTION
    Creates a new branch with twig and automatically updates Jira status
.PARAMETER TicketKey
    Jira ticket key (e.g., LS-1234)
.PARAMETER FromCurrent
    Create branch from current branch instead of main
.PARAMETER AddToSprint
    Automatically add ticket to current sprint (skips prompt)
.PARAMETER NonInteractive
    Skip all interactive prompts (for agent/automation use)
.EXAMPLE
    .\scripts\branch-create.ps1 -TicketKey LS-1234
.EXAMPLE
    .\scripts\branch-create.ps1 -TicketKey LS-1234 -FromCurrent
.EXAMPLE
    .\scripts\branch-create.ps1 -TicketKey LS-1234 -NonInteractive -AddToSprint
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TicketKey,
    
    [switch]$FromCurrent,
    
    [switch]$AddToSprint,
    
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

Write-Host "[BRANCH] Creating branch for $TicketKey" -ForegroundColor Cyan

# Refresh PATH for acli
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Check if ticket exists
Write-Host "`n[INFO] Fetching ticket details..." -ForegroundColor Yellow
$ticketInfo = acli jira workitem view $TicketKey 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Could not find ticket $TicketKey" -ForegroundColor Red
    exit 1
}

Write-Host $ticketInfo

# Detect current branch
$currentBranch = git branch --show-current
$isOnFeatureBranch = $currentBranch -match '^LS-\d+$'

# Determine parent branch
if (-not $FromCurrent -and $isOnFeatureBranch -and -not $NonInteractive) {
    Write-Host "`n[QUESTION] Currently on feature branch: $currentBranch" -ForegroundColor Yellow
    $response = Read-Host "Create new branch from current ($currentBranch) or main? (c/m) [default: current]"
    if ($response -eq 'm') {
        $FromCurrent = $false
    } else {
        $FromCurrent = $true
    }
} elseif (-not $FromCurrent -and $isOnFeatureBranch -and $NonInteractive) {
    # In non-interactive mode on a feature branch, default to current
    Write-Host "[INFO] On feature branch $currentBranch - defaulting to create from current" -ForegroundColor Yellow
    $FromCurrent = $true
}

# Ask to add to current sprint (skip in non-interactive mode)
if (-not $NonInteractive) {
    $response = Read-Host "`nAdd to current sprint? (y/n)"
    if ($response -eq 'y') {
        $AddToSprint = $true
    }
}

if ($AddToSprint) {
    Write-Host "[INFO] Adding to current sprint..." -ForegroundColor Cyan
    # Note: You'll need to adjust this command based on your Jira setup
    # acli jira sprint add-workitems --sprint <sprint-id> --workitem $TicketKey
    Write-Host "[WARN] Manual step: Add $TicketKey to current sprint in Jira" -ForegroundColor Yellow
}

# Create branch
if ($FromCurrent) {
    Write-Host "`n[INFO] Creating branch from current branch ($currentBranch)..." -ForegroundColor Cyan
    twig switch $TicketKey -p
} else {
    Write-Host "`n[INFO] Creating branch from main..." -ForegroundColor Cyan
    git checkout main
    git pull
    twig switch $TicketKey -p=main
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to create branch" -ForegroundColor Red
    exit 1
}

# Update Jira status to In Progress
Write-Host "`n[INFO] Updating Jira ticket to 'In Progress'..." -ForegroundColor Cyan
acli jira workitem transition --key $TicketKey --status "In Progress"

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Jira ticket updated" -ForegroundColor Green
} else {
    Write-Host "[WARN] Could not update Jira status automatically" -ForegroundColor Yellow
}

# Show branch tree
Write-Host "`n[TREE] Branch tree:" -ForegroundColor Cyan
twig tree

Write-Host "`n[OK] Ready to code! Branch: $TicketKey" -ForegroundColor Green
Write-Host "   When done: make pre-commit && git push && twig github pr create-pr" -ForegroundColor Gray
