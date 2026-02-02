#!/usr/bin/env pwsh
# Database Query Wrapper
# Simplifies running SQL queries against the database
#
# ⚠️ IMPORTANT: This script is for DATA queries/operations only (SELECT, INSERT, UPDATE, DELETE)
#
# For SCHEMA changes (ALTER TABLE, CREATE TABLE, CREATE INDEX, etc.),
# see: docs/database/migration-policy.md
#
# All schema changes MUST be done through migrations in:
# lib/db-client/migrations/

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Query,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('table', 'json')]
    [string]$Format = 'table',
    
    [Parameter(Mandatory=$false)]
    [string]$DbHost = 'legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com',
    
    [Parameter(Mandatory=$false)]
    [string]$SecretName = 'legacy-sports-dev-db-creds-20250925194630368900000002'
)

# Set environment variables
$env:DB_HOST = $DbHost
$env:DB_SECRET_NAME = $SecretName

# Run the query
& pnpm exec tsx --tsconfig tsconfig.base.json apps/cli/src/main.ts query-db --query $Query --format $Format
