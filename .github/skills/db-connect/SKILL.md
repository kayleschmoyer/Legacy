---
name: db-connect
description: 'Test database connectivity and access the PostgreSQL interactive shell for direct database access and ad-hoc queries.'
---

# Skill: Database Connection

> **MCP alternative**: Use the `db_check_health` MCP tool (see `skills/mcp-db/SKILL.md`) for a pre-flight check of Docker, Postgres, and migration status. Fall back to the CLI commands below for interactive shells or detailed credential inspection.

## Overview

Test database connectivity and access the PostgreSQL interactive shell.

## When to Use

- Verifying database credentials are correct
- Before running migrations
- Troubleshooting connection issues
- Inspecting database schema manually
- Running SQL queries for debugging
- Testing database after environment sync

## Command

```powershell
# Test database connection
pnpm run db:test
```

## Alternative Commands

### Run SQL Queries (Recommended)

```powershell
# Run SQL query with script (recommended)
.\scripts\db-query.ps1 -Query "SELECT * FROM players LIMIT 10"

# With JSON output format
.\scripts\db-query.ps1 -Query "SELECT * FROM leagues" -Format json
```

### Interactive PostgreSQL Shell

```powershell
# Connect to database with psql (for interactive sessions)
pnpm run db:psql

# For production (careful!)
pnpm run db:psql:production
```

### View Connection Details

```powershell
# Show database URL (credentials masked)
pnpm run db:url

# Show full credentials
pnpm run db:credentials

# Production credentials (careful!)
pnpm run db:credentials:production
```

### Test with CLI Tools

```powershell
# Test using CLI tool
pnpm run cli:test-connection

# More detailed test
pnpm run cli:test-db

# Test internal connection
pnpm run cli:test-internal
```

### Inspect Database

```powershell
# Inspect database structure
pnpm run cli:inspect-database
```

## Expected Output

- **Success**: "Connected to database successfully"
- **Connection Details**: Host, port, database name
- **PSQL**: Interactive shell prompt if connecting directly

## Common Issues

### Issue: Connection refused

**Symptom**: "ECONNREFUSED" or "connection refused"
**Solution**: Check if database is running and accessible

```powershell
# 1. Verify credentials are synced
pnpm run sync-env

# 2. Check database URL
pnpm run db:url

# 3. Test connection
pnpm run db:test

# 4. If still failing, check VPN/network access
```

### Issue: Authentication failed

**Symptom**: "password authentication failed"
**Solution**: Resync credentials from AWS

```powershell
# Sync environment variables
pnpm run sync-env

# Verify credentials updated
pnpm run db:credentials

# Test connection again
pnpm run db:test
```

### Issue: Database not found

**Symptom**: "database does not exist"
**Solution**: Verify database name in connection string

```powershell
# Check database URL
pnpm run db:url

# Should show: postgres://user@host:5432/legacy_sports
# If different, check environment variables
```

### Issue: Timeout errors

**Symptom**: Connection times out
**Solution**: Check network connectivity and security groups

```powershell
# 1. Check VPN is connected (if required)
# 2. Verify security groups allow your IP
# 3. Try direct connection vs proxy
pnpm run sync-env:direct  # Try direct connection
```

### Issue: SSL/TLS errors

**Symptom**: SSL certificate verification failed
**Solution**: Check SSL configuration

```powershell
# AWS RDS requires SSL
# Ensure environment has correct SSL settings
# Certificate should be in certs/ folder
```

## Best Practices

1. **Test connection first** before running migrations or operations
2. **Sync environment** before testing connection
3. **Use `db-query.ps1` script** for one-off queries instead of psql
4. **Use psql only for interactive sessions** that require multiple queries
5. **Verify credentials** are for correct environment (dev vs prod)
6. **Close connections** when done (Ctrl+D in psql)

## Interactive Shell Commands

### Common psql Commands

```sql
-- List all tables
\dt

-- Describe table structure
\d table_name

-- List all schemas
\dn

-- List all databases
\l

-- Show current connection info
\conninfo

-- Execute SQL query
SELECT * FROM players LIMIT 10;

-- Exit psql
\q
```

### Useful Queries

```sql
-- Count records in table
SELECT COUNT(*) FROM players;

-- Check migrations applied
SELECT * FROM drizzle_migrations ORDER BY created_at DESC;

-- View table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'players';

-- Check database size
SELECT pg_size_pretty(pg_database_size('legacy_sports'));
```

## Integration with Workflow

### Before Running Migrations

```powershell
# 1. Sync environment
pnpm run sync-env

# 2. Test connection
pnpm run db:test

# 3. If successful, run migrations
pnpm run db:migrate
```

### Troubleshooting Database Issues

```powershell
# 1. Test connection
pnpm run db:test

# 2. If failing, check credentials
pnpm run db:credentials

# 3. If credentials wrong, resync
pnpm run sync-env

# 4. Test again
pnpm run db:test
```

### Daily Development Startup

```powershell
# 1. Sync environment (first time or after changes)
pnpm run sync-env

# 2. Test database connection
pnpm run db:test

# 3. If good, start development
pnpm run dev
```

## Connection Types

### Development Database

```powershell
# Default connection (via proxy)
pnpm run db:test

# Direct connection (no proxy)
pnpm run sync-env:direct
pnpm run db:test
```

### Production Database (Careful!)

```powershell
# Test production (read-only checks only!)
pnpm run db:test:production

# Access production shell (EXTREME CAUTION)
pnpm run db:psql:production
# Only use for read-only queries
# Never run DELETE, UPDATE, DROP in production
```

## Environment Variables

### Required Variables

- `DATABASE_URL` - Full connection string
- `DB_HOST` - Database host (optional, extracted from URL)
- `DB_PORT` - Database port (optional, default 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password (in AWS Secrets Manager)

### Checking Variables

```powershell
# View database URL (masked password)
pnpm run db:url

# View full credentials (sensitive!)
pnpm run db:credentials
```

## Connection Pooling

The db-client library uses connection pooling:

- Development: 5-10 connections
- Production: 20-50 connections (configured in Lambda)
- Automatic reconnection on failures
- Timeout handling

## Exit Codes

- **0**: Connection successful
- **Non-zero**: Connection failed (check error message)

## Related Skills

- [Sync Environment](sync-env.md) - Syncing database credentials
- [Database Migration](db-migrate.md) - Running migrations
- [Dev DB Lambda](dev-db-lambda.md) - Starting GraphQL server

## Related Documentation

- [Database Schema](../../../docs/architecture/database-schema.md)
- [Development Setup](../../../docs/guides/development-setup.md)
- [Security & Secrets](../../../docs/guides/security-and-secrets.md)

## Security Notes

⚠️ **Important**:

- Never commit database credentials to git
- Use `.env.local` for local credentials (git-ignored)
- Production credentials only via AWS Secrets Manager
- Always use masked URLs in logs/output
- Limit production access to read-only when possible
