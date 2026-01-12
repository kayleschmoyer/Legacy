#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Detects commits that have been squashed into the parent branch after PR merge
.DESCRIPTION
    When PRs are merged with squash on GitHub, the individual commits in a branch
    become redundant because their changes are already in the parent (with different hashes).
    This script detects such commits and adds them to skip-commits.txt for clean rebasing.
.PARAMETER Branch
    The branch to check (defaults to current branch)
.PARAMETER Parent
    The parent branch to compare against (auto-detected from twig if not specified)
.PARAMETER SkipCommitsFile
    Path to skip-commits file (defaults to skip-commits.txt)
.PARAMETER DryRun
    Show what would be added without modifying skip-commits file
.PARAMETER Verbose
    Show detailed output
.EXAMPLE
    .\scripts\detect-squashed-commits.ps1
.EXAMPLE
    .\scripts\detect-squashed-commits.ps1 -Branch LS-18/my-branch -Parent LS-17/parent
.EXAMPLE
    .\scripts\detect-squashed-commits.ps1 -DryRun -Verbose
#>

param(
    [string]$Branch,
    [string]$Parent,
    [string]$SkipCommitsFile = "skip-commits.txt",
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Get current branch if not specified
if (-not $Branch) {
    $Branch = git rev-parse --abbrev-ref HEAD
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to get current branch"
        exit 1
    }
}

Write-Host "Checking branch: $Branch" -ForegroundColor Cyan

# Get parent branch from twig if not specified
if (-not $Parent) {
    Write-Host "Auto-detecting parent branch from twig..." -ForegroundColor Yellow
    
    $twigOutput = twig tree --format json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to get twig tree. Is twig installed?"
        exit 1
    }
    
    try {
        $tree = $twigOutput | ConvertFrom-Json
        $branchInfo = $tree | Where-Object { $_.name -eq $Branch }
        
        if (-not $branchInfo) {
            Write-Error "Branch '$Branch' not found in twig tree"
            exit 1
        }
        
        if ($branchInfo.parent) {
            $Parent = $branchInfo.parent
            Write-Host "Detected parent: $Parent" -ForegroundColor Green
        } else {
            Write-Error "No parent found for branch '$Branch' in twig tree"
            exit 1
        }
    } catch {
        Write-Error "Failed to parse twig tree output: $_"
        exit 1
    }
}

Write-Host "Parent branch: $Parent" -ForegroundColor Cyan

# Verify both branches exist
$branchExists = git rev-parse --verify "$Branch" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Branch '$Branch' does not exist"
    exit 1
}

$parentExists = git rev-parse --verify "$Parent" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Parent branch '$Parent' does not exist"
    exit 1
}

# Get commits in current branch not in parent (by hash)
Write-Host "`nChecking for commits in $Branch not in $Parent..." -ForegroundColor Yellow
$commits = git log --oneline --format="%h|%s" "$Parent..$Branch" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to get commit list: $commits"
    exit 1
}

if (-not $commits) {
    Write-Host "✓ No commits found in branch beyond parent" -ForegroundColor Green
    Write-Host "  Branch is up-to-date with parent" -ForegroundColor Gray
    exit 0
}

$commitList = $commits -split "`n" | Where-Object { $_ } | ForEach-Object {
    $parts = $_ -split '\|', 2
    [PSCustomObject]@{
        Hash = $parts[0]
        Subject = if ($parts.Length -gt 1) { $parts[1] } else { "" }
    }
}

Write-Host "Found $($commitList.Count) commit(s) in branch:" -ForegroundColor Yellow
foreach ($commit in $commitList) {
    Write-Host "  $($commit.Hash) $($commit.Subject)" -ForegroundColor Gray
}

# Check if there are any actual changes between branches
Write-Host "`nChecking for actual changes between branches..." -ForegroundColor Yellow

# Check both directions to ensure we're not missing edge cases
$diffBranchToParent = git diff --shortstat "$Parent..$Branch" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to get diff (branch to parent): $diffBranchToParent"
    exit 1
}

$diffParentToBranch = git diff --shortstat "$Branch..$Parent" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to get diff (parent to branch): $diffParentToBranch"
    exit 1
}

$branchHasUniqueChanges = -not [string]::IsNullOrWhiteSpace($diffBranchToParent)
$parentHasAdditionalChanges = -not [string]::IsNullOrWhiteSpace($diffParentToBranch)

if ($Verbose) {
    Write-Host "  Branch → Parent diff: $(if ($branchHasUniqueChanges) { $diffBranchToParent } else { '(empty)' })" -ForegroundColor Gray
    Write-Host "  Parent → Branch diff: $(if ($parentHasAdditionalChanges) { $diffParentToBranch } else { '(empty)' })" -ForegroundColor Gray
}

if (-not $branchHasUniqueChanges) {
    # No unique changes in branch = all commits were squashed
    Write-Host "✓ No unique changes in branch compared to parent" -ForegroundColor Green
    
    if ($parentHasAdditionalChanges) {
        Write-Host "  Parent has additional changes: $diffParentToBranch" -ForegroundColor Cyan
        Write-Host "  (This is expected - other PRs merged after ours)" -ForegroundColor Gray
    }
    
    Write-Host "  All commits have been squashed into parent!" -ForegroundColor Yellow
    Write-Host ""
    
    $squashedCommits = $commitList | ForEach-Object { $_.Hash }
    
    if ($DryRun) {
        Write-Host "DRY RUN - Would add these commits to $SkipCommitsFile:" -ForegroundColor Magenta
        foreach ($commit in $commitList) {
            Write-Host "  $($commit.Hash)  # Squashed into $Parent (from $Branch)" -ForegroundColor Gray
        }
    } else {
        Write-Host "Adding squashed commits to $SkipCommitsFile..." -ForegroundColor Cyan
        
        # Ensure file exists
        if (-not (Test-Path $SkipCommitsFile)) {
            New-Item -Path $SkipCommitsFile -ItemType File -Force | Out-Null
            Write-Host "Created $SkipCommitsFile" -ForegroundColor Green
        }
        
        # Add header if file is empty or doesn't have one
        $content = if (Test-Path $SkipCommitsFile) { Get-Content $SkipCommitsFile -Raw } else { "" }
        if ([string]::IsNullOrWhiteSpace($content) -or $content -notmatch "# Squashed commits detected") {
            Add-Content $SkipCommitsFile "`n# Squashed commits detected on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        }
        
        # Add each commit
        $timestamp = Get-Date -Format 'yyyy-MM-dd'
        foreach ($commit in $commitList) {
            $entry = "$($commit.Hash)  # Squashed into $Parent (from $Branch) on $timestamp"
            Add-Content $SkipCommitsFile $entry
            Write-Host "  ✓ Added: $($commit.Hash)" -ForegroundColor Green
        }
        
        Write-Host "`n✓ Successfully added $($commitList.Count) commit(s) to $SkipCommitsFile" -ForegroundColor Green
        Write-Host "  You can now rebase with: twig rebase --skip-commits $SkipCommitsFile" -ForegroundColor Cyan
    }
    
    exit 0
} else {
    # Branch has unique changes = commits haven't been squashed yet OR there are new changes
    Write-Host "✓ Branch has unique changes not in parent:" -ForegroundColor Green
    Write-Host "  $diffBranchToParent" -ForegroundColor Gray
    
    if ($parentHasAdditionalChanges) {
        Write-Host "`nParent also has changes not in branch:" -ForegroundColor Yellow
        Write-Host "  $diffParentToBranch" -ForegroundColor Gray
        Write-Host "  (This means parent is ahead - you may want to rebase)" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "These commits have NOT been squashed (branch has unique changes):" -ForegroundColor Yellow
    foreach ($commit in $commitList) {
        Write-Host "  $($commit.Hash) $($commit.Subject)" -ForegroundColor Gray
    }
    
    if ($Verbose) {
        Write-Host "`nDetailed diff (branch → parent):" -ForegroundColor Yellow
        git diff --stat "$Parent..$Branch"
        
        if ($parentHasAdditionalChanges) {
            Write-Host "`nDetailed diff (parent → branch):" -ForegroundColor Yellow
            git diff --stat "$Branch..$Parent"
        }
    }
    
    Write-Host "`n✓ No action needed - branch has outstanding changes" -ForegroundColor Green
    Write-Host "  Recommendation: Keep working on branch or rebase onto parent" -ForegroundColor Cyan
    exit 0
}
