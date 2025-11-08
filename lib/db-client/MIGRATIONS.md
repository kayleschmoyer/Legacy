# Database Migration System

## Overview

This project uses a TypeScript-based rollback migration system with full up/down migration capabilities. All database changes **MUST** go through migrations - no direct SQL execution against the database.

## Key Principles

✅ **DO:**

- Auto-generate migrations from schema changes using `pnpm run db:generate`
- Write TypeScript migrations with `up()` and `down()` functions
- Test rollbacks locally before deploying
- Use migration status checks before deploying

❌ **DON'T:**

- Execute SQL directly against the database
- Modify the database schema without a migration
- Skip migration testing
- Edit already-applied migrations

## Migration Workflow

### 1. Making Schema Changes

```typescript
// lib/db-client/src/drizzle/public/models/your-table.ts
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const yourTable = pgTable('your_table', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  // Add your new column here
  email: varchar('email', { length: 255 }),
});
```

### 2. Generate Migration

```powershell
# Auto-generate migration from schema changes
cd lib/db-client
pnpm run db:generate --name your_migration_name

# This creates: migrations/YYYYMMDD_HHMMSS_your_migration_name.ts
```

**Important:** `db:generate` uses the `@drepkovsky/drizzle-migrations` package which compares your schema code to the current database state and generates TypeScript migrations with `up()` and `down()` functions.

### 3. Review Generated Migration

```typescript
// migrations/20251108_120000_your_migration_name.ts
import type { PgDatabase } from 'drizzle-orm/pg-core';

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`ALTER TABLE "your_table" ADD COLUMN "email" varchar(255);`);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`ALTER TABLE "your_table" DROP COLUMN "email";`);
};
```

### 4. Test Migration Locally

```powershell
# Check current status
pnpm run db:status

# Apply migration
pnpm run db:up

# Test rollback (optional but recommended)
pnpm run db:down

# Re-apply after testing rollback
pnpm run db:up
```

### 5. Commit and Deploy

```powershell
git add lib/db-client/migrations/20251108_120000_your_migration_name.ts
git commit -m "feat(db): add email column to your_table"
git push
```

## Migration Commands

### Status Check

```powershell
pnpm run db:status
```

Shows:

- Total migrations available
- Applied migrations
- Pending migrations

### Apply Migrations (Up)

```powershell
pnpm run db:up
```

Applies all pending migrations in order.

### Rollback Last Migration (Down)

```powershell
pnpm run db:down
```

Rolls back the most recently applied migration.

### Fresh (Drop All & Reapply)

```powershell
pnpm run db:fresh
```

**WARNING:** Destroys all data!

1. Drops entire public and app_internal schemas
2. Recreates schemas
3. Applies all migrations from scratch

Use for: Local development resets, test environments

### Refresh (Rollback All & Reapply)

```powershell
pnpm run db:refresh
```

**WARNING:** Destroys all data!

1. Rolls back all migrations
2. Reapplies all migrations

Use for: Testing full migration sequence

## How Drizzle Generates Migrations

The `pnpm run db:generate` command uses `@drepkovsky/drizzle-migrations` to:

1. **Introspect Current Database**: Connects to your DB and reads the actual schema
2. **Compare with Code**: Compares database state to your TypeScript schema definitions
3. **Generate TypeScript Migration**: Creates `up()` and `down()` functions with the SQL changes needed
4. **Track in Journal**: Updates `migrations/meta/_journal.json` to track the migration

### Example Flow

```
Your Schema Code          Current Database          Generated Migration
================         =================         ====================
leagues table            leagues table
- id: serial             - id: serial              NO CHANGES
- name: varchar          - name: varchar
- owner: integer         - owner: integer
- invite_code: varchar   (missing)                 up: ADD COLUMN invite_code
                                                   down: DROP COLUMN invite_code
```

## Migration File Format

### Naming Convention

```
YYYYMMDD_HHMMSS_description.ts
```

Example: `20251108_120000_add_invite_code_to_leagues.ts`

### TypeScript Structure

```typescript
import type { PgDatabase } from 'drizzle-orm/pg-core';

// Required: Upgrade logic
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Your forward migration logic
  await db.execute(
    `ALTER TABLE "leagues" ADD COLUMN "invite_code" varchar(8);`,
  );
};

// Required: Rollback logic
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Your rollback logic
  await db.execute(`ALTER TABLE "leagues" DROP COLUMN "invite_code";`);
};
```

## Migration Tracking

Migrations are tracked in `drizzle.__drizzle_migrations` table:

```sql
CREATE TABLE drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash VARCHAR(255) NOT NULL UNIQUE,  -- Migration filename
  created_at BIGINT NOT NULL           -- Timestamp when applied
);
```

## Best Practices

### 1. Always Generate Migrations

```powershell
# ✅ CORRECT: Auto-generate from schema
pnpm run db:generate --name add_user_email

# ❌ WRONG: Manually write SQL and execute
psql -c "ALTER TABLE users ADD COLUMN email VARCHAR(255);"
```

### 2. Test Rollbacks Locally

```powershell
# Apply migration
pnpm run db:up

# Test it works
npm start

# Test rollback works
pnpm run db:down

# Verify rollback worked
npm start

# Re-apply before committing
pnpm run db:up
```

### 3. Write Reversible Migrations

```typescript
// ✅ GOOD: Reversible
export const up = async ({ db }) => {
  await db.execute(`ALTER TABLE users ADD COLUMN email VARCHAR(255);`);
};

export const down = async ({ db }) => {
  await db.execute(`ALTER TABLE users DROP COLUMN email;`);
};

// ❌ BAD: Not reversible
export const up = async ({ db }) => {
  await db.execute(`DROP TABLE old_users;`);
};

export const down = async ({ db }) => {
  // Can't recreate dropped table without backup!
};
```

### 4. Handle Data Migrations Safely

```typescript
// ✅ GOOD: Preserve data
export const up = async ({ db }) => {
  // 1. Add new column as nullable
  await db.execute(`ALTER TABLE users ADD COLUMN full_name VARCHAR(255);`);

  // 2. Populate from existing data
  await db.execute(
    `UPDATE users SET full_name = first_name || ' ' || last_name;`,
  );

  // 3. Make NOT NULL after populated
  await db.execute(`ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;`);
};

export const down = async ({ db }) => {
  await db.execute(`ALTER TABLE users DROP COLUMN full_name;`);
};
```

### 5. Use Transactions for Complex Migrations

```typescript
export const up = async ({ db }) => {
  await db.transaction(async (tx) => {
    await tx.execute(`ALTER TABLE users ADD COLUMN email VARCHAR(255);`);
    await tx.execute(`CREATE INDEX users_email_idx ON users(email);`);
    await tx.execute(`UPDATE users SET email = username || '@example.com';`);
  });
};
```

## Troubleshooting

### "No schema changes detected"

This means drizzle-migrations compared your schema code to the database and found no differences.

**Solution:** Check that your schema changes are:

1. In the correct schema definition files
2. Exported properly
3. Saved before running `db:generate`

### "Migration already applied"

The migration filename exists in the tracking table.

**Solution:**

```powershell
# Check status
pnpm run db:status

# If needed, manually remove tracking entry
pnpm run db:query "DELETE FROM drizzle.__drizzle_migrations WHERE hash = 'your_migration.ts';"
```

### "Migration failed halfway"

**Solution:**

```powershell
# Check what was applied
pnpm run db:status

# Manually rollback partial changes if needed
psql -d your_db -f fix_script.sql

# Remove tracking entry
pnpm run db:query "DELETE FROM drizzle.__drizzle_migrations WHERE hash = 'failed_migration.ts';"

# Fix migration file
# Re-run
pnpm run db:up
```

### Views or Dependent Objects

If migrations fail due to view dependencies:

```typescript
// Drop dependent views first
export const up = async ({ db }) => {
  await db.execute(`DROP VIEW IF EXISTS career_batting CASCADE;`);
  await db.execute(
    `ALTER TABLE players ADD COLUMN stats_updated_at TIMESTAMP;`,
  );
  await db.execute(`CREATE VIEW career_batting AS ...`); // Recreate
};
```

## CI/CD Integration

### Pre-Deploy Check

```yaml
# .github/workflows/deploy.yml
- name: Check Migration Status
  run: |
    cd lib/db-client
    pnpm run db:status
```

### Deploy Migrations

```yaml
- name: Run Migrations
  run: |
    cd lib/db-client
    pnpm run db:up
```

### Rollback on Failure

```yaml
- name: Rollback on Failure
  if: failure()
  run: |
    cd lib/db-client
    pnpm run db:down
```

## Current State

### Initial Schema

- **Migration**: `20251108_000000_initial_schema.ts`
- **Status**: ✅ Applied
- **Contains**:
  - 23 tables (draft_teams, drafts, leagues, teams, matchups, players, stats, scoring)
  - 11 enums (access_level, draft_order, draft_status, etc.)
  - Multiple indexes for performance
  - Foreign key constraints
  - 9 aggregate views (career_batting, career_pitching, etc.)

### Schema Organization

```
lib/db-client/src/drizzle/
├── public/
│   ├── schema.ts          # Main public schema export
│   └── models/
│       ├── drafts.ts      # Draft-related tables
│       ├── leagues.ts     # League and team tables
│       ├── matchups.ts    # Matchup tables
│       ├── players.ts     # Player tables
│       ├── stats.ts       # Game and season stats
│       └── scoring.ts     # Scoring system tables
└── internal/
    └── schema.ts          # Internal schema (users table)
```

## Next Migration Example

When you need to add a new feature:

```powershell
# 1. Edit schema file
# lib/db-client/src/drizzle/public/models/leagues.ts
# Add new column to leagues table

# 2. Generate migration
pnpm run db:generate --name add_league_settings

# 3. Review generated migration
# migrations/20251108_130000_add_league_settings.ts

# 4. Test locally
pnpm run db:up
pnpm run db:down  # Test rollback
pnpm run db:up    # Re-apply

# 5. Commit
git add lib/db-client/migrations/20251108_130000_add_league_settings.ts
git commit -m "feat(db): add league settings column"
```

## Summary

✅ **All database changes go through migrations**  
✅ **Auto-generate migrations from schema code**  
✅ **Every migration has up() and down() functions**  
✅ **Test rollbacks before deploying**  
✅ **Track migrations in database**

This ensures:

- **Reproducible** database state
- **Reversible** changes
- **Version controlled** schema evolution
- **Team coordination** on schema changes
- **CI/CD integration** for automated deployments
