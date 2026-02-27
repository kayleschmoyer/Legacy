#!/usr/bin/env pwsh
# =============================================================================
# scripts/db-restore.ps1 - Restore a pg_dump to the local Docker database
# =============================================================================
#
# Downloads the latest dump from S3 (or uses a local file) and restores it
# into the running local Docker PostgreSQL container.
#
# Requirements: Docker must be running, ls-postgres container must be up.
#   docker compose up -d postgres
#
# Usage:
#   .\scripts\db-restore.ps1                     # download latest from S3 + restore
#   .\scripts\db-restore.ps1 -SkipDownload       # restore from existing local file
#   .\scripts\db-restore.ps1 -DumpFile custom.dump
#
# =============================================================================

param(
    [string]$DumpFile = "resources\dev.dump",
    [switch]$SkipDownload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$S3_BUCKET     = "legacy-sports-dev-lambdas-cca20ad9"
$S3_PREFIX     = "db-dumps"
$PG_CONTAINER  = "ls-postgres"
$PG_USER       = "legacy_sports"
$PG_DB         = "legacy_sports_dev"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "   ERR $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Safety prompt - this wipes the local DB
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[!]  This will DROP and recreate the local database '$PG_DB'." -ForegroundColor Yellow
Write-Host "   All local data will be replaced with the dumped data." -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Type 'yes' to continue"
if ($confirm -ne "yes") {
    Write-Host "Aborted." -ForegroundColor Gray
    exit 0
}

# ---------------------------------------------------------------------------
# Verify Docker + postgres container
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
# Download latest dump from S3 (unless -SkipDownload)
# ---------------------------------------------------------------------------
$dumpPath = Join-Path (Join-Path $PSScriptRoot "..") $DumpFile

if (-not $SkipDownload) {
    Write-Step "Downloading latest dump from S3"

    $s3Latest = "s3://$S3_BUCKET/$S3_PREFIX/latest.dump"
    Write-Host "  <- $s3Latest" -ForegroundColor Gray

    $dumpDir = Split-Path $dumpPath -Parent
    if (-not (Test-Path $dumpDir)) {
        New-Item -ItemType Directory -Path $dumpDir -Force | Out-Null
    }

    aws s3 cp $s3Latest $dumpPath
    if ($LASTEXITCODE -ne 0) {
        Write-Err "S3 download failed - check AWS SSO: aws sso login"
        exit 1
    }

    $sizeMB = [math]::Round((Get-Item $dumpPath).Length / 1MB, 1)
    Write-OK "Downloaded: ${sizeMB} MB -> $DumpFile"
} else {
    if (-not (Test-Path $dumpPath)) {
        Write-Err "Dump file not found: $dumpPath"
        Write-Host "  Run without -SkipDownload to fetch from S3, or run: make db-dump" -ForegroundColor White
        exit 1
    }
    $sizeMB = [math]::Round((Get-Item $dumpPath).Length / 1MB, 1)
    Write-Step "Using existing local dump: ${sizeMB} MB"
}

# ---------------------------------------------------------------------------
# Copy dump into container and restore
# ---------------------------------------------------------------------------
Write-Step "Copying dump into container"
docker cp $dumpPath "${PG_CONTAINER}:/tmp/restore.dump"
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker cp failed"
    exit 1
}
Write-OK "Copied to /tmp/restore.dump"

Write-Step "Dropping and recreating database '$PG_DB'"
# Drop existing connections, then recreate
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

Write-Step "Restoring dump (this may take a few minutes)"
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

# pg_restore exits non-zero for non-fatal warnings (e.g. missing extensions) - tolerate those
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Host "  pg_restore exited with code $exitCode (warnings are normal)" -ForegroundColor Yellow
}

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
Write-OK "Restore finished in ${elapsed}s"

# ---------------------------------------------------------------------------
# Cleanup temp file in container
# ---------------------------------------------------------------------------
docker exec $PG_CONTAINER rm /tmp/restore.dump *>$null

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Done. Your local database now mirrors the RDS dump." -ForegroundColor Green
Write-Host "If migrations are out of date, run:" -ForegroundColor Gray
Write-Host "  make db-migrate" -ForegroundColor White
