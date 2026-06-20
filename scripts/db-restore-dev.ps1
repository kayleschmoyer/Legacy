#!/usr/bin/env pwsh
# =============================================================================
# scripts/db-restore-dev.ps1 - Restore the scrubbed dev seed dump (no AWS needed)
# =============================================================================
#
# Restores resources/dev-seed.dump into the local Docker postgres container.
# No AWS credentials required - the seed dump is hosted publicly in S3 and
# contains anonymized data only (no real user PII).
#
# Requirements:
#   docker compose up -d postgres
#
# Usage:
#   .\scripts\db-restore-dev.ps1            # uses cached resources/dev-seed.dump if present
#   .\scripts\db-restore-dev.ps1 -Force     # always re-download from S3
#
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SEED_FILE    = "resources\dev-seed.dump"
$SEED_URL     = "https://legacy-sports-dev-team-logos-8c4d4e8d.s3.us-east-1.amazonaws.com/dev-assets/dev-seed.dump"
$PG_CONTAINER = "ls-postgres"
$PG_USER      = "legacy_sports"
$PG_DB        = "legacy_sports_dev"

function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "   ERR $msg" -ForegroundColor Red }

$repoRoot = Join-Path $PSScriptRoot ".."
$seedPath = Join-Path $repoRoot $SEED_FILE

# ---------------------------------------------------------------------------
# Ensure seed file is materialized (download from public S3 if needed)
# ---------------------------------------------------------------------------
$needsDownload = $Force.IsPresent
if (-not $needsDownload) {
    if (-not (Test-Path $seedPath)) {
        $needsDownload = $true
    } elseif ((Get-Item $seedPath).Length -lt 1000000) {
        # File exists but is implausibly small (real dump is ~11 MB)
        $needsDownload = $true
    }
}

if ($needsDownload) {
    Write-Step "Downloading seed file from S3: $SEED_URL"
    $seedDir = Split-Path $seedPath -Parent
    if (-not (Test-Path $seedDir)) {
        New-Item -ItemType Directory -Path $seedDir -Force | Out-Null
    }
    try {
        $ProgressPreference = "SilentlyContinue"  # speeds up Invoke-WebRequest dramatically
        Invoke-WebRequest -Uri $SEED_URL -OutFile $seedPath -UseBasicParsing
    } catch {
        Write-Err "Download failed: $($_.Exception.Message)"
        Write-Host "  Refresh the dump (requires AWS access): make db-dump-dev" -ForegroundColor Yellow
        exit 1
    }
    if (-not (Test-Path $seedPath) -or (Get-Item $seedPath).Length -lt 1000000) {
        Write-Err "Downloaded file is missing or implausibly small: $SEED_FILE"
        exit 1
    }
    Write-OK "Seed file downloaded"
}

$sizeMB = [math]::Round((Get-Item $seedPath).Length / 1MB, 1)

# ---------------------------------------------------------------------------
# Safety prompt
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[!]  This will DROP and recreate the local database '$PG_DB'." -ForegroundColor Yellow
Write-Host "   All local data will be replaced with the dev seed (${sizeMB} MB, anonymized)." -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Type 'yes' to continue"
if ($confirm -ne "yes") {
    Write-Host "Aborted." -ForegroundColor Gray
    exit 0
}

# ---------------------------------------------------------------------------
# Verify Docker + container
# ---------------------------------------------------------------------------
Write-Step "Checking Docker and postgres container"
docker ps -q *>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker is not running - start Docker Desktop first"
    exit 1
}

$running = docker inspect --format "{{.State.Running}}" $PG_CONTAINER 2>$null
if ($running -ne "true") {
    Write-Err "Container '$PG_CONTAINER' is not running. Start it with:"
    Write-Host "  docker compose up -d postgres" -ForegroundColor White
    exit 1
}
Write-OK "Container '$PG_CONTAINER' is running"

# ---------------------------------------------------------------------------
# Copy dump into container
# ---------------------------------------------------------------------------
Write-Step "Copying seed dump into container"
docker cp $seedPath "${PG_CONTAINER}:/tmp/restore.dump"
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker cp failed"
    exit 1
}
Write-OK "Copied $SEED_FILE -> /tmp/restore.dump"

# ---------------------------------------------------------------------------
# Drop + recreate database
# ---------------------------------------------------------------------------
Write-Step "Dropping and recreating database '$PG_DB'"

docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();
" *>$null

docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c "DROP DATABASE IF EXISTS $PG_DB;"
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to drop database"
    exit 1
}

docker exec $PG_CONTAINER psql -U $PG_USER -d postgres -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to create database"
    exit 1
}
Write-OK "Database recreated"

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
Write-Step "Restoring seed dump"
$startTime = Get-Date

docker exec $PG_CONTAINER pg_restore `
    -U $PG_USER `
    -d $PG_DB `
    --no-owner `
    --no-acl `
    --clean `
    --if-exists `
    -j 4 `
    -Fc `
    /tmp/restore.dump

$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Host "  pg_restore exited with code $exitCode (warnings about missing objects are normal)" -ForegroundColor Yellow
}

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
Write-OK "Restore finished in ${elapsed}s"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
docker exec $PG_CONTAINER rm /tmp/restore.dump *>$null

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Done. Local database restored from dev seed (anonymized data)." -ForegroundColor Green
Write-Host "Run migrations to apply any pending schema changes:" -ForegroundColor Gray
Write-Host "  make db-migrate" -ForegroundColor White
