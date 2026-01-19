# Complete cascade with automatic skip of duplicate migration commits
# This will cascade all remaining branches and auto-skip conflicts

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"

Write-Host "=== Auto-Cascade with Skip ===" -ForegroundColor Cyan
Write-Host ""

# Branches that need cascading (in dependency order)
$branches = @(
    "LS-26/build-automated-matchup-progression-system",
    "LS-27/add-matchup-analytics-and-statistics-dashboard",
    "LS-28/implement-playoff-bracket-system-with-automatic-seeding",
    "LS-29/add-trade-deadline-and-roster-lock-features-for-matchups",
    "LS-30/build-matchup-preview-and-predictions-feature",
    "LS-31/matchup-chat",
    "LS-34/performance-optimization-for-matchup-queries-and-operations"
)

foreach ($branch in $branches) {
    Write-Host "`n=== Processing: $branch ===" -ForegroundColor Yellow
    
    if ($DryRun) {
        Write-Host "[DRY RUN] Would cascade this branch" -ForegroundColor Cyan
        continue
    }
    
    # Checkout branch
    $null = git checkout $branch 2>&1
    
    # Start rebase using twig
    Write-Host "Starting twig rebase..." -ForegroundColor Cyan
    
    # Attempt rebase - it may fail with conflicts
    $rebaseOutput = twig rebase 2>&1
    
    # Check if we're in a rebase state
    $maxRetries = 10
    $retryCount = 0
    
    while ((Test-Path .git/rebase-merge) -and ($retryCount -lt $maxRetries)) {
        $retryCount++
        Write-Host "  Rebase in progress (attempt $retryCount/$maxRetries)..." -ForegroundColor Gray
        
        # Check for migration conflicts
        $conflicts = git diff --name-only --diff-filter=U 2>&1
        
        if ($conflicts -match "migrations.*\.ts") {
            Write-Host "  Found migration conflicts - skipping duplicate commit..." -ForegroundColor Yellow
            git rebase --skip 2>&1 | Out-Null
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✅ Skipped successfully" -ForegroundColor Green
            } else {
                Write-Host "  ⚠️  Skip failed, trying continue..." -ForegroundColor Yellow
                break
            }
        } else {
            # No conflicts, check if rebase finished
            if (Test-Path .git/rebase-merge) {
                Write-Host "  ⚠️  Unexpected rebase state" -ForegroundColor Red
                git rebase --abort 2>&1 | Out-Null
                break
            }
        }
        
        Start-Sleep -Milliseconds 200
    }
    
    # Check final state
    if (Test-Path .git/rebase-merge) {
        Write-Host "  ❌ Rebase incomplete - manual intervention needed" -ForegroundColor Red
        git rebase --abort 2>&1 | Out-Null
    } else {
        Write-Host "  ✅ Branch updated successfully" -ForegroundColor Green
    }
}

Write-Host "`n=== Cascade Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Checking final tree status..."
git checkout main *>$null
twig tree | Select-String -Pattern "LS-2[5-9]|LS-3[0-9]"
