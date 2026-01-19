# Database Role Separation and Schema Protection

## Overview

The Legacy Sports database implements **role-based access control** to prevent unauthorized schema modifications. This ensures that schema changes can only be made through controlled migrations.

## Database Roles

### 1. `app_user` (Runtime Application Access)

- **Purpose**: Used by the application at runtime
- **Permissions**:
  - ✅ SELECT, INSERT, UPDATE, DELETE on all tables
  - ✅ USAGE on sequences (for auto-increment IDs)
  - ❌ **Cannot** CREATE, ALTER, or DROP tables/constraints
  - ❌ **Cannot** modify database schema
- **Used by**: GraphQL API, Lambda functions, application code

### 2. `migration_user` (Schema Modifications)

- **Purpose**: Used exclusively for running database migrations
- **Permissions**:
  - ✅ Full schema modification access (CREATE, ALTER, DROP)
  - ✅ All data access (SELECT, INSERT, UPDATE, DELETE)
- **Used by**: Migration scripts only (`pnpm run db:migrate`)

## Configuration

### Environment Variables

Add these to your `.env` file and AWS Secrets Manager:

```bash
# Runtime application credentials (limited permissions)
DB_USER=app_user
DB_PASSWORD=<secure_app_user_password>

# Migration credentials (full schema access)
DB_MIGRATION_USER=migration_user
DB_MIGRATION_PASSWORD=<secure_migration_user_password>
```

### AWS Secrets Manager

Update your AWS secret (`legacy-sports-dev-db-creds-*`) with:

```json
{
  "user": "app_user",
  "password": "<secure_app_user_password>",
  "host": "your-rds-instance.rds.amazonaws.com",
  "database": "postgres"
}
```

Create a separate secret for migrations (e.g., `legacy-sports-dev-migration-creds`):

```json
{
  "user": "migration_user",
  "password": "<secure_migration_user_password>",
  "host": "your-rds-instance.rds.amazonaws.com",
  "database": "postgres"
}
```

## What This Prevents

### ❌ Direct Schema Changes (Now Blocked)

```typescript
// This will now FAIL with app_user credentials:
await db.execute(`
  ALTER TABLE matchups 
  DROP CONSTRAINT matchups_league_id_week_number_unique
`);
// Error: permission denied for table matchups
```

### ✅ Data Operations (Still Allowed)

```typescript
// These continue to work with app_user:
await db.insert(matchups).values({ ... });
await db.update(matchups).set({ ... });
await db.delete(matchups).where({ ... });
await db.select().from(matchups);
```

### ✅ Schema Changes via Migrations (Proper Method)

```typescript
// Create a migration file:
// lib/db-client/migrations/YYYYMMDD_HHMMSS_description.ts

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE matchups 
    DROP CONSTRAINT IF EXISTS matchups_league_id_week_number_unique
  `);
};
```

Then run: `pnpm run db:migrate` (uses migration_user credentials)

## How It Works

1. **Application Runtime**:
   - Uses `app_user` credentials from environment/secrets
   - Has data access only (CRUD operations)
   - Cannot modify schema (ALTER, DROP, CREATE TABLE)

2. **Migration Execution**:
   - Uses `migration_user` credentials
   - `getMigrationDatabaseConfig()` automatically switches to migration user
   - Has full schema modification privileges

3. **Protection**:
   - `REVOKE CREATE ON SCHEMA public FROM PUBLIC` prevents arbitrary schema changes
   - Only `migration_user` can execute DDL statements
   - All schema changes must go through version-controlled migrations

## Migration Workflow

### Correct Workflow (✅)

1. Create migration file:

   ```bash
   # Migration: 20251112_120000_fix_matchup_constraint.ts
   ```

2. Implement `up()` and `down()` functions:

   ```typescript
   export const up = async ({ db }) => {
     await db.execute(`ALTER TABLE ...`);
   };
   ```

3. Run migration:

   ```bash
   pnpm run db:migrate
   ```

4. Commit migration file to git
5. CI/CD automatically applies in other environments

### Incorrect Workflow (❌)

```typescript
// Don't do this anymore!
const pool = new Pool({ ... });
await pool.query('ALTER TABLE ...');  // Will fail with app_user
```

## Benefits

✅ **Prevents Accidental Schema Changes**

- No more direct ALTER/DROP commands in application code
- Forces all changes through controlled migrations

✅ **Audit Trail**

- All schema changes tracked in version control
- Clear history of what changed and when

✅ **Rollback Safety**

- Each migration has a `down()` function for rollback
- Can revert changes if needed

✅ **Environment Consistency**

- Same migrations run in dev, staging, production
- No schema drift between environments

✅ **Security**

- Principle of least privilege
- Application has only the permissions it needs
- Reduces attack surface

## Troubleshooting

### Error: "permission denied for table X"

**Cause**: Application code trying to modify schema with `app_user` credentials.

**Solution**: Create a migration instead of direct schema modification.

### Migration Fails: "permission denied"

**Cause**: `DB_MIGRATION_USER` not configured or incorrect.

**Solution**:

1. Verify `.env` has `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD`
2. Ensure migration user exists in database
3. Run the role separation migration: `20251112_110000_implement_database_role_separation.ts`

### Need to Grant Permissions to New Tables

**Solution**: Already handled! Default privileges are set:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

Any new tables automatically get proper permissions.

## CI/CD Integration

Update your CI/CD pipelines to use migration credentials:

```yaml
# Example GitHub Actions
- name: Run Migrations
  env:
    DB_MIGRATION_USER: ${{ secrets.DB_MIGRATION_USER }}
    DB_MIGRATION_PASSWORD: ${{ secrets.DB_MIGRATION_PASSWORD }}
  run: pnpm run db:migrate
```

## For AI Agents 🤖

**IMPORTANT**: You can no longer run direct schema modification commands like:

```typescript
await pool.query('ALTER TABLE ...');
await pool.query('DROP CONSTRAINT ...');
await pool.query('CREATE INDEX ...');
```

Instead, you must:

1. Create a migration file in `lib/db-client/migrations/`
2. Implement the schema change in the migration's `up()` function
3. Implement the rollback in the migration's `down()` function
4. Tell the user to run `pnpm run db:migrate`

**Never bypass the migration system for schema changes.**

## Migration File Template

```typescript
import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Brief description of what this changes
 *
 * Detailed explanation of why this change is needed.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Applying migration: description');

  // Your schema changes here
  await db.execute(`
    ALTER TABLE your_table
    ADD COLUMN new_column VARCHAR(255);
  `);

  console.log('✅ Migration applied successfully');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('⏮️  Rolling back migration: description');

  // Reverse your changes here
  await db.execute(`
    ALTER TABLE your_table
    DROP COLUMN new_column;
  `);

  console.log('✅ Migration rolled back successfully');
};
```

## Summary

- **App User**: Data access only (SELECT, INSERT, UPDATE, DELETE)
- **Migration User**: Schema modification privileges
- **All schema changes**: Must go through migrations
- **Protection**: Prevents accidental direct schema modifications
- **Benefit**: Better security, audit trail, environment consistency
