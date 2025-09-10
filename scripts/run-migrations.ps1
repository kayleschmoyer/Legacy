#!/usr/bin/env pwsh

# Legacy Sports Database Migration Script (PowerShell)
# =====================================================
#
# This script runs the database migrations for both public and internal schemas.
# It automatically switches to the direct database endpoint for migrations and
# can optionally switch back to the proxy endpoint for runtime.
#
# Usage:
#   .\run-migrations.ps1 [options]
#
# Options:
#   -SkipPublic        Skip running public schema migrations
#   -SkipInternal      Skip running internal schema migrations
#   -StayOnDirect      Don't switch back to proxy endpoint after migrations
#   -DryRun            Show what would be migrated without actually running migrations
#   -Help              Show this help message
#
# Examples:
#   .\run-migrations.ps1
#   .\run-migrations.ps1 -SkipInternal -StayOnDirect
#   .\run-migrations.ps1 -DryRun

param(
    [switch]$SkipPublic,
    [switch]$SkipInternal,
    [switch]$StayOnDirect,
    [switch]$DryRun,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    
    switch ($Color) {
        "Red" { Write-Host $Message -ForegroundColor Red }
        "Green" { Write-Host $Message -ForegroundColor Green }
        "Yellow" { Write-Host $Message -ForegroundColor Yellow }
        "Cyan" { Write-Host $Message -ForegroundColor Cyan }
        "Gray" { Write-Host $Message -ForegroundColor Gray }
        default { Write-Host $Message }
    }
}

function Show-Help {
    Write-ColorOutput "Legacy Sports Database Migration Script" "Cyan"
    Write-ColorOutput "=======================================" "Cyan"
    Write-Host ""
    Write-Host "Usage: .\run-migrations.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -SkipPublic        Skip running public schema migrations"
    Write-Host "  -SkipInternal      Skip running internal schema migrations"
    Write-Host "  -StayOnDirect      Don't switch back to proxy endpoint after migrations"
    Write-Host "  -DryRun            Show what would be migrated without actually running migrations"
    Write-Host "  -Help              Show this help message"
    Write-Host ""
    exit 0
}

if ($Help) {
    Show-Help
}

Write-ColorOutput "Legacy Sports Database Migration Script" "Cyan"
Write-ColorOutput "=======================================" "Cyan"
Write-Host ""

# Get script directory and change to root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
$OriginalLocation = Get-Location
Set-Location $RootDir

Write-ColorOutput "Working directory: $RootDir" "Gray"
Write-Host ""

if ($DryRun) {
    Write-ColorOutput "DRY RUN MODE - No actual migrations will be performed" "Yellow"
    Write-Host ""
}

try {
    # Step 1: Switch to direct database endpoint for migrations
    Write-ColorOutput "Step 1: Configuring environment for migrations..." "Green"
    if (-not $DryRun) {
        try {
            & ".\scripts\sync-env.ps1" -DatabaseEndpoint direct
            Write-ColorOutput "Environment configured for direct database access" "Green"
        }
        catch {
            Write-ColorOutput "Failed to configure environment: $_" "Red"
            exit 1
        }
    }
    else {
        Write-ColorOutput "SKIPPED (dry run)" "Yellow"
    }
    Write-Host ""

    # Step 2: Navigate to db-client
    Write-ColorOutput "Step 2: Navigating to db-client directory..." "Green"
    Push-Location "lib\db-client"

    # Step 3: Test database connectivity
    Write-ColorOutput "Step 3: Testing database connectivity..." "Green"
    if ($DryRun) {
        Write-ColorOutput "SKIPPED (dry run)" "Yellow"
    }
    else {
        # Test database connectivity using the CLI
        try {
            Push-Location $RootDir
            $testOutput = & npx nx start cli -- test-db-connection 2>&1
            Pop-Location
            
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "Database connection successful" "Green"
            }
            else {
                Write-ColorOutput "Database connectivity test failed" "Red"
                Write-ColorOutput "Output: $testOutput" "Red"
                exit 1
            }
        }
        catch {
            Write-ColorOutput "Database connectivity test failed: $_" "Red"
            exit 1
        }
    }
    Write-Host ""

    # Step 4: Run migrations
    Write-ColorOutput "Step 4: Running database migrations..." "Green"
    $MigrationSuccess = $true

    if (-not $SkipPublic) {
        Write-ColorOutput "  Running public schema migrations..." "Cyan"
        if ($DryRun) {
            Write-ColorOutput "  SKIPPED (dry run)" "Yellow"
        }
        else {
            try {
                & npm run migrate:public
                if ($LASTEXITCODE -eq 0) {
                    Write-ColorOutput "  Public schema migrations completed" "Green"
                }
                else {
                    Write-ColorOutput "  Public schema migrations failed" "Red"
                    $MigrationSuccess = $false
                }
            }
            catch {
                Write-ColorOutput "  Public schema migrations failed: $_" "Red"
                $MigrationSuccess = $false
            }
        }
        Write-Host ""
    }

    if (-not $SkipInternal) {
        Write-ColorOutput "  Running internal schema migrations..." "Cyan"
        if ($DryRun) {
            Write-ColorOutput "  SKIPPED (dry run)" "Yellow"
        }
        else {
            try {
                & npm run migrate:internal
                if ($LASTEXITCODE -eq 0) {
                    Write-ColorOutput "  Internal schema migrations completed" "Green"
                }
                else {
                    Write-ColorOutput "  Internal schema migrations failed" "Red"
                    $MigrationSuccess = $false
                }
            }
            catch {
                Write-ColorOutput "  Internal schema migrations failed: $_" "Red"
                $MigrationSuccess = $false
            }
        }
        Write-Host ""
    }

    # Step 5: Switch back to proxy endpoint (optional)
    if (-not $StayOnDirect -and $MigrationSuccess) {
        Write-ColorOutput "Step 5: Switching back to proxy endpoint for runtime..." "Green"
        Pop-Location
        Set-Location $RootDir
        
        if ($DryRun) {
            Write-ColorOutput "SKIPPED (dry run)" "Yellow"
        }
        else {
            try {
                & ".\scripts\sync-env.ps1" -DatabaseEndpoint proxy
                Write-ColorOutput "Environment configured for proxy database access" "Green"
            }
            catch {
                Write-ColorOutput "Warning: Failed to switch back to proxy endpoint: $_" "Yellow"
            }
        }
        Write-Host ""
    }

    # Summary
    Write-ColorOutput "Migration Summary:" "Cyan"
    Write-ColorOutput "=================" "Cyan"

    if ($DryRun) {
        Write-ColorOutput "Dry run completed successfully" "Green"
        $publicStatus = if ($SkipPublic) { "Skipped" } else { "Would run" }
        $internalStatus = if ($SkipInternal) { "Skipped" } else { "Would run" }
        $endpointStatus = if ($StayOnDirect) { "Direct" } else { "Proxy" }
        Write-ColorOutput "Public migrations: $publicStatus" "Gray"
        Write-ColorOutput "Internal migrations: $internalStatus" "Gray"
        Write-ColorOutput "Endpoint after: $endpointStatus" "Gray"
    }
    elseif ($MigrationSuccess) {
        Write-ColorOutput "All migrations completed successfully!" "Green"
        $publicStatus = if ($SkipPublic) { "Skipped" } else { "Completed" }
        $internalStatus = if ($SkipInternal) { "Skipped" } else { "Completed" }
        $endpointStatus = if ($StayOnDirect) { "Direct (for migrations)" } else { "Proxy (for runtime)" }
        Write-ColorOutput "Public migrations: $publicStatus" "Green"
        Write-ColorOutput "Internal migrations: $internalStatus" "Green"
        Write-ColorOutput "Current endpoint: $endpointStatus" "Green"
    }
    else {
        Write-ColorOutput "Some migrations failed!" "Red"
        Write-ColorOutput "Please check the errors above and resolve issues before proceeding." "Red"
        exit 1
    }

    Write-Host ""
    Write-ColorOutput "Notes:" "Yellow"
    Write-ColorOutput "Use -StayOnDirect if you need to run more migrations" "Yellow"
    Write-ColorOutput "Use -DryRun to test without making changes" "Yellow"
    Write-ColorOutput "Proxy endpoint is recommended for runtime (Lambda functions)" "Yellow"
    Write-ColorOutput "Direct endpoint is required for migrations and public access" "Yellow"
}
catch {
    Write-ColorOutput "Error: Script execution failed: $_" "Red"
    exit 1
}
finally {
    # Ensure we return to the original directory
    while (Get-Location -Stack -ErrorAction SilentlyContinue) {
        Pop-Location -ErrorAction SilentlyContinue
    }
    Set-Location $OriginalLocation
}