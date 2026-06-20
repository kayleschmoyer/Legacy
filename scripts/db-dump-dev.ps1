#!/usr/bin/env pwsh
# =============================================================================
# scripts/db-dump-dev.ps1 - Create the scrubbed dev seed dump and upload to S3
# =============================================================================
#
# Prerequisite: local Docker postgres must already contain the production data.
#   Run first: make db-restore   (requires AWS access)
#
# This script then:
#   1. Scrubs PII from the local database (anonymizes users, clears tokens)
#   2. Dumps the scrubbed DB to resources/dev-seed.dump
#   3. Uploads it to the public-read S3 location consumed by db-restore-dev
#      (requires AWS credentials with s3:PutObject on the team_logos bucket).
#
# Run this whenever production data has significantly changed and you want to
# refresh the seed dump that non-AWS devs / codespaces / cloud agents consume.
#
# Usage:
#   .\scripts\db-dump-dev.ps1               # dump + upload
#   .\scripts\db-dump-dev.ps1 -SkipUpload   # dump only (no S3 push)
#
# =============================================================================

[CmdletBinding()]
param(
    [switch]$SkipUpload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SEED_FILE    = "resources\dev-seed.dump"
$S3_URI       = "s3://legacy-sports-dev-team-logos-8c4d4e8d/dev-assets/dev-seed.dump"
$PG_CONTAINER = "ls-postgres"
$PG_USER      = "legacy_sports"
$PG_DB        = "legacy_sports_dev"

function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "   ERR $msg" -ForegroundColor Red }

$scriptsDir = $PSScriptRoot

# ---------------------------------------------------------------------------
# Verify container is up
# ---------------------------------------------------------------------------
Write-Step "Checking postgres container"
docker ps -q *>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker is not running - start Docker Desktop first"
    exit 1
}
$running = docker inspect --format "{{.State.Running}}" $PG_CONTAINER 2>$null
if ($running -ne "true") {
    Write-Err "Container '$PG_CONTAINER' is not running."
    Write-Host "  Start with: docker compose up -d postgres" -ForegroundColor White
    Write-Host "  Then run:   make db-restore   (to load production data first)" -ForegroundColor White
    exit 1
}
Write-OK "Container is running"

# ---------------------------------------------------------------------------
# Step 1/2: Scrub PII
# ---------------------------------------------------------------------------
Write-Step "Step 1/2 - Scrubbing PII from local database"
$scrubScript = Join-Path $scriptsDir "db-scrub.ps1"
& powershell -ExecutionPolicy Bypass -File $scrubScript
if ($LASTEXITCODE -ne 0) {
    Write-Err "db-scrub.ps1 failed"
    exit 1
}
Write-OK "Scrub complete"

# ---------------------------------------------------------------------------
# Step 2/2: Dump the scrubbed DB to resources/dev-seed.dump
# ---------------------------------------------------------------------------
Write-Step "Step 2/2 - Dumping scrubbed database to $SEED_FILE"

$repoRoot = Join-Path $scriptsDir ".."
$seedPath = Join-Path $repoRoot $SEED_FILE
$seedDir  = Split-Path $seedPath -Parent
if (-not (Test-Path $seedDir)) {
    New-Item -ItemType Directory -Path $seedDir -Force | Out-Null
}

$startTime = Get-Date

docker exec $PG_CONTAINER pg_dump `
    -U $PG_USER `
    -d $PG_DB `
    --no-owner `
    --no-acl `
    -Fc `
    -Z 9 `
    -f /tmp/dev-seed.dump

if ($LASTEXITCODE -ne 0) {
    Write-Err "pg_dump inside container failed"
    exit 1
}

docker cp "${PG_CONTAINER}:/tmp/dev-seed.dump" $seedPath
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker cp of seed dump failed"
    exit 1
}

docker exec $PG_CONTAINER rm /tmp/dev-seed.dump *>$null

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
$sizeMB   = [math]::Round((Get-Item $seedPath).Length / 1MB, 1)
Write-OK "Seed dump created: ${sizeMB} MB in ${elapsed}s -> $SEED_FILE"

# ---------------------------------------------------------------------------
# Upload to S3 (public-read; consumed by db-restore-dev)
# ---------------------------------------------------------------------------
if (-not $SkipUpload) {
    Write-Step "Uploading dump to $S3_URI"
    aws s3 cp $seedPath $S3_URI --content-type application/octet-stream
    if ($LASTEXITCODE -ne 0) {
        Write-Err "aws s3 cp failed (exit $LASTEXITCODE). Are AWS credentials configured?"
        exit 1
    }
    Write-OK "Uploaded to S3"
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Done! Scrubbed seed dump is ready." -ForegroundColor Green
Write-Host ""
if ($SkipUpload) {
    Write-Host "Skipped S3 upload. To publish for other devs:" -ForegroundColor Yellow
    Write-Host "  aws s3 cp $SEED_FILE $S3_URI --content-type application/octet-stream"
    Write-Host ""
}
Write-Host "Other devs / codespaces / cloud agents restore it with:" -ForegroundColor Cyan
Write-Host "  make db-restore-dev"
