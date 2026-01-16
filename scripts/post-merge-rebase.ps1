#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated post-merge rebase for squashed PRs
.DESCRIPTION
    After a PR is merged to main with squash, this script:
    1. Detects which commits were squashed
    2. Updates child branch dependencies
    3. Rebases entire tree without conflicts
    4. Optionally deletes merged branch
.PARAMETER MergedBranch
    The branch that was just merged (e.g., LS-1/feature)
.PARAMETER ParentBranch
    The branch it merged into (defaults to main)
.PARAMETER SkipCommitsFile
    Path to skip-commits file (defaults to skip-commits.txt)
.PARAMETER DeleteMergedBranch
    If set, deletes the merged branch after successful rebase
.PARAMETER DryRun
    Show what would happen without making changes
.EXAMPLE
    .\scripts\post-merge-rebase.ps1 -MergedBranch LS-1/feature
.EXAMPLE
    .\scripts\post-merge-rebase.ps1 -MergedBranch LS-1/feature -DeleteMergedBranch
.EXAMPLE
    .\scripts\post-merge-rebase.ps1 -MergedBranch LS-1/feature -DryRun
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$MergedBranch,
    
    [string]$ParentBranch = "main",
    [string]$SkipCommitsFile = "skip-commits.txt",
    [switch]$DeleteMergedBranch,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Post-Merge Rebase Automation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Magenta
    Write-Host ""
}

# Step 1: Verify merged branch exists
Write-Host "Step 1: Verifying branch..." -ForegroundColor Yellow
if (-not (git rev-parse --verify $MergedBranch 2>$null)) {
    Write-Error "Branch '$MergedBranch' does not exist locally"
    exit 1
}
Write-Host "  ✓ Branch exists: $MergedBranch" -ForegroundColor Green

# Step 2: Update parent branch
Write-Host ""
Write-Host "Step 2: Updating $ParentBranch..." -ForegroundColor Yellow
if (-not $DryRun) {
    git checkout $ParentBranch
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to checkout $ParentBranch"
        exit 1
    }
    
    git pull
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to pull $ParentBranch"
        exit 1
    }
    Write-Host "  ✓ Updated $ParentBranch" -ForegroundColor Green
} else {
    Write-Host "  Would run: git checkout $ParentBranch && git pull" -ForegroundColor Gray
}

# Step 3: Detect squashed commits
Write-Host ""
Write-Host "Step 3: Detecting squashed commits..." -ForegroundColor Yellow
$detectArgs = @(
    "-Branch", $MergedBranch,
    "-Parent", $ParentBranch,
    "-SkipCommitsFile", $SkipCommitsFile
)
if ($DryRun) {
    $detectArgs += "-DryRun"
}

& "$scriptDir\detect-squashed-commits.ps1" @detectArgs
$detectExitCode = $LASTEXITCODE

if ($detectExitCode -eq 0) {
    Write-Host "  ✓ Squashed commits detected and processed" -ForegroundColor Green
} else {
    Write-Host "  ℹ No squashed commits detected or branch has unique changes" -ForegroundColor Cyan
    Write-Host "    This might mean:" -ForegroundColor Gray
    Write-Host "    - Branch wasn't actually squashed" -ForegroundColor Gray
    Write-Host "    - Branch has new commits since merge" -ForegroundColor Gray
    Write-Host "    - Branch was already rebased" -ForegroundColor Gray
    
    $response = Read-Host "`nContinue anyway? (y/n)"
    if ($response -ne 'y') {
        Write-Host "Aborting." -ForegroundColor Yellow
        exit 0
    }
}

# Step 4: Find child branches
Write-Host ""
Write-Host "Step 4: Finding child branches..." -ForegroundColor Yellow

$twigTreeOutput = twig tree --format json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Could not get twig tree. Skipping dependency updates."
    $childBranches = @()
} else {
    try {
        $tree = $twigTreeOutput | ConvertFrom-Json
        $mergedBranchInfo = $tree | Where-Object { $_.name -eq $MergedBranch }
        
        # Find all branches that have merged branch as parent
        $childBranches = $tree | Where-Object { $_.parent -eq $MergedBranch }
        
        if ($childBranches.Count -gt 0) {
            Write-Host "  Found $($childBranches.Count) child branch(es):" -ForegroundColor Green
            foreach ($child in $childBranches) {
                Write-Host "    - $($child.name)" -ForegroundColor Gray
            }
        } else {
            Write-Host "  ℹ No child branches found" -ForegroundColor Cyan
        }
    } catch {
        Write-Warning "Failed to parse twig tree: $_"
        $childBranches = @()
    }
}

# Step 5: Update child dependencies
if ($childBranches.Count -gt 0) {
    Write-Host ""
    Write-Host "Step 5: Updating child dependencies..." -ForegroundColor Yellow
    
    foreach ($child in $childBranches) {
        $childName = $child.name
        Write-Host "  Updating $childName..." -ForegroundColor Cyan
        
        if (-not $DryRun) {
            # Remove old dependency
            twig branch remove-dep $childName $MergedBranch 2>&1 | Out-Null
            
            # Add new dependency to parent
            twig branch depend $childName $ParentBranch
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Failed to update dependency for $childName"
                continue
            }
            Write-Host "    ✓ $childName now depends on $ParentBranch" -ForegroundColor Green
        } else {
            Write-Host "    Would run: twig branch remove-dep $childName $MergedBranch" -ForegroundColor Gray
            Write-Host "    Would run: twig branch depend $childName $ParentBranch" -ForegroundColor Gray
        }
    }
} else {
    Write-Host ""
    Write-Host "Step 5: No child dependencies to update" -ForegroundColor Yellow
}

# Step 6: View current tree state
Write-Host ""
Write-Host "Step 6: Current branch tree:" -ForegroundColor Yellow
twig tree

# Step 7: Rebase tree
Write-Host ""
Write-Host "Step 7: Rebasing branch tree..." -ForegroundColor Yellow

if (-not $DryRun) {
    $response = Read-Host "Proceed with automated rebase? (y/n)"
    if ($response -ne 'y') {
        Write-Host "Skipping rebase. You can run manually with: make rebase-tree-auto" -ForegroundColor Yellow
    } else {
        Write-Host "  Running: make rebase-tree-auto" -ForegroundColor Cyan
        make rebase-tree-auto
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Tree rebased successfully" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Rebase encountered issues - check output above" -ForegroundColor Yellow
            Write-Host "    You may need to manually resolve conflicts" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  Would run: make rebase-tree-auto" -ForegroundColor Gray
}

# Step 8: Show final tree
Write-Host ""
Write-Host "Step 8: Final branch tree:" -ForegroundColor Yellow
twig tree

# Step 9: Delete merged branch (optional)
if ($DeleteMergedBranch) {
    Write-Host ""
    Write-Host "Step 9: Deleting merged branch..." -ForegroundColor Yellow
    
    if (-not $DryRun) {
        $response = Read-Host "Delete $MergedBranch? This cannot be undone. (y/n)"
        if ($response -eq 'y') {
            git branch -D $MergedBranch
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ Deleted $MergedBranch" -ForegroundColor Green
            } else {
                Write-Warning "Failed to delete $MergedBranch"
            }
        } else {
            Write-Host "  Skipped deletion" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Would run: git branch -D $MergedBranch" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "Step 9: Keeping merged branch (use -DeleteMergedBranch to remove)" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Post-Merge Rebase Complete" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $DryRun) {
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify tree looks correct: twig tree" -ForegroundColor Gray
    Write-Host "  2. Check individual branches: git log --oneline parent..branch" -ForegroundColor Gray
    Write-Host "  3. Force push updated branches: git push --force-with-lease" -ForegroundColor Gray
    if ($childBranches.Count -gt 0) {
        Write-Host ""
        Write-Host "Branches to force push:" -ForegroundColor Yellow
        foreach ($child in $childBranches) {
            Write-Host "  git checkout $($child.name) && git push --force-with-lease" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "This was a dry run. No changes were made." -ForegroundColor Magenta
    Write-Host "Run without -DryRun to apply changes." -ForegroundColor Gray
}

Write-Host ""
