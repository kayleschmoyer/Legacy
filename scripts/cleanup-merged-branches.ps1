#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clean up remote branches that have been merged
.DESCRIPTION
    Finds remote branches whose PRs have been merged and optionally deletes them.
    Safely excludes protected branches (main, develop, staging, production).
.PARAMETER Delete
    Actually delete the merged remote branches (requires confirmation unless -Force)
.PARAMETER Force
    Skip confirmation prompts when deleting
.PARAMETER BaseBranch
    The base branch to check merges against (default: main)
.PARAMETER IncludeLocal
    Also clean up local branches that track deleted remotes
.EXAMPLE
    .\scripts\cleanup-merged-branches.ps1
    Lists all merged remote branches (dry run)
.EXAMPLE
    .\scripts\cleanup-merged-branches.ps1 -Delete
    Deletes merged remote branches with confirmation
.EXAMPLE
    .\scripts\cleanup-merged-branches.ps1 -Delete -Force
    Deletes merged remote branches without confirmation
.EXAMPLE
    .\scripts\cleanup-merged-branches.ps1 -Delete -IncludeLocal
    Deletes merged remote branches and cleans up local tracking branches
#>

param(
    [switch]$Delete,
    [switch]$Force,
    [string]$BaseBranch = "main",
    [switch]$IncludeLocal
)

$ErrorActionPreference = "Stop"
$protectedBranches = @("main", "develop", "master", "staging", "production", "dev")

Write-Host "`n=== Remote Branch Cleanup Utility ===" -ForegroundColor Cyan
Write-Host "Base Branch: $BaseBranch" -ForegroundColor Yellow

Write-Host "`n[INFO] Fetching latest remote information..." -ForegroundColor Yellow
git fetch --prune origin 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to fetch remote information" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Analyzing remote branches..." -ForegroundColor Yellow
$remoteBranches = git branch -r --merged origin/$BaseBranch | ForEach-Object { $_.Trim() }

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to list remote branches" -ForegroundColor Red
    exit 1
}

$candidateBranches = $remoteBranches | Where-Object {
    $_ -notmatch "HEAD" -and $_ -match "^origin/" -and $_ -ne "origin/$BaseBranch"
} | ForEach-Object {
    $_ -replace "^origin/", ""
}

$branchesToCleanup = $candidateBranches | Where-Object {
    $branchName = $_
    $isProtected = $false
    foreach ($protected in $protectedBranches) {
        if ($branchName -eq $protected -or $branchName -like "$protected-*") {
            $isProtected = $true
            break
        }
    }
    -not $isProtected
}

if ($branchesToCleanup.Count -eq 0) {
    Write-Host "`n[SUCCESS] No merged branches to clean up!" -ForegroundColor Green
    exit 0
}

Write-Host "`n[FOUND] $($branchesToCleanup.Count) merged branch(es):" -ForegroundColor Cyan
$branchesToCleanup | ForEach-Object { Write-Host "  $($_)" -ForegroundColor White }

if (-not $Delete) {
    Write-Host "`n[DRY RUN] To delete these branches, run with -Delete flag" -ForegroundColor Yellow
    Write-Host "Example: .\scripts\cleanup-merged-branches.ps1 -Delete" -ForegroundColor Gray
    exit 0
}

if (-not $Force) {
    Write-Host "`n[WARNING] This will permanently delete $($branchesToCleanup.Count) remote branch(es)" -ForegroundColor Yellow
    $confirmation = Read-Host "Continue? (yes/no)"
    if ($confirmation -ne "yes" -and $confirmation -ne "y") {
        Write-Host "[CANCELLED] No branches were deleted" -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "`n[ACTION] Deleting merged remote branches..." -ForegroundColor Cyan
$successCount = 0
$failCount = 0
$failedBranches = @()

foreach ($branch in $branchesToCleanup) {
    Write-Host "  Deleting origin/$branch..." -NoNewline
    
    # Temporarily allow errors to capture output
    $oldErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    
    # Execute git command and capture all output
    $output = & git push origin --delete $branch 2>&1
    $exitCode = $LASTEXITCODE
    
    $ErrorActionPreference = $oldErrorAction
    
    if ($exitCode -eq 0) {
        Write-Host " OK" -ForegroundColor Green
        $successCount++
    }
    else {
        Write-Host " FAILED" -ForegroundColor Red
        $failCount++
        $failedBranches += $branch
        # Only show actual error messages (not informational git output)
        $errorLines = $output | Where-Object { $_ -match "error|fatal|failed" }
        if ($errorLines) {
            Write-Host "    Error: $($errorLines -join '; ')" -ForegroundColor Red
        }
    }
}

if ($IncludeLocal -and $successCount -gt 0) {
    Write-Host "`n[ACTION] Cleaning up local branches..." -ForegroundColor Cyan
    $currentBranch = git branch --show-current
    $localBranches = git branch | ForEach-Object { $_.Trim() -replace "^\* ", "" }
    foreach ($branch in $branchesToCleanup) {
        if (-not ($localBranches -contains $branch)) { continue }
        if ($currentBranch -eq $branch) {
            Write-Host "  Skipping $branch (currently checked out)" -ForegroundColor Yellow
            continue
        }
        Write-Host "  Deleting local $branch..." -NoNewline
        git branch -D $branch 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host " OK" -ForegroundColor Green
        }
        else {
            Write-Host " FAILED" -ForegroundColor Red
        }
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Successfully deleted: $successCount" -ForegroundColor Green

if ($failCount -gt 0) {
    Write-Host "Failed to delete: $failCount" -ForegroundColor Red
    Write-Host "`nFailed branches:" -ForegroundColor Red
    $failedBranches | ForEach-Object { Write-Host "  $($_)" -ForegroundColor Red }
}

if ($successCount -gt 0) {
    Write-Host "`n[TIP] Run 'git fetch --prune' to update local remote-tracking references" -ForegroundColor Yellow
    if (-not $IncludeLocal) {
        Write-Host "[TIP] Use -IncludeLocal flag to also delete local tracking branches" -ForegroundColor Yellow
    }
}

Write-Host "`n[DONE] Branch cleanup complete" -ForegroundColor Green
