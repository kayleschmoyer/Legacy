#!/usr/bin/env pwsh
# =============================================================================
# scripts/db-scrub.ps1 - Anonymize PII in the local Docker database
# =============================================================================
#
# Runs anonymization SQL against the running local Docker postgres container.
# Safe to run multiple times (idempotent). Does NOT touch the RDS database.
#
# Tables scrubbed:
#   app_internal.users         - username, email, password_hash
#   app_internal.device_tokens - push notification tokens cleared
#   app_internal.notification_history - message bodies truncated
#
# Usage:
#   .\scripts\db-scrub.ps1          # anonymize local Docker DB
#
# =============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PG_CONTAINER = "ls-postgres"
$PG_USER      = "legacy_sports"
$PG_DB        = "legacy_sports_dev"

function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "   ERR $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Verify container is up
# ---------------------------------------------------------------------------
Write-Step "Checking postgres container"
docker ps -q *>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker is not running"
    exit 1
}
$running = docker inspect --format "{{.State.Running}}" $PG_CONTAINER 2>$null
if ($running -ne "true") {
    Write-Err "Container '$PG_CONTAINER' is not running. Start it with: docker compose up -d postgres"
    exit 1
}
Write-OK "Container is running"

# ---------------------------------------------------------------------------
# Run anonymization SQL
# ---------------------------------------------------------------------------
Write-Step "Anonymizing app_internal.users"

$usersSQL = @"
UPDATE app_internal.users
SET
  username      = 'user_' || id,
  email         = 'user_' || id || '@example.com',
  password_hash = repeat('0', 128);
"@

docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c $usersSQL
if ($LASTEXITCODE -ne 0) {
    Write-Err "Failed to anonymize users"
    exit 1
}
Write-OK "Users anonymized"

# ---------------------------------------------------------------------------
Write-Step "Clearing device tokens"

$tokenTableExists = docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'app_internal' AND table_name = 'device_tokens');"
if ($tokenTableExists.Trim() -eq 't') {
    docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c "UPDATE app_internal.device_tokens SET token = 'REDACTED_' || id;"
    if ($LASTEXITCODE -ne 0) { Write-Host "   WARN device_tokens update failed (non-fatal)" -ForegroundColor Yellow }
    else { Write-OK "Device tokens cleared" }
} else {
    Write-OK "device_tokens table not present, skipping"
}

# ---------------------------------------------------------------------------
Write-Step "Truncating notification history"

$notifTableExists = docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'app_internal' AND table_name = 'notification_history');"
if ($notifTableExists.Trim() -eq 't') {
    docker exec $PG_CONTAINER psql -U $PG_USER -d $PG_DB -c "TRUNCATE TABLE app_internal.notification_history;"
    if ($LASTEXITCODE -ne 0) { Write-Host "   WARN notification_history truncate failed (non-fatal)" -ForegroundColor Yellow }
    else { Write-OK "Notification history cleared" }
} else {
    Write-OK "notification_history table not present, skipping"
}

# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Scrub complete. PII removed from local database '$PG_DB'." -ForegroundColor Green
