# Simple Migration Script
param([switch]$DryRun, [switch]$PublicOnly, [switch]$InternalOnly)

Write-Host "Legacy Sports Database Migration" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "DRY RUN - Would execute migrations" -ForegroundColor Yellow
    if (-not $InternalOnly) { Write-Host "- Public schema" -ForegroundColor Gray }
    if (-not $PublicOnly) { Write-Host "- Internal schema" -ForegroundColor Gray }
    exit 0
}

if (-not $PublicOnly -and -not $InternalOnly) {
    $confirm = Read-Host "Run both public and internal migrations? (y/N)"
    if ($confirm -ne "y") { exit 0 }
}

if (-not $InternalOnly) {
    Write-Host "Running public schema migration..." -ForegroundColor Yellow
    npm run migrate:public
}

if (-not $PublicOnly) {
    Write-Host "Running internal schema migration..." -ForegroundColor Yellow  
    npm run migrate:internal
}

Write-Host "Migration completed!" -ForegroundColor Green
