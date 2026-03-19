---
name: db-migration-write
description: 'Create and apply database migrations using Drizzle. Use when adding, modifying, or dropping tables or columns; covers migration file creation, schema model updates, and rollback.'
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

| Rule                | Correct                                       | Wrong                                      |
| ------------------- | --------------------------------------------- | ------------------------------------------ |
| **Directory**       | `lib/db-client/migrations/`                   | `lib/db-client/src/drizzle/migrations/`    |
| **Filename**        | `YYYYMMDD_HHMMSS_name.ts`                     | `0051_name.ts`                             |
| **Exports**         | Named `export const up` / `export const down` | `export default { up, down }`              |
| **Signature**       | `up({ db }: { db: PgDatabase<any> })`         | `up(db: NodePgDatabase)`                   |
| **SQL calls**       | `db.execute(\`...\`)` (plain string)          | `db.execute(sql\`...\`)` (tagged template) |
| **Apply before PR** | Run `pnpm run db:up` before opening PR        | Commit migration file without applying it  |

**Why**: The runner regex is `^(\d{8}_\d{6})_(.+)\.ts$` and calls `migrationModule.up({ db, sql })`.

> 🛑 **Never push a branch to origin with pending (unapplied) migrations.**
> A pending migration in a PR leaves every developer who pulls the branch with a broken
> local DB until they manually run `db:up`. Always confirm `Applied N new migrations` before
> opening a PR. See [Step 6b in the worktree-workflow skill](../worktree-workflow/SKILL.md).

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

See **[Migration Patterns & Operations](references/migration-patterns-and-operations.md)** for code examples of:

- Create table (with required timestamps + trigger)
- Add enum value
- Add column
- Add index
- Create SQL function
- Best practices, common issues, and running migrations

### 4. Run and Verify Migration Locally (Required Before Commit)

**Always run the migration against your local Docker database before committing.**
A migration that fails to apply is a broken commit — catch it here first.

```powershell
# Check current status (confirms new migration is pending)
pnpm --prefix lib/db-client run db:status

# Apply pending migrations
pnpm --prefix lib/db-client run db:up

# Verify the schema changes landed correctly
pnpm --prefix lib/db-client run db:psql
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

## Related Skills

- [MCP Database Operations](../mcp-db/SKILL.md)
- [GraphQL Codegen](../codegen/SKILL.md)
