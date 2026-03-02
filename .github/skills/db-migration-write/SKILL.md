---
name: db-migration-write
description: 'Create a new database migration file to track schema changes in version control using Drizzle; use when adding, modifying, or dropping database tables or columns.'
---

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

## 🚨 Critical Rules

The migration runner (`rollback-migrations.ts`) enforces strict conventions.
Violating any of these will cause the migration to be **silently skipped**.

| Rule          | Correct                                       | Wrong                                      |
| ------------- | --------------------------------------------- | ------------------------------------------ |
| **Directory** | `lib/db-client/migrations/`                   | `lib/db-client/src/drizzle/migrations/`    |
| **Filename**  | `YYYYMMDD_HHMMSS_name.ts`                     | `0051_name.ts`                             |
| **Exports**   | Named `export const up` / `export const down` | `export default { up, down }`              |
| **Signature** | `up({ db }: { db: PgDatabase<any> })`         | `up(db: NodePgDatabase)`                   |
| **SQL calls** | `db.execute(\`...\`)` (plain string)          | `db.execute(sql\`...\`)` (tagged template) |

**Why**: The runner regex is `^(\d{8}_\d{6})_(.+)\.ts$` and calls `migrationModule.up({ db, sql })`.

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

**⚠️ IMPORTANT: Always Add Timestamps to New Tables**

All new tables MUST include `created_at` and `updated_at` columns with automatic triggers:

```typescript
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the table with timestamps
  await db.execute(`
    CREATE TABLE my_new_table (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      -- Always include these timestamps:
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  // 2. Create trigger to auto-update updated_at
  await db.execute(`
    CREATE TRIGGER my_new_table_updated_at_trigger
    BEFORE UPDATE ON public.my_new_table
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TRIGGER IF EXISTS my_new_table_updated_at_trigger ON public.my_new_table;
    DROP TABLE IF EXISTS my_new_table;
  `);
};
```

**Why?** The `update_updated_at_column()` function exists database-wide and automatically updates `updated_at` on any row modification. See [automatic-timestamps.md](../../docs/database/automatic-timestamps.md) for details.

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

**Create Table** (see "Always Add Timestamps" section above for full example with triggers)

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

**Create SQL Function** (e.g. for DB-level scoring, search, or computed columns):

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Use $fn$ as the function body delimiter to avoid escaping issues
  await db.execute(`
    CREATE OR REPLACE FUNCTION public.my_function(p_arg INTEGER DEFAULT NULL)
    RETURNS TABLE (
        col1 INTEGER,
        col2 NUMERIC
    )
    LANGUAGE sql STABLE
    AS $fn$
      SELECT id, value FROM my_table WHERE arg = p_arg;
    $fn$;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP FUNCTION IF EXISTS public.my_function(INTEGER);
  `);
};
```

> **Note**: Use `db.execute(\`...\`)`with a plain template string, NOT`db.execute(sql\`...\`)`.
The tagged `sql`template from Drizzle wraps the statement, which can cause issues with
complex function bodies using`$fn$` delimiters.

### 4. Run and Verify Migration Locally 🚨 Required Before Commit

**Always run the migration against your local Docker database before committing.**
A migration that fails to apply is a broken commit — catch it here first.

```powershell
# From the repo root or lib/db-client directory
cd lib/db-client

# Check current status (confirms new migration is pending)
pnpm run db:status

# Apply pending migrations
pnpm run db:up

# Verify the schema changes landed correctly
pnpm run db:psql
# Inside psql: \d table_name
# Or for enum: SELECT enumlabel FROM pg_enum WHERE enumtypid = 'enum_name'::regtype;
```

If `db:up` throws an error, **fix the migration SQL before proceeding**. Do not commit a broken migration.

### 5. Update Schema Models

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

### 6. Update GraphQL Schema (if applicable)

**Location**: `lambdas/db/src/schema/`

Update enum definitions and TypeScript types:

**⚠️ For New Tables: Always include timestamp columns in schema definition:**

```typescript
export const myNewTable = pgTable('my_new_table', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  // ALWAYS include these:
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

```typescript
const StatsLoadingStatus = builder.enumType('StatsLoadingStatus', {
  values: ['not_started', 'queued', 'loading', 'completed', 'failed'] as const,
});
```

## Migration Best Practices

### Do's

✅ Use `IF NOT EXISTS` / `IF EXISTS` for idempotent operations
✅ Add detailed comments explaining purpose
✅ **Run `pnpm run db:up` locally and confirm it succeeds before committing**
✅ Verify schema changes with `pnpm run db:psql` after applying
✅ Provide rollback (`down`) when possible
✅ Use transactions implicitly (each migration runs in transaction)
✅ Include data migrations with schema changes

### Don'ts

❌ Don't commit a migration without first successfully running it locally
❌ Don't run migrations directly in production without testing
❌ Don't delete data without backup strategy
❌ Don't modify applied migrations (create new one instead)
❌ Don't make breaking changes without coordination
❌ Don't forget to update corresponding ORM models

## Testing Migration Locally

See **Step 4** above — running the migration locally is a required part of the authoring workflow, not an optional follow-up.

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
