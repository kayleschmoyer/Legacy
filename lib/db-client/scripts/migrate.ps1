#!/usr/bin/env pwsh
# Database Migration Script for Legacy Sports
# This script runs Drizzle migrations for both public and internal schemas

param(
    [string]$Environment = "dev",
    [switch]$DryRun,
    [switch]$Force,
    [switch]$PublicOnly,
    [switch]$InternalOnly,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Color functions
function Write-Info($message) { Write-Host $message -ForegroundColor Cyan }
function Write-Success($message) { Write-Host $message -ForegroundColor Green }
function Write-Warning($message) { Write-Host $message -ForegroundColor Yellow }
function Write-Error($message) { Write-Host $message -ForegroundColor Red }

# Help text
if ($Help) {
    Write-Host @"
Legacy Sports Database Migration Script

USAGE:
    .\scripts\migrate.ps1 [OPTIONS]

OPTIONS:
    -Environment <env>    Environment to migrate (default: dev)
    -DryRun              Show what would be migrated without executing
    -Force               Skip confirmation prompts
    -PublicOnly          Only migrate public schema
    -InternalOnly        Only migrate internal schema
    -Help                Show this help message

EXAMPLES:
    .\scripts\migrate.ps1                    # Migrate both schemas with confirmation
    .\scripts\migrate.ps1 -DryRun           # Show planned migrations
    .\scripts\migrate.ps1 -Force            # Skip confirmations
    .\scripts\migrate.ps1 -PublicOnly       # Only migrate public schema

"@ -ForegroundColor White
    exit 0
}

Write-Info "Legacy Sports Database Migration"
Write-Info "================================="
Write-Host ""

# Check if we're in the correct directory
if (-not (Test-Path "package.json")) {
    Write-Error "package.json not found. Please run this script from the db-client directory."
    exit 1
}

# Check if environment file exists
$envFile = "../../.env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found at $envFile. Please run the sync-env script first."
    exit 1
}

# Load environment variables to check database connection
Write-Info "Checking database configuration..."
$envContent = Get-Content $envFile
$dbHost = ($envContent | Where-Object { $_ -match "^DB_HOST=" }) -replace "DB_HOST=", ""
$dbUser = ($envContent | Where-Object { $_ -match "^DB_USER=" }) -replace "DB_USER=", ""

if (-not $dbHost -or -not $dbUser) {
    Write-Error "Database configuration incomplete. Please ensure DB_HOST and DB_USER are set in .env"
    exit 1
}

Write-Success "✓ Database configuration found"
Write-Host "  Host: $dbHost" -ForegroundColor Gray
Write-Host "  User: $dbUser" -ForegroundColor Gray
Write-Host ""

# Determine which schemas to migrate
$migratePublic = $true
$migrateInternal = $true

if ($PublicOnly) {
    $migrateInternal = $false
    Write-Info "Migration scope: Public schema only"
} elseif ($InternalOnly) {
    $migratePublic = $false
    Write-Info "Migration scope: Internal schema only"
} else {
    Write-Info "Migration scope: Both public and internal schemas"
}

# Check for pending migrations
Write-Info "Checking for pending migrations..."

$publicMigrations = @()
$internalMigrations = @()

if ($migratePublic -and (Test-Path "src/drizzle/migrations/public")) {
    $publicMigrations = Get-ChildItem "src/drizzle/migrations/public" -Filter "*.sql" | Sort-Object Name
    Write-Host "  Public schema: $($publicMigrations.Count) migration(s) found" -ForegroundColor Gray
}

if ($migrateInternal -and (Test-Path "src/drizzle/migrations/internal")) {
    $internalMigrations = Get-ChildItem "src/drizzle/migrations/internal" -Filter "*.sql" | Sort-Object Name
    Write-Host "  Internal schema: $($internalMigrations.Count) migration(s) found" -ForegroundColor Gray
}

if ($publicMigrations.Count -eq 0 -and $internalMigrations.Count -eq 0) {
    Write-Warning "No migrations found to execute."
    exit 0
}

Write-Host ""

# Show what will be migrated
if ($DryRun) {
    Write-Info "DRY RUN - The following migrations would be executed:"
    Write-Host ""
    
    if ($migratePublic -and $publicMigrations.Count -gt 0) {
        Write-Host "Public Schema Migrations:" -ForegroundColor Yellow
        foreach ($migration in $publicMigrations) {
            Write-Host "  • $($migration.Name)" -ForegroundColor Gray
        }
        Write-Host ""
    }
    
    if ($migrateInternal -and $internalMigrations.Count -gt 0) {
        Write-Host "Internal Schema Migrations:" -ForegroundColor Yellow
        foreach ($migration in $internalMigrations) {
            Write-Host "  • $($migration.Name)" -ForegroundColor Gray
        }
        Write-Host ""
    }
    
    Write-Info "To execute these migrations, run the script without -DryRun"
    exit 0
}

# Confirmation unless forced
if (-not $Force) {
    Write-Warning "This will execute database migrations. This action cannot be undone."
    Write-Host ""
    if ($migratePublic -and $publicMigrations.Count -gt 0) {
        Write-Host "Public schema migrations to execute: $($publicMigrations.Count)" -ForegroundColor Yellow
    }
    if ($migrateInternal -and $internalMigrations.Count -gt 0) {
        Write-Host "Internal schema migrations to execute: $($internalMigrations.Count)" -ForegroundColor Yellow
    }
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to proceed? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Info "Migration cancelled."
        exit 0
    }
}

Write-Host ""
Write-Info "Starting database migration..."

# Execute migrations
$success = $true

try {
    # Migrate public schema
    if ($migratePublic -and $publicMigrations.Count -gt 0) {
        Write-Info "Migrating public schema..."
        npm run migrate:public
        if ($LASTEXITCODE -ne 0) {
            throw "Public schema migration failed"
        }
        Write-Success "✓ Public schema migration completed"
        Write-Host ""
    }
    
    # Migrate internal schema
    if ($migrateInternal -and $internalMigrations.Count -gt 0) {
        Write-Info "Migrating internal schema..."
        npm run migrate:internal
        if ($LASTEXITCODE -ne 0) {
            throw "Internal schema migration failed"
        }
        Write-Success "✓ Internal schema migration completed"
        Write-Host ""
    }
    
} catch {
    Write-Error "Migration failed: $_"
    $success = $false
}

# Summary
Write-Host ""
if ($success) {
    Write-Success "================================="
    Write-Success "Migration completed successfully!"
    Write-Success "================================="
    
    if ($migratePublic -and $publicMigrations.Count -gt 0) {
        Write-Host "✓ Public schema: $($publicMigrations.Count) migration(s) applied" -ForegroundColor Green
    }
    if ($migrateInternal -and $internalMigrations.Count -gt 0) {
        Write-Host "✓ Internal schema: $($internalMigrations.Count) migration(s) applied" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Info "Next steps:"
    Write-Host "• Verify the migration with: npm run studio:public or npm run studio:internal" -ForegroundColor Gray
    Write-Host "• Test your application to ensure everything works correctly" -ForegroundColor Gray
    
} else {
    Write-Error "================================="
    Write-Error "Migration failed!"
    Write-Error "================================="
    Write-Host ""
    Write-Host "Please check the error messages above and fix any issues before retrying." -ForegroundColor Yellow
    exit 1
}
