#!/usr/bin/env pwsh
# =============================================================================
# scripts/db-restore-dev.ps1 - Restore the scrubbed dev seed dump (no AWS needed)
# =============================================================================
#
# Restores resources/dev-seed.dump into the local Docker postgres container.
# No AWS credentials required - the seed dump is committed to the repo via
# Git LFS and contains anonymized data only (no real user PII).
#
# Requirements:
#   git lfs pull          (if you haven't already pulled LFS files)
#   docker compose up -d postgres
#
# Usage:
#   .\scripts\db-restore-dev.ps1
#
# =============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SEED_FILE    = "resources\dev-seed.dump"
$PG_CONTAINER = "ls-postgres"
$PG_USER      = "legacy_sports"
$PG_DB        = "legacy_sports_dev"

function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "   ERR $msg" -ForegroundColor Red }

$repoRoot = Join-Path $PSScriptRoot ".."
$seedPath = Join-Path $repoRoot $SEED_FILE

# ---------------------------------------------------------------------------
# Check seed file exists
# ---------------------------------------------------------------------------
if (-not (Test-Path $seedPath)) {
    Write-Host ""
    Write-Err "Seed file not found: $SEED_FILE"
    Write-Host ""
    Write-Host "Pull it from Git LFS first:" -ForegroundColor Yellow
    Write-Host "  git lfs pull" -ForegroundColor White
    Write-Host ""
    Write-Host "Or create a fresh one (requires AWS access):" -ForegroundColor Yellow
    Write-Host "  make db-dump-dev" -ForegroundColor White
    exit 1
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
