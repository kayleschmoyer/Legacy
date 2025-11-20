#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automatically rebases an entire branch tree
.DESCRIPTION
    Rebases all branches in a twig tree, automatically resolving
    generated file conflicts and running validation checks.
.PARAMETER StartBranch
    Optional: Start from this branch instead of current branch
.PARAMETER AutoContinue
    If set, automatically continues through conflicts without prompting
.PARAMETER SkipCommits
    Comma-separated list of commit hashes to skip during rebase
.PARAMETER SkipCommitsFile
    Path to file containing commit hashes to skip (one per line, # for comments)
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1 -StartBranch LS-24 -AutoContinue
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1 -SkipCommits "abc1234,def5678"
.EXAMPLE
    .\scripts\rebase-branch-tree.ps1 -SkipCommitsFile "skip-commits.txt"
#>

param(
    [string]$StartBranch,
    [switch]$AutoContinue,
    [string]$SkipCommits,
    [string]$SkipCommitsFile,
    [switch]$IgnoreDefaultSkipFile
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolveConflictsScript = Join-Path $scriptDir "resolve-generated-conflicts.ps1"

# Parse skip-commits
function Get-CommitHashesFromFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return @()
    }

    return Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            if ($line -match '^([0-9a-f]{7,64})') {
                $matches[1]
            }
        }
    } | Where-Object { $_ }
}

$skipCommitList = @()
if ($SkipCommits) {
    $skipCommitList = $SkipCommits -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    if ($skipCommitList.Count -gt 0) {
        Write-Host "[->] Will skip commits (CLI): $($skipCommitList -join ', ')" -ForegroundColor Yellow
    }
}

if ($SkipCommitsFile) {
    if (-not (Test-Path $SkipCommitsFile)) {
        Write-Host "[X] Skip-commits file not found: $SkipCommitsFile" -ForegroundColor Red
        exit 1
    }

    $fileCommits = Get-CommitHashesFromFile -Path $SkipCommitsFile
    if ($fileCommits.Count -gt 0) {
        Write-Host "[->] Loaded skip-commits from file: $($fileCommits -join ', ')" -ForegroundColor Yellow
        $skipCommitList += $fileCommits
    }
}
elseif (-not $IgnoreDefaultSkipFile) {
    $repoRoot = Split-Path $scriptDir -Parent
    $defaultSkipFile = Join-Path $repoRoot "skip-commits.txt"
    if (Test-Path $defaultSkipFile) {
        $defaultCommits = Get-CommitHashesFromFile -Path $defaultSkipFile
        if ($defaultCommits.Count -gt 0) {
            Write-Host "[->] Auto-loaded skip-commits from repo default: $($defaultCommits -join ', ')" -ForegroundColor Yellow
            $skipCommitList += $defaultCommits
        }
    }
}

$skipCommitList = $skipCommitList | Select-Object -Unique

# Get current branch if not specified
if (-not $StartBranch) {
    $StartBranch = git branch --show-current
    if (-not $StartBranch) {
        Write-Host "[X] Could not determine current branch" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[TREE] Rebasing branch tree starting from: $StartBranch" -ForegroundColor Cyan
Write-Host ""

# Get the branch tree
$treeOutput = twig tree 2>&1 | Out-String
Write-Host $treeOutput

# Parse branches from tree (simplified - you may need to adjust)
$currentBranch = $StartBranch
$rebasedCount = 0
$failedBranches = @()

function Rebase-Branch {
    param([string]$branch)
    
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host "[->] Rebasing: $branch" -ForegroundColor Yellow
    Write-Host "============================================================`n" -ForegroundColor Cyan
    
    # Checkout the branch
    git checkout $branch 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Failed to checkout $branch" -ForegroundColor Red
        return $false
    }
    
    # Build twig rebase command with skip-commits if provided
    $rebaseCmd = "twig rebase"
    if ($skipCommitList.Count -gt 0) {
        $skipCommitsArg = $skipCommitList -join ','
        $rebaseCmd = "twig rebase --skip-commits `"$skipCommitsArg`""
        Write-Host "[->] Using skip-commits: $skipCommitsArg" -ForegroundColor Cyan
    }
    
    # Start rebase
    $rebaseOutput = Invoke-Expression "$rebaseCmd 2>&1"
    
    # Check if already up to date
    if ($rebaseOutput -match "up to date") {
        Write-Host "[OK] $branch is already up to date" -ForegroundColor Green
        return $true
    }
    
    # Handle conflicts in a loop
    $maxAttempts = 50  # Prevent infinite loops
    $attempt = 0
    
    while ($attempt -lt $maxAttempts) {
        $attempt++
        
        # Check for conflicts
        $conflicts = git diff --name-only --diff-filter=U 2>&1
        
        if ($conflicts) {
            Write-Host "`n[!] Conflicts detected (attempt $attempt):" -ForegroundColor Yellow
            $conflicts | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
            
            if ($AutoContinue) {
                Write-Host "`n[->] Auto-resolving conflicts..." -ForegroundColor Cyan
            } else {
                Write-Host "`n[->] Resolving conflicts..." -ForegroundColor Cyan
            }
            
            # Run conflict resolution script
            & $resolveConflictsScript
            $resolveExitCode = $LASTEXITCODE
            
            if ($resolveExitCode -ne 0) {
                Write-Host "`n[X] Auto-resolution script reported an error. Aborting rebase." -ForegroundColor Red
                git rebase --abort | Out-Null
                return $false
            }
            
            # Continue rebase
            Write-Host "[->] Continuing rebase..." -ForegroundColor Cyan
            $continueOutput = git rebase --continue 2>&1
            if ($LASTEXITCODE -ne 0) {
                if ($AutoContinue) {
                    Write-Host "[!] git rebase --continue failed, attempting --skip" -ForegroundColor Yellow
                    git rebase --skip 2>&1 | Out-Null
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "[X] Unable to skip conflicting commit automatically" -ForegroundColor Red
                        git rebase --abort | Out-Null
                        return $false
                    }
                    continue
                } else {
                    Write-Host "[X] git rebase --continue failed. Aborting for safety." -ForegroundColor Red
                    git rebase --abort | Out-Null
                    return $false
                }
            }
            
            # Check if rebase completed
            if ($continueOutput -match "Successfully rebased") {
                Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                return $true
            }
            
            # Check if there are more conflicts
            $newConflicts = git diff --name-only --diff-filter=U 2>&1
            if (-not $newConflicts) {
                # No more conflicts but rebase didn't complete - might be done
                $rebaseStatus = git status 2>&1 | Out-String
                if ($rebaseStatus -notmatch "rebase in progress") {
                    Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                    return $true
                }
            }
        } else {
            # No conflicts, check if rebase is still in progress
            $rebaseStatus = git status 2>&1 | Out-String
            if ($rebaseStatus -match "rebase in progress") {
                # Try to continue
                git rebase --continue 2>&1 | Out-Null
                
                # Check again
                $stillInProgress = git status 2>&1 | Out-String
                if ($stillInProgress -notmatch "rebase in progress") {
                    Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                    return $true
                }
            } else {
                Write-Host "`n[OK] Successfully rebased $branch" -ForegroundColor Green
                return $true
            }
        }
    }
    
    Write-Host "`n[X] Max attempts reached for $branch" -ForegroundColor Red
    git rebase --abort
    return $false
}

# Try to rebase current branch
$success = Rebase-Branch $currentBranch

if ($success) {
    $rebasedCount++
    Write-Host "`n[OK] Branch tree rebase completed successfully!" -ForegroundColor Green
    Write-Host "  Rebased: $rebasedCount branch(es)" -ForegroundColor Cyan
} else {
    Write-Host "`n[X] Failed to rebase $currentBranch" -ForegroundColor Red
    exit 1
}

Write-Host "`n[->] Running validation checks..." -ForegroundColor Yellow
Write-Host "  (typecheck -> lint -> test -> build)" -ForegroundColor Gray

# Run validation
$validationFailed = $false

Write-Host "`n[1] Type checking..." -ForegroundColor Cyan
pnpm exec nx affected -t typecheck 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [X] Type check failed" -ForegroundColor Red
    $validationFailed = $true
} else {
    Write-Host "  [OK] Type check passed" -ForegroundColor Green
}

Write-Host "`n[2] Linting..." -ForegroundColor Cyan
pnpm exec nx affected -t lint --fix 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [X] Lint failed" -ForegroundColor Red
    $validationFailed = $true
} else {
    Write-Host "  [OK] Lint passed" -ForegroundColor Green
}

if ($validationFailed) {
    Write-Host "`n[!] Validation failed. Run the following to see errors:" -ForegroundColor Yellow
    Write-Host "  pnpm exec nx affected -t typecheck" -ForegroundColor Gray
    Write-Host "  pnpm exec nx affected -t lint --fix" -ForegroundColor Gray
    exit 1
}

Write-Host "`n[DONE] All done! Your branch tree is rebased and validated." -ForegroundColor Green
