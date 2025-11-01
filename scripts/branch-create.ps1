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
.EXAMPLE
    .\scripts\branch-create.ps1 -TicketKey LS-1234
.EXAMPLE
    .\scripts\branch-create.ps1 -TicketKey LS-1234 -FromCurrent
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TicketKey,
    
    [switch]$FromCurrent
)

$ErrorActionPreference = "Stop"

Write-Host "🌿 Creating branch for $TicketKey" -ForegroundColor Cyan

# Refresh PATH for acli
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Check if ticket exists
Write-Host "`n→ Fetching ticket details..." -ForegroundColor Yellow
$ticketInfo = acli jira workitem view $TicketKey 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Could not find ticket $TicketKey" -ForegroundColor Red
    exit 1
}

Write-Host $ticketInfo

# Ask to add to current sprint
$response = Read-Host "`nAdd to current sprint? (y/n)"
if ($response -eq 'y') {
    Write-Host "→ Adding to current sprint..." -ForegroundColor Cyan
    # Note: You'll need to adjust this command based on your Jira setup
    # acli jira sprint add-workitems --sprint <sprint-id> --workitem $TicketKey
    Write-Host "⚠ Manual step: Add $TicketKey to current sprint in Jira" -ForegroundColor Yellow
}

# Create branch
if ($FromCurrent) {
    Write-Host "`n→ Creating branch from current branch..." -ForegroundColor Cyan
    twig switch $TicketKey -p current
} else {
    Write-Host "`n→ Creating branch from main..." -ForegroundColor Cyan
    git checkout main
    git pull
    twig switch $TicketKey
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to create branch" -ForegroundColor Red
    exit 1
}

# Update Jira status to In Progress
Write-Host "`n→ Updating Jira ticket to 'In Progress'..." -ForegroundColor Cyan
acli jira workitem transition --key $TicketKey --status "In Progress"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Jira ticket updated" -ForegroundColor Green
} else {
    Write-Host "⚠ Could not update Jira status automatically" -ForegroundColor Yellow
}

# Show branch tree
Write-Host "`n📊 Branch tree:" -ForegroundColor Cyan
twig tree

Write-Host "`n✨ Ready to code! Branch: $TicketKey" -ForegroundColor Green
Write-Host "   When done: make pre-commit && git push && twig github pr create-pr" -ForegroundColor Gray
