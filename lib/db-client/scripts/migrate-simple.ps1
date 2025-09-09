param(
    [switch]$DryRun,
    [switch]$Force,
    [switch]$PublicOnly,
    [switch]$InternalOnly,
    [switch]$Help
)

if ($Help) {
    Write-Host "Legacy Sports Migration Script" -ForegroundColor Cyan
    Write-Host "Usage: .\scripts\migrate.ps1 [-DryRun] [-Force] [-PublicOnly] [-InternalOnly]" -ForegroundColor Gray
    exit 0
}

Write-Host "Legacy Sports Database Migration" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Check environment
$envFile = "../../.env"
if (-not (Test-Path $envFile)) {
    Write-Host "Error: .env file not found. Run sync-env script first." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Environment file found" -ForegroundColor Green

# Check migrations
$publicMigrations = @()
$internalMigrations = @()

if (-not $InternalOnly -and (Test-Path "src/drizzle/migrations/public")) {
    $publicMigrations = Get-ChildItem "src/drizzle/migrations/public" -Filter "*.sql"
}

if (-not $PublicOnly -and (Test-Path "src/drizzle/migrations/internal")) {
    $internalMigrations = Get-ChildItem "src/drizzle/migrations/internal" -Filter "*.sql"
}

Write-Host "Public migrations: $($publicMigrations.Count)" -ForegroundColor Gray
Write-Host "Internal migrations: $($internalMigrations.Count)" -ForegroundColor Gray

if ($DryRun) {
    Write-Host "`nDRY RUN - Would execute:" -ForegroundColor Yellow
    if ($publicMigrations.Count -gt 0) {
        Write-Host "• Public schema migrations: $($publicMigrations.Count)" -ForegroundColor Gray
    }
    if ($internalMigrations.Count -gt 0) {
        Write-Host "• Internal schema migrations: $($internalMigrations.Count)" -ForegroundColor Gray
    }
    exit 0
}

if (-not $Force) {
    $confirm = Read-Host "`nProceed with migration? (y/N)"
    if ($confirm -ne "y") {
        Write-Host "Migration cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Run migrations
Write-Host "`nRunning migrations..." -ForegroundColor Cyan

if ($publicMigrations.Count -gt 0 -and -not $InternalOnly) {
    Write-Host "Migrating public schema..." -ForegroundColor Yellow
    npm run migrate:public
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Public schema migration completed" -ForegroundColor Green
    } else {
        Write-Host "✗ Public schema migration failed" -ForegroundColor Red
        exit 1
    }
}

if ($internalMigrations.Count -gt 0 -and -not $PublicOnly) {
    Write-Host "Migrating internal schema..." -ForegroundColor Yellow
    npm run migrate:internal
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Internal schema migration completed" -ForegroundColor Green
    } else {
        Write-Host "✗ Internal schema migration failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`nMigration completed successfully!" -ForegroundColor Green
