# Environment Sync Script - Updated for New Credential System

## Overview

The `sync-env` scripts have been updated to work with the new unified database credential management system. These scripts pull AWS secrets and configuration from Terraform and update your `.env` file accordingly.

## Available Scripts

### Bash Version (Linux/macOS/WSL)

```bash
./scripts/sync-env.sh [environment] [terraform-dir] [env-file]
```

### PowerShell Version (Windows)

```powershell
.\scripts\sync-env.ps1 [-Environment dev] [-TerraformDir terraform] [-EnvFile .env] [-DatabaseEndpoint proxy|direct] [-DryRun] [-Backup]
```

## Key Changes for New Credential System

### ✅ What Changed

**Before (Legacy):**

- Script fetched actual database credentials from AWS Secrets Manager
- Put `DB_USER` and `DB_PASSWORD` directly in `.env` file
- Required `USE_LOCAL_CREDS=true` for production (confusing)

**After (New System):**

- Script stores the **secret name** in `DB_SECRET_NAME`
- Sets `USE_LOCAL_CREDENTIALS=false` to use AWS Secrets Manager
- Database credentials are fetched securely at runtime by applications

### ✅ New Environment Variables Set

```bash
# New unified credential system
USE_LOCAL_CREDENTIALS=false
DB_SECRET_NAME=dev/legacy-sports-db-creds-xyz
DB_HOST=database-host.amazonaws.com

# Legacy variables (for backward compatibility)
DB_CREDS_PATH=dev/legacy-sports-db-creds-xyz

# Other configuration
AWS_REGION=us-east-1
RDS_PROXY_ENDPOINT=proxy-endpoint.amazonaws.com
```

## Usage Examples

### Standard Production Setup

```powershell
# Update .env with production AWS credentials
.\scripts\sync-env.ps1

# Output:
# ✓ Production apps will automatically fetch DB credentials from AWS Secrets Manager
# ✓ Use 'pnpm run db:test:production' to validate database connectivity
```

### For Database Migrations

```powershell
# Use direct database endpoint (bypasses proxy)
.\scripts\sync-env.ps1 -DatabaseEndpoint direct

# This sets DB_HOST to the direct RDS endpoint for migration tools
```

### Dry Run (Preview Changes)

```powershell
# See what would change without modifying files
.\scripts\sync-env.ps1 -DryRun

# Output shows masked secrets and configuration changes
```

### Backup Existing Environment

```powershell
# Create backup before updating
.\scripts\sync-env.ps1 -Backup

# Creates .env.backup.20250925-143022
```

## Testing After Sync

After running the sync script, test the new credential system:

```bash
# Test production database connectivity
pnpm run db:test:production

# View resolved credentials (passwords masked)
pnpm run db:credentials:production

# Get connection URL for manual testing
pnpm run db:url:production
```

## Environment Variable Priorities

The sync script sets up this credential resolution hierarchy:

1. **Production (after sync-env)**: `USE_LOCAL_CREDENTIALS=false` → AWS Secrets Manager
2. **Local Development**: `USE_LOCAL_CREDENTIALS=true` → Environment variables in `.env.local`
3. **Fallback**: Default values for development

## File Structure After Sync

```bash
# Production environment (.env after sync)
USE_LOCAL_CREDENTIALS=false
DB_SECRET_NAME=dev/legacy-sports-db-creds-xyz
DB_HOST=proxy-endpoint.amazonaws.com

# Local development (.env.local - manually managed)
USE_LOCAL_CREDENTIALS=true
DB_HOST=localhost:5432
DB_PASSWORD=your-local-password
```

## Migration Benefits

1. **Security**: No plain-text database passwords in environment files
2. **Simplicity**: Single source of truth for credential resolution
3. **Flexibility**: Easy switching between local/production databases
4. **Tooling**: CLI commands for connection testing and management

## Troubleshooting

### Sync Script Issues

```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify Terraform state
cd terraform && terraform show
```

### Database Connection Issues

```bash
# Test the new credential system
pnpm run db:test:production

# Check what credentials are resolved
pnpm run db:credentials:production
```

### Environment Variable Conflicts

- Remove old `DB_USER`, `DB_PASSWORD` from `.env` if present
- Keep local credentials in `.env.local` only
- Use `USE_LOCAL_CREDENTIALS` to control credential source

The updated sync scripts now properly integrate with the unified credential management system, providing secure and simplified database credential handling! 🔒
