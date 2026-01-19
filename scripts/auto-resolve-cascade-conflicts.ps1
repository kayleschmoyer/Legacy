# Auto-resolve migration conflicts during cascade
# This resolves "both added" conflicts by accepting current branch version

param(
    [switch]$DryRun
)

Write-Host "=== Auto-Resolve Cascade Conflicts ===" -ForegroundColor Cyan
Write-Host ""

# Check if we're in a rebase
$rebaseInProgress = Test-Path .git/rebase-merge
if (-not $rebaseInProgress) {
    Write-Host "❌ No rebase in progress" -ForegroundColor Red
    exit 1
}

# Get conflicted files
$conflicts = git diff --name-only --diff-filter=U

if ($conflicts.Count -eq 0) {
    Write-Host "✅ No conflicts to resolve" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($conflicts.Count) conflicted files:" -ForegroundColor Yellow
$conflicts | ForEach-Object { Write-Host "  - $_" }
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN - Would resolve these conflicts by accepting current version" -ForegroundColor Cyan
    exit 0
}

# Resolve each conflict by accepting current version
foreach ($file in $conflicts) {
    Write-Host "Resolving: $file" -ForegroundColor Yellow
    git checkout --ours $file
    git add $file
}

Write-Host ""
Write-Host "✅ All conflicts resolved!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run: git rebase --continue"
Write-Host "  2. Or let twig cascade continue automatically"
