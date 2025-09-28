#!/usr/bin/env pwsh
# Database Migration Script for Legacy Sports
# This script runs all pending migrations using the migration runner

param(
    [switch]$DryRun,
    [switch]$Verbose,
    [switch]$Production,
    [string]$Schema = "both"
)

$ErrorActionPreference = "Stop"

# Color functions for PowerShell
function Write-Info($message) { Write-Host $message -ForegroundColor Cyan }
function Write-Success($message) { Write-Host $message -ForegroundColor Green }
function Write-Warning($message) { Write-Host $message -ForegroundColor Yellow }
function Write-Error($message) { Write-Host $message -ForegroundColor Red }

Write-Info "=== Legacy Sports Database Migration ==="
Write-Info "Running migrations with the following options:"
Write-Info "  Schema: $Schema"
Write-Info "  Dry Run: $DryRun"
Write-Info "  Verbose: $Verbose"  
Write-Info "  Production: $Production"
Write-Info ""

# Change to db-client directory
Push-Location "lib\db-client"

try {
    # Build the npm script command based on parameters
    $npmScript = "db:migrate"
    $extraArgs = @()
    
    if ($DryRun) {
        $extraArgs += "--dry-run"
    }
    if ($Verbose) {
        $extraArgs += "--verbose"
    }
    if ($Production) {
        $extraArgs += "--production"
    }
    if ($Schema -eq "public") {
        $extraArgs += "--public-only"
    } elseif ($Schema -eq "internal") {
        $extraArgs += "--internal-only"
    }
    
    # Combine script and arguments
    if ($extraArgs.Count -gt 0) {
        $command = "npm run $npmScript -- " + ($extraArgs -join " ")
    } else {
        $command = "npm run $npmScript"
    }
    
    Write-Info "Executing: $command"
    Write-Info ""
    
    # Run the npm script
    Invoke-Expression $command
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "✅ Migration completed successfully!"
    } else {
        Write-Error "❌ Migration failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} catch {
    Write-Error "❌ Failed to run migrations: $_"
    exit 1
} finally {
    Pop-Location
}
