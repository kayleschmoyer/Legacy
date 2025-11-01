#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Pre-push git hook for validating commits
.DESCRIPTION
    Runs validation checks before pushing to ensure code quality.
    Can be bypassed with --no-verify flag if needed.
#>

$ErrorActionPreference = "Stop"

Write-Host "`n🔍 Running pre-push validation..." -ForegroundColor Cyan

# Check if this is a rebase/merge (skip validation)
$gitDir = git rev-parse --git-dir 2>&1
$rebaseMerge = Join-Path $gitDir "rebase-merge"
$rebaseApply = Join-Path $gitDir "rebase-apply"

if ((Test-Path $rebaseMerge) -or (Test-Path $rebaseApply)) {
    Write-Host "⏭️  Skipping validation (rebase/merge in progress)" -ForegroundColor Yellow
    exit 0
}

# Run quick checks (typecheck + lint)
Write-Host "`n1️⃣ Type checking..." -ForegroundColor Cyan
pnpm exec nx affected -t typecheck --base=origin/main --head=HEAD
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ Type check failed!" -ForegroundColor Red
    Write-Host "Fix errors or use --no-verify to skip" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n2️⃣ Linting..." -ForegroundColor Cyan
pnpm exec nx affected -t lint --base=origin/main --head=HEAD
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ Lint failed!" -ForegroundColor Red
    Write-Host "Run 'pnpm exec nx affected -t lint --fix' to auto-fix" -ForegroundColor Yellow
    Write-Host "Or use --no-verify to skip" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✓ Pre-push validation passed!" -ForegroundColor Green
exit 0
