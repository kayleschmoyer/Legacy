# Skill: Write Database Migration

## Purpose

Create a new database migration file to track schema changes in version control.

## When to Use

- Adding new tables or columns
- Modifying existing schema (indexes, constraints, enums)
- Data transformations that need to run once
- Adding enum values (like 'queued' status)

## Prerequisites

- Understand the schema change needed
- Know the migration system location: `lib/db-client/migrations/`
- Familiar with Drizzle ORM and PostgreSQL

## Steps

### 1. Create Migration File

**Location**: `lib/db-client/migrations/`
**Naming**: `YYYYMMDD_HHMMSS_descriptive_name.ts`

Example: `20260131_210000_add_queued_status_to_stats_loading.ts`

### 2. Migration Structure

```typescript
import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: [Short description]
 *
 * Purpose:
 * - [Why this change is needed]
 * - [What problem it solves]
 *
 * Changes:
 * - [Specific schema change 1]
 * - [Specific schema change 2]
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Apply schema changes
  await db.execute(`
    -- SQL commands here
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Rollback schema changes (if possible)
  await db.execute(`
    -- Reverse SQL commands here
  `);
};
```

### 3. Common Migration Patterns

**Add Enum Value**:

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE enum_name ADD VALUE IF NOT EXISTS 'new_value' BEFORE 'existing_value';
  `);
};

// Note: Cannot remove enum values easily - requires recreating enum
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  throw new Error(
    'Cannot rollback enum value addition without recreating enum',
  );
};
```

**Add Column**:

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE table_name
    ADD COLUMN column_name column_type NOT NULL DEFAULT 'default_value';
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE table_name
    DROP COLUMN column_name;
  `);
};
```

**Create Table**:

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE table_name (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS table_name;
  `);
};
```

**Add Index**:

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX idx_table_column ON table_name(column_name);
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS idx_table_column;
  `);
};
```

### 4. Update Schema Models

After creating migration, update the corresponding Drizzle schema model:

**Location**: `lib/db-client/src/drizzle/public/models/`

Example for enum update:

```typescript
export const statsLoadingStatus = pgEnum('stats_loading_status', [
  'not_started',
  'queued', // NEW
  'loading',
  'completed',
  'failed',
]);
```

### 5. Update GraphQL Schema (if applicable)

**Location**: `lambdas/db/src/schema/`

Update enum definitions and TypeScript types:

```typescript
const StatsLoadingStatus = builder.enumType('StatsLoadingStatus', {
  values: ['not_started', 'queued', 'loading', 'completed', 'failed'] as const,
});

interface Matchup {
  statsLoadingStatus:
    | 'not_started'
    | 'queued'
    | 'loading'
    | 'completed'
    | 'failed';
}
```

## Migration Best Practices

### Do's

✅ Use `IF NOT EXISTS` / `IF EXISTS` for idempotent operations
✅ Add detailed comments explaining purpose
✅ Test migration on local database first
✅ Provide rollback (`down`) when possible
✅ Use transactions implicitly (each migration runs in transaction)
✅ Include data migrations with schema changes

### Don'ts

❌ Don't run migrations directly in production without testing
❌ Don't delete data without backup strategy
❌ Don't modify applied migrations (create new one instead)
❌ Don't make breaking changes without coordination
❌ Don't forget to update corresponding ORM models

## Testing Migration Locally

```powershell
# Check migration status
cd lib/db-client
pnpm run db:status

# Run pending migrations
pnpm run db:up

# Verify changes
pnpm run db:psql
# Then run: \d table_name to see schema
# Or: SELECT enumlabel FROM pg_enum WHERE enumtypid = 'enum_name'::regtype;
```

## Common Issues

### Issue: "Cannot find module" when testing

**Solution**: Make sure you're in `lib/db-client` directory or use full path

### Issue: "enum label already exists"

**Solution**: Migration is idempotent - uses `IF NOT EXISTS`. This is expected if run multiple times.

### Issue: "Cannot rollback enum value"

**Solution**: PostgreSQL doesn't support removing enum values. Need to recreate entire enum type.

### Issue: Migration applied but schema model not updated

**Solution**: Update Drizzle models in `lib/db-client/src/drizzle/public/models/`

## Related Skills

- [Run Database Migration](db-migrate.md)
- [Database Connection](db-connect.md)
- [GraphQL Codegen](codegen.md)

## Related Documentation

- [Database Schema](../../docs/architecture/database-schema.md)
- [Migration System](../../lib/db-client/src/scripts/rollback-migrations.ts)
- [Existing Migrations](../../lib/db-client/migrations/)
