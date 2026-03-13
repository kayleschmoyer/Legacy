---
name: db-migrate
description: 'Apply pending database migrations to update the schema in development or production environments using Drizzle.'
---

# Skill: Run Database Migration

> **MCP alternative**: Prefer the `db_migration_status` and `db_migrate` MCP tools (see `skills/mcp-db/SKILL.md`) — they return structured results and work from any directory. Fall back to the CLI commands below when the MCP server is unavailable.

## Purpose

Apply pending database migrations to update the schema in development or production environments.

## When to Use

- After creating a new migration file
- Setting up a new environment
- Deploying schema changes to production
- After pulling changes with new migrations

## Migration Commands

### Check Migration Status

View which migrations are applied and which are pending.

```powershell
# From root directory
pnpm run db:migrate status

# Alternative: From lib/db-client directory
cd lib/db-client
pnpm run db:status
```

**Output**:

```
✅ Applied: 20251117_190000_add_matchup_stats_loading_status.ts
⏸️  Pending: 20260131_210000_add_queued_status_to_stats_loading.ts
```

### Run Pending Migrations

Apply all pending migrations (most common operation).

```powershell
# From root directory (recommended)
pnpm run db:migrate

# Alternative: From lib/db-client directory
cd lib/db-client
pnpm run db:up
```

**What it does**:

- Connects to database using credentials from `.env`
- Creates `drizzle.__drizzle_migrations` table if needed
- Reads migration files from `lib/db-client/migrations/`
- Applies pending migrations in order
- Records applied migrations in database

### Rollback Last Migration

Undo the most recently applied migration.

```powershell
cd lib/db-client
pnpm run db:down
```

⚠️ **Warning**: Only use in development. Rollback may cause data loss.

### Other Migration Commands

```powershell
# Rollback all migrations and reapply
cd lib/db-client
pnpm run db:refresh

# Rollback all migrations
cd lib/db-client
pnpm run db:fresh

# Manual migration for complex operations
cd lib/db-client
pnpm run db:manual-migration
```

## Database Connection

Migrations use database credentials from `.env` file:

```env
DB_HOST=your-db-host.rds.amazonaws.com
DB_USER=postgres
DB_PASSWORD=your-password
DB_CERT_PATH=certs/us-east-1-bundle.pem  # For RDS SSL
```

### Connection Priority

1. Environment variables (`.env` file)
2. AWS Secrets Manager (fallback if AWS credentials available)
3. Manual migration user if `DB_MIGRATION_USER` set

## Complete Migration Workflow

### 1. Check Current State

```powershell
cd lib/db-client
pnpm run db:status
```

### 2. Run Pending Migrations

```powershell
pnpm run db:up
```

### 3. Verify Changes

```powershell
# Connect to database
pnpm run db:psql

# Check table structure
\d table_name

# Check enum values
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'enum_name'::regtype ORDER BY enumsortorder;

# Exit psql
\q
```

### 4. Update Application Code

After migrations run, restart services that use the database:

- Restart local DB Lambda (if running)
- Regenerate GraphQL types if schema changed
- Deploy updated Lambda functions

## Troubleshooting

### Migration Fails Midway

**Symptom**: Error during migration execution
**Solution**:

1. Check error message in output
2. Fix migration SQL
3. Manually rollback if needed: `pnpm run db:down`
4. Fix migration file
5. Run again: `pnpm run db:up`

### "Cannot connect to database"

**Solution**:

```powershell
# Verify .env has correct credentials
Get-Content .env | Select-String "DB_"

# Test connection
cd lib/db-client
pnpm run db:test
```

### "Migration already applied" but schema not updated

**Possible causes**:

1. Migration ran but failed partway
2. Manual schema changes conflict
3. Transaction rolled back

**Solution**:

```powershell
# Check what's actually in database
pnpm run db:psql

# Compare with migration file expectations
# May need to remove migration from tracking table if necessary
```

### Enum Value Already Exists

**Symptom**: `enum label "value" already exists, skipping`
**Cause**: Migration uses `IF NOT EXISTS` - this is normal
**Solution**: No action needed - migration is idempotent

## Post-Migration Tasks

After running migrations:

### 1. Restart Local Services

```powershell
# Restart DB Lambda to pick up schema changes
# Stop current: Ctrl+C in terminal
# Start: pnpm exec nx run db:serve
```

### 2. Regenerate Types (if GraphQL schema changed)

```powershell
pnpm exec nx run shared-components:codegen
```

### 3. Update Documentation

- Document schema changes in `docs/architecture/database-schema.md`
- Update CSV agent instructions if patterns changed
- Update API documentation if endpoints affected

## Related Skills

- [Write Database Migration](db-migration-write.md)
- [Database Connection](db-connect.md)
- [Sync Environment](sync-env.md)

## Related Documentation

- [Migration System Code](../../lib/db-client/src/scripts/rollback-migrations.ts)
- [Database Schema](../../docs/architecture/database-schema.md)
- [Drizzle ORM Docs](https://orm.drizzle.team/)

## Integration with Workflow

### Before Commit

```powershell
# If you modified database schema:

# 1. Generate migration
cd lib/db-client && pnpm run db:generate && cd ../..

# 2. Apply migration locally
pnpm run db:migrate

# 3. Test database operations
pnpm run cli:test-db

# 4. Run full validation
make pre-commit
```

### CI/CD Pipeline

Migrations are NOT automatically run in CI/CD. They must be applied manually to each environment.

## Database Tools

### Connect to Database

```powershell
# Interactive PostgreSQL shell
pnpm run db:psql

# For production (careful!)
pnpm run db:psql:production
```

### View Database URL

```powershell
# Show connection string (credentials masked)
pnpm run db:url

# Production URL
pnpm run db:url:production
```

### View Credentials

```powershell
# Display database credentials
pnpm run db:credentials

# Production credentials (careful!)
pnpm run db:credentials:production
```

## Migration File Structure

```
lib/db-client/migrations/
├── 20251108_000000_initial_schema.ts
├── 20251108_010000_add_matchup_team_pairings_and_scoring.ts
├── 20260221_010000_add_compute_career_scores_function.ts
└── ... (YYYYMMDD_HHMMSS_name.ts format, TypeScript only)
```

⚠️ **NOT** `lib/db-client/src/drizzle/migrations/` — that directory holds Drizzle ORM
schema models, not runnable migrations.

## Drizzle Schema Location

```
lib/db-client/src/drizzle/
├── public/models/     # Public schema table definitions
│   ├── Players.ts
│   ├── Leagues.ts
│   └── ...
├── internal/models/   # app_internal schema tables
└── migrations/        # ⚠️ NOT runnable migrations — schema model files only
```

## Exit Codes

- **0**: Migrations applied successfully
- **Non-zero**: Migration failed (check error message)

## Related Skills

- [Database Connection](db-connect.md) - Testing database connectivity
- [Sync Environment](sync-env.md) - Syncing database credentials
- [Dev DB Lambda](dev-db-lambda.md) - Running local GraphQL server

## Related Documentation

- [Database Schema](../../../docs/architecture/database-schema.md)
- [Schema Validation](../../../docs/architecture/schema-validation.md)
- [Development Setup](../../../docs/guides/development-setup.md)
