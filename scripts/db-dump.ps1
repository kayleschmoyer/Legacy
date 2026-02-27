#!/usr/bin/env pwsh
# =============================================================================
# scripts/db-dump.ps1 - Dump the RDS PostgreSQL database to S3
# =============================================================================
#
# Dumps the live AWS RDS database to a compressed custom-format pg_dump file
# and uploads it to S3 with both a timestamped key and a `latest.dump` alias.
#
# Uses `docker run postgres:16-alpine` for pg_dump - no local psql required.
#
# Usage:
#   .\scripts\db-dump.ps1                    # dump to S3 + local cache
#   .\scripts\db-dump.ps1 -SkipUpload        # dump locally only (no S3)
#   .\scripts\db-dump.ps1 -DumpFile custom.dump
#
# =============================================================================

param(
    [string]$DumpFile = "resources\dev.dump",
    [switch]$SkipUpload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$S3_BUCKET = "legacy-sports-dev-lambdas-cca20ad9"
$S3_PREFIX = "db-dumps"
$RDS_HOST  = "legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com"
$RDS_PORT  = "5432"
$RDS_DB    = "postgres"   # the actual database name on the RDS instance

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Step([string]$msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "   OK $msg" -ForegroundColor Green }
function Write-Err([string]$msg)  { Write-Host "   ERR $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Load .env (real secrets, not .env.docker)
# ---------------------------------------------------------------------------
Write-Step "Loading credentials from .env"
$envPath = Join-Path (Join-Path $PSScriptRoot "..") ".env"
if (-not (Test-Path $envPath)) {
    Write-Err ".env not found - run: pnpm run sync-env"
    exit 1
}

$envVars = @{}
Get-Content $envPath | ForEach-Object {
    if ($_ -match '^([A-Z0-9_]+)=(.*)$') {
        $envVars[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
    }
}

$DB_USER = $envVars["DB_USER"]
$DB_PASSWORD = $envVars["DB_PASSWORD"]

if (-not $DB_USER -or -not $DB_PASSWORD) {
    Write-Err "DB_USER or DB_PASSWORD not found in .env"
    exit 1
}
Write-OK "Credentials loaded (user: $DB_USER, db: $RDS_DB)"

# ---------------------------------------------------------------------------
# Verify Docker is running
# ---------------------------------------------------------------------------
Write-Step "Checking Docker"
docker ps -q *>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker is not running - start Docker Desktop first"
    exit 1
}
Write-OK "Docker is running"

# ---------------------------------------------------------------------------
# Ensure output directory exists
# ---------------------------------------------------------------------------
$dumpPath = Join-Path (Join-Path $PSScriptRoot "..") $DumpFile
$dumpDir  = Split-Path $dumpPath -Parent
if (-not (Test-Path $dumpDir)) {
    New-Item -ItemType Directory -Path $dumpDir -Force | Out-Null
}

# ---------------------------------------------------------------------------
# Run pg_dump via Docker (no local psql needed)
# ---------------------------------------------------------------------------
Write-Step "Dumping RDS database: $RDS_DB @ $RDS_HOST"
Write-Host "  Output: $DumpFile" -ForegroundColor Gray

$dumpAbsPath = (Resolve-Path -Path $dumpDir).Path
$dumpFileName = Split-Path $dumpPath -Leaf

$connString = "postgresql://${DB_USER}:${DB_PASSWORD}@${RDS_HOST}:${RDS_PORT}/${RDS_DB}"

$dockerArgs = @(
    "run", "--rm",
    "-e", "PGSSLMODE=require",
    "-v", "${dumpAbsPath}:/dump",
    "postgres:16-alpine",
    "pg_dump", $connString,
    "--no-owner", "--no-acl",
    "--exclude-schema=pg_catalog",
    "-Fc",           # custom binary format (compressed, restores fast)
    "-Z", "9",       # max compression
    "-f", "/dump/$dumpFileName"
)

$startTime = Get-Date
docker @dockerArgs
if ($LASTEXITCODE -ne 0) {
    Write-Err "pg_dump failed (exit $LASTEXITCODE)"
    exit 1
}

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
$sizeMB   = [math]::Round((Get-Item $dumpPath).Length / 1MB, 1)
Write-OK "Dump complete: ${sizeMB} MB in ${elapsed}s"

# ---------------------------------------------------------------------------
# Upload to S3
# ---------------------------------------------------------------------------
if (-not $SkipUpload) {
    Write-Step "Uploading to S3"

    $timestamp  = (Get-Date -Format "yyyy-MM-dd_HH-mm")
    $s3Timestamped = "s3://$S3_BUCKET/$S3_PREFIX/${timestamp}.dump"
    $s3Latest      = "s3://$S3_BUCKET/$S3_PREFIX/latest.dump"

    Write-Host "  -> $s3Timestamped" -ForegroundColor Gray
    aws s3 cp $dumpPath $s3Timestamped --storage-class STANDARD_IA
    if ($LASTEXITCODE -ne 0) {
        Write-Err "S3 upload failed"
        exit 1
    }

    Write-Host "  -> $s3Latest (alias)" -ForegroundColor Gray
    aws s3 cp $s3Timestamped $s3Latest
    if ($LASTEXITCODE -ne 0) {
        Write-Err "S3 latest alias update failed"
        exit 1
    }

    Write-OK "Uploaded: $s3Timestamped"
    Write-OK "Updated:  $s3Latest"
} else {
    Write-Host "  Skipped S3 upload (-SkipUpload)" -ForegroundColor Yellow
}

Write-Host "`nDone. To restore locally:" -ForegroundColor Green
Write-Host "  make db-restore" -ForegroundColor White
