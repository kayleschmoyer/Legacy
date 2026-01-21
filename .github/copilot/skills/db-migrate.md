# Skill: Database Migration

## Overview
Run database schema migrations using Drizzle ORM migration system.

## When to Use
- After creating new migration files
- Setting up database for first time
- Pulling changes that include new migrations
- Updating database schema
- Deploying to new environment

## Command

```powershell
# Run database migrations
pnpm run db:migrate
```

## Alternative Commands

### Check Migration Status

```powershell
# No built-in status command, but you can check manually
# View applied migrations in database migrations table
pnpm run db:psql
# Then: SELECT * FROM drizzle_migrations;
```

### Generate New Migration

```powershell
# Generate migration from schema changes
# (This is done in lib/db-client directory)
cd lib/db-client
pnpm run db:generate

# Or use drizzle-kit directly
pnpm exec drizzle-kit generate:pg
```

### Test Database Connection First

```powershell
# Verify database connection before migrating
pnpm run db:test

# Or test with CLI
pnpm run cli:test-connection
```

### Production Migrations (Use Carefully)

```powershell
# Migrate production database (requires production credentials)
pnpm run db:migrate:production
```

## Expected Output
- **Success**: "Migrations applied successfully" message
- **Up-to-date**: "No pending migrations" if already current
- **Console**: List of applied migrations

## Common Issues

### Issue: Database connection failed
**Symptom**: Cannot connect to database
**Solution**: Sync environment variables first
```powershell
# Sync database credentials
pnpm run sync-env

# Test connection
pnpm run db:test

# Then run migrations
pnpm run db:migrate
```

### Issue: Migration failed mid-execution
**Symptom**: Some migrations applied, some failed
**Solution**: Check database state and fix schema issues
```powershell
# Connect to database
pnpm run db:psql

# Check migrations table
SELECT * FROM drizzle_migrations ORDER BY created_at DESC;

# If needed, manually rollback or fix issues
# Then re-run migrations
pnpm run db:migrate
```

### Issue: Migration file syntax errors
**Symptom**: SQL syntax errors in migration
**Solution**: Fix migration file SQL syntax
```powershell
# Migration files are in: lib/db-client/drizzle/
# Edit the .sql file to fix syntax
# Then re-run migrations
```

### Issue: Wrong database targeted
**Symptom**: Migrations run on wrong environment
**Solution**: Verify environment variables
```powershell
# Check which database you're connected to
pnpm run db:url

# Should show development database URL
# If production, STOP and fix environment
```

### Issue: Permission errors
**Symptom**: Insufficient privileges to create tables
**Solution**: Ensure database user has proper permissions
```powershell
# Check database credentials
pnpm run db:credentials

# Contact DevOps if user lacks permissions
```

## Best Practices
1. **Sync environment first** - Always run `pnpm run sync-env` before migrations
2. **Test connection** - Verify database connectivity before migrating
3. **Backup first** (production) - Backup production database before migrations
4. **Review migrations** - Check migration SQL before running
5. **Run locally first** - Test migrations on development before production

## Migration Workflow

### Creating New Migration
```powershell
# 1. Modify Drizzle schema files
# Edit files in lib/db-client/src/lib/schema/

# 2. Generate migration
cd lib/db-client
pnpm run db:generate

# 3. Review generated migration
# Check lib/db-client/drizzle/XXXX_migration_name.sql

# 4. Apply migration locally
cd ../..
pnpm run db:migrate

# 5. Test the changes
pnpm run cli:inspect-database

# 6. Commit migration files
git add lib/db-client/drizzle/
git commit -m "feat(db): add new table for feature"
```

### Applying Migrations After Pull
```powershell
# 1. Pull latest changes
git pull

# 2. Sync environment (if needed)
pnpm run sync-env

# 3. Run migrations
pnpm run db:migrate

# 4. Verify schema
pnpm run cli:inspect-database
```

### Production Deployment
```powershell
# 1. Backup production database
# (Use AWS RDS snapshot or pg_dump)

# 2. Set production environment
# (Update .env.local or use production credentials)

# 3. Test connection
pnpm run db:test:production

# 4. Run migrations
pnpm run db:migrate:production

# 5. Verify migration success
pnpm run db:credentials:production
pnpm run db:psql:production
# Check tables exist
```

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
lib/db-client/drizzle/
├── 0000_initial_schema.sql
├── 0001_add_users_table.sql
├── 0002_add_leagues_table.sql
└── meta/
    └── _journal.json
```

## Drizzle Schema Location

```
lib/db-client/src/lib/schema/
├── users.ts
├── leagues.ts
├── teams.ts
├── players.ts
└── ...
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
