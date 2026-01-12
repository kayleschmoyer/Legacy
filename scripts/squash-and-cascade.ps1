#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Squashes all commits in a branch and cascades to children with automatic skip tracking
.DESCRIPTION
    Automates the workflow of:
    1. Capturing commits before squash
    2. Squashing all commits into one
    3. Adding old hashes to skip-commits.txt
    4. Cascading to child branches
    5. Handling empty commits automatically
.PARAMETER Branch
    The branch to squash (defaults to current branch)
.PARAMETER Parent
    The parent branch to squash onto (auto-detected from twig if not specified)
.PARAMETER CommitMessage
    Custom commit message for the squashed commit
.PARAMETER SkipCommitsFile
    Path to skip-commits file (defaults to skip-commits.txt)
.PARAMETER DryRun
    Show what would be done without making changes
.PARAMETER SkipCascade
    Only squash, don't cascade to children
.EXAMPLE
    .\scripts\squash-and-cascade.ps1
.EXAMPLE
    .\scripts\squash-and-cascade.ps1 -Branch LS-24/my-branch
.EXAMPLE
    .\scripts\squash-and-cascade.ps1 -CommitMessage "feat: new feature"
.EXAMPLE
    .\scripts\squash-and-cascade.ps1 -DryRun
#>

param(
    [string]$Branch,
    [string]$Parent,
    [string]$CommitMessage,
    [string]$SkipCommitsFile = "skip-commits.txt",
    [switch]$DryRun,
    [switch]$SkipCascade
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Squash and Cascade Workflow" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Get current branch if not specified
if (-not $Branch) {
    $Branch = git rev-parse --abbrev-ref HEAD
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to get current branch"
        exit 1
    }
}

Write-Host "`nBranch: $Branch" -ForegroundColor Yellow

# Ensure we're on the correct branch
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne $Branch) {
    Write-Host "Switching to $Branch..." -ForegroundColor Yellow
    git checkout $Branch
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to checkout branch $Branch"
        exit 1
    }
}

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

Write-Host "Parent: $Parent" -ForegroundColor Yellow

# Verify parent exists
$parentExists = git rev-parse --verify "$Parent" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Parent branch '$Parent' does not exist"
    exit 1
}

# Step 2: Capture commits that will be squashed
Write-Host "`n[->] Capturing commits to squash..." -ForegroundColor Cyan
$squashedCommits = git log --oneline --format="%h" "$Parent..$Branch"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to get commit list"
    exit 1
}

if (-not $squashedCommits) {
    Write-Host "✓ No commits to squash - branch is up-to-date with parent" -ForegroundColor Green
    exit 0
}

$commitCount = ($squashedCommits | Measure-Object).Count

if ($commitCount -eq 1) {
    Write-Host "✓ Branch already has single commit - no squashing needed" -ForegroundColor Green
    Write-Host "  Commit: $(git log --oneline -1)" -ForegroundColor Gray
    exit 0
}

Write-Host "Found $commitCount commits to squash:" -ForegroundColor Green
git log --oneline "$Parent..$Branch" | ForEach-Object {
    Write-Host "  $_" -ForegroundColor Gray
}

# Capture full commit history for new commit message
$commitHistory = git log --oneline "$Parent..$Branch" | Out-String

# Check if branch has children
Write-Host "`n[->] Checking for child branches..." -ForegroundColor Cyan
$treeOutput = twig tree 2>&1 | Out-String
$hasChildren = $treeOutput -match "$Branch\s+.*\n\s+[├└]"

if ($hasChildren) {
    Write-Host "✓ Branch has children - will cascade after squash" -ForegroundColor Yellow
} else {
    Write-Host "✓ Branch has no children - cascade not needed" -ForegroundColor Green
}

if ($DryRun) {
    Write-Host "`n============================================================" -ForegroundColor Magenta
    Write-Host "DRY RUN - Would perform the following:" -ForegroundColor Magenta
    Write-Host "============================================================" -ForegroundColor Magenta
    Write-Host "1. Squash $commitCount commits into one" -ForegroundColor Gray
    Write-Host "2. Add these hashes to $SkipCommitsFile" ":" -ForegroundColor Gray
    $squashedCommits | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
    if ($hasChildren -and -not $SkipCascade) {
        Write-Host "3. Cascade to child branches" -ForegroundColor Gray
    }
    exit 0
}

# Step 3: Squash commits
Write-Host "`n[->] Squashing $commitCount commits..." -ForegroundColor Cyan

# Generate commit message
if (-not $CommitMessage) {
    $scope = $Branch -replace 'LS-\d+/', '' -replace '-', ' '
    $CommitMessage = "feat($scope): consolidated changes"
}

$fullMessage = @"
$CommitMessage

Squashed $commitCount commits:
$commitHistory
"@

# Perform squash
git reset --soft $Parent
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to reset to parent branch"
    exit 1
}

git commit -m $fullMessage
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create squash commit"
    exit 1
}

Write-Host "✓ Squashed into single commit" -ForegroundColor Green
$newCommit = git log --oneline -1
Write-Host "  $newCommit" -ForegroundColor Gray

# Step 4: Update skip-commits.txt
Write-Host "`n[->] Updating $SkipCommitsFile..." -ForegroundColor Cyan

# Read existing content
$content = @()
if (Test-Path $SkipCommitsFile) {
    $content = Get-Content $SkipCommitsFile
}

# Add header
$content += ""
$content += "# Squashed in $Branch on $(Get-Date -Format 'yyyy-MM-dd')"

# Add each squashed commit hash
foreach ($hash in $squashedCommits) {
    $content += $hash
}

# Write back to file
$content | Set-Content $SkipCommitsFile

Write-Host "✓ Added $commitCount commits to skip list" -ForegroundColor Green

# Step 5: Cascade to children (if they exist and not skipped)
if ($hasChildren -and -not $SkipCascade) {
    Write-Host "`n[->] Cascading to child branches..." -ForegroundColor Cyan
    Write-Host "Using skip-commits file: $SkipCommitsFile" -ForegroundColor Gray
    
    $cascadeSuccess = $true
    $emptyCommits = @()
    
    # Run cascade
    twig cascade --no-interactive --skip-commits $SkipCommitsFile 2>&1 | Tee-Object -Variable cascadeOutput | Out-Host
    
    # Check for empty commit errors
    $cascadeOutput | ForEach-Object {
        if ($_ -match 'Failed to cherry-pick commit ([0-9a-f]+):.*empty') {
            $emptyCommits += $matches[1]
        }
    }
    
    # If empty commits found, add them and inform user
    if ($emptyCommits.Count -gt 0) {
        Write-Host "`n[!] Found $($emptyCommits.Count) empty commit(s) during cascade (expected)" -ForegroundColor Yellow
        Write-Host "Adding to skip list..." -ForegroundColor Yellow
        
        $content = Get-Content $SkipCommitsFile
        $content += ""
        $content += "# Empty after cascade from squashed $Branch ($(Get-Date -Format 'yyyy-MM-dd'))"
        foreach ($hash in $emptyCommits) {
            $content += $hash
            Write-Host "  Added: $hash" -ForegroundColor Gray
        }
        $content | Set-Content $SkipCommitsFile
        
        Write-Host "`n[!] Cascade incomplete - run again to continue:" -ForegroundColor Yellow
        Write-Host "  twig cascade --no-interactive --skip-commits $SkipCommitsFile" -ForegroundColor Cyan
        $cascadeSuccess = $false
    }
    
    if ($cascadeSuccess) {
        Write-Host "`n✓ Cascade completed successfully" -ForegroundColor Green
    }
} elseif ($SkipCascade) {
    Write-Host "`n[SKIP] Cascade skipped by user request" -ForegroundColor Yellow
} else {
    Write-Host "`n[SKIP] No child branches to cascade" -ForegroundColor Yellow
}

# Step 6: Verify results
Write-Host "`n[->] Verifying results..." -ForegroundColor Cyan
Write-Host "Branch tree:" -ForegroundColor Gray
twig tree | Select-String -Pattern $Branch -Context 0,2

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "✓ Squash and Cascade Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Review: twig tree" -ForegroundColor Gray
Write-Host "  2. Verify: git log --oneline HEAD~5..HEAD" -ForegroundColor Gray
if ($hasChildren -and -not $cascadeSuccess) {
    Write-Host "  3. Continue cascade if needed (see warning above)" -ForegroundColor Gray
}
