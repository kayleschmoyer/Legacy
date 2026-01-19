# Auto-complete cascade by skipping duplicate migration commits
# Run this when twig rebase/cascade hits conflicts on migration files

Write-Host "=== Auto-Skip Duplicate Migration Commits ===" -ForegroundColor Cyan
Write-Host ""

# Check if we're in a rebase
if (-not (Test-Path .git/rebase-merge)) {
    Write-Host "❌ No rebase in progress" -ForegroundColor Red
    Write-Host "Run this script when you hit a conflict during twig cascade" -ForegroundColor Yellow
    exit 1
}

# Get current rebase info
$rebaseBranch = Get-Content .git/rebase-merge/head-name -ErrorAction SilentlyContinue
$rebaseBranch = $rebaseBranch -replace 'refs/heads/', ''

Write-Host "Current branch: $rebaseBranch" -ForegroundColor Cyan
Write-Host "Checking conflicts..." -ForegroundColor Yellow

# Check for conflicts
$conflicts = git diff --name-only --diff-filter=U 2>&1

if ($conflicts -and ($conflicts -match "migrations.*\.ts")) {
    Write-Host "Found migration file conflicts - these are duplicates" -ForegroundColor Yellow
    Write-Host "Skipping this commit..." -ForegroundColor Cyan
    
    # Skip the conflicting commit
    git rebase --skip
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully skipped duplicate commit!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Rebase will continue automatically if there are more commits."
        Write-Host "Run this script again if you hit another conflict."
    } else {
        Write-Host "⚠️  Skip failed - manual intervention needed" -ForegroundColor Red
        Write-Host "You can try: git rebase --skip" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ No migration conflicts found" -ForegroundColor Red
    Write-Host "This script is specifically for skipping duplicate migration commits" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Current conflicts:"
    git diff --name-only --diff-filter=U
    exit 1
}
