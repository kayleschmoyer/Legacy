# Scripts Directory

This directory contains scripts for various workspace management tasks.

## Package.json Validation Scripts

### `validate-package-json-standards.js`

Validates that all package.json files follow NX best practices:

- Scoped naming (@legacy-sports/)
- Consistent versioning (0.0.1)
- Private flag set to true
- Proper main/types paths for libraries
- Clean metadata (no description/author/license)
- Wildcard dependencies for shared packages

**Usage:**

```bash
node scripts/validate-package-json-standards.js
npm run validate:package-json
npx nx validate:package-json
```

### `validate-workspace-deps.js`

Ensures workspace projects use dependencies from root package.json with wildcard references:

**Usage:**

```bash
node scripts/validate-workspace-deps.js
npm run validate:workspace-deps
npx nx validate:workspace-deps
```

### Combined Validation

```bash
npm run validate
npx nx validate
```

## Environment Variables Sync Scripts

This directory contains scripts to synchronize environment variables from AWS Secrets Manager and Terraform outputs to your local `.env` file.

## Available Scripts

### PowerShell Script (Windows)

- **File:** `sync-env.ps1`
- **Usage:** `.\scripts\sync-env.ps1 [options]`

### Bash Script (Linux/macOS)

- **File:** `sync-env.sh`
- **Usage:** `./scripts/sync-env.sh [environment]`

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Terraform applied** in the `terraform/` directory
3. **jq installed** (for bash script only)

## Database Connection Strategy

The scripts now support two database connection strategies:

### Direct Database Connection (Default)

- **Use for:** Database migrations, schema changes, admin tasks
- **Endpoint:** `DB_HOST_DIRECT` - Points directly to RDS instance
- **Benefits:** Full database access, required for migrations
- **Script usage:** `-DatabaseEndpoint direct` (PowerShell) or `DATABASE_ENDPOINT=direct` (Bash)

### RDS Proxy Connection

- **Use for:** Runtime application connections, production traffic
- **Endpoint:** `DB_HOST` when using proxy mode - Points to RDS Proxy
- **Benefits:** Connection pooling, automatic failover, better security
- **Script usage:** `-DatabaseEndpoint proxy` (PowerShell) or `DATABASE_ENDPOINT=proxy` (Bash)

### Generated Environment Variables

The scripts generate these database-related variables:

- `DB_TYPE`: Set to "PG_REMOTE" for AWS RDS
- `DB_HOST`: Main database host (direct or proxy based on -DatabaseEndpoint)
- `DB_HOST_DIRECT`: Always contains direct RDS instance endpoint
- `RDS_PROXY_ENDPOINT`: Always contains RDS proxy endpoint
- `DB_USER`: Database username from AWS Secrets Manager
- `DB_PASSWORD`: Database password from AWS Secrets Manager
- `DB_CREDENTIALS_SECRET_NAME`: AWS Secrets Manager secret name
- `AWS_REGION`: AWS region
- `USE_LOCAL_CREDS`: Set to "false" for AWS-based credentials

## PowerShell Script Options

```powershell
# Basic usage (uses direct database endpoint for migrations)
.\scripts\sync-env.ps1

# Use proxy endpoint for runtime
.\scripts\sync-env.ps1 -DatabaseEndpoint proxy

# With all options
.\scripts\sync-env.ps1 -Environment "dev" -DatabaseEndpoint "direct" -DryRun -Backup

# Parameters:
# -Environment       : Target environment (default: "dev")
# -TerraformDir      : Terraform directory (default: "terraform")
# -EnvFile           : Environment file path (default: ".env")
# -DatabaseEndpoint  : Which DB endpoint to use for DB_HOST ("direct" or "proxy", default: "direct")
# -DryRun            : Show what would change without applying
# -Backup            : Create backup of existing .env file
```

## Bash Script Usage

```bash
# Basic usage (uses direct database endpoint for migrations)
./scripts/sync-env.sh

# Use proxy endpoint for runtime
DATABASE_ENDPOINT=proxy ./scripts/sync-env.sh

# With environment parameter
./scripts/sync-env.sh dev

# With dry run
DRY_RUN=true ./scripts/sync-env.sh

# Environment variables:
# DATABASE_ENDPOINT : Which DB endpoint to use for DB_HOST ("direct" or "proxy", default: "direct")
# DRY_RUN          : Set to "true" for dry run mode
# BACKUP           : Set to "true" to backup existing .env file
```

# With backup

BACKUP=true ./scripts/sync-env.sh

````

## What Gets Updated

The scripts will pull and update the following environment variables:

### From AWS Secrets Manager:

- `DB_PASSWORD` - Database password
- `JWT_SECRET` - JWT signing secret
- `GOOGLE_OAUTH_CLIENT_SECRET` - Google OAuth client secret
- `COOKIE_SECRET` - OAuth proxy cookie secret

### From Terraform Outputs:

- `DB_HOST` - RDS proxy endpoint
- `DB_USER` - Database username
- `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` - Google OAuth client ID
- `CLIENT_ID` - Google OAuth client ID (duplicate)

### Preserved Values:

- All local development URLs (localhost:5000, etc.)
- Comments and formatting
- Any custom environment variables

## Security

- Sensitive values are masked in output logs
- Original `.env` structure and comments are preserved
- Backup option available to prevent data loss
- Dry run mode to preview changes

## Examples

```powershell
# Preview changes without applying
.\scripts\sync-env.ps1 -DryRun

# Update with backup
.\scripts\sync-env.ps1 -Backup

# Update different environment file
.\scripts\sync-env.ps1 -EnvFile ".env.local"
````

```bash
# Preview changes (bash)
DRY_RUN=true ./scripts/sync-env.sh

# Update with backup (bash)
BACKUP=true ./scripts/sync-env.sh

# Make script executable (Linux/macOS only)
chmod +x scripts/sync-env.sh
```

## Troubleshooting

1. **AWS credentials not configured:**

   ```
   aws configure
   # or
   aws sso login
   ```

2. **Terraform not applied:**

   ```
   cd terraform
   terraform apply
   ```

3. **jq not installed (bash script):**

   ```bash
   # Ubuntu/Debian
   sudo apt-get install jq

   # macOS
   brew install jq
   ```

4. **Permission denied (bash script):**
   ```bash
   chmod +x scripts/sync-env.sh
   ```
