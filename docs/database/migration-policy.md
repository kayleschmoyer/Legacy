# Database Migration Policy

## 🎯 Core Principle

**ALL schema changes MUST be tracked through migrations. No schema changes via scripts.**

## ✅ Allowed: Data Operations via Scripts

Scripts in `scripts/` directory are **ONLY** for:

### 1. Data Queries (Read-Only)

- ✅ `SELECT` statements
- ✅ Data analysis
- ✅ Reporting
- ✅ Example: `check-position-availability.sql`

### 2. Data Manipulation (When Appropriate)

- ✅ `INSERT` - Adding data
- ✅ `UPDATE` - Modifying existing data
- ✅ `DELETE` - Removing data
- ⚠️ **Only for operational tasks, NOT schema changes**

### 3. Development/Testing Utilities

- ✅ `cli delete-league` command - Admin cleanup operations
- ✅ `db-query.ps1` - Query wrapper for operations
- ✅ One-time data fixes or imports

## ❌ Forbidden: Schema Changes via Scripts

Scripts must **NEVER** contain:

### Schema Modifications

```sql
❌ ALTER TABLE ... ADD COLUMN
❌ ALTER TABLE ... DROP COLUMN
❌ ALTER TABLE ... ALTER COLUMN
❌ CREATE TABLE
❌ DROP TABLE
❌ CREATE INDEX
❌ DROP INDEX
❌ ALTER TYPE
❌ CREATE TYPE
❌ DROP TYPE
❌ CREATE CONSTRAINT
❌ DROP CONSTRAINT
❌ CREATE VIEW (unless for analytics)
❌ ALTER VIEW
❌ CREATE FUNCTION
❌ CREATE TRIGGER
```

### Database Role/Permission Changes

```sql
❌ CREATE ROLE
❌ GRANT
❌ REVOKE
❌ ALTER ROLE
```

## 📋 Migration Workflow

### Creating a Migration

1. **Make schema changes** in Drizzle schema files:
   - `lib/db-client/src/drizzle/public/schema.ts` (for public schema)
   - `lib/db-client/src/drizzle/internal/schema.ts` (for app_internal schema)

2. **Generate migration**:

   ```bash
   cd lib/db-client
   pnpm run db:generate
   ```

3. **Review generated migration** in `lib/db-client/migrations/`

4. **Test migration locally**:

   ```bash
   pnpm run db:up
   ```

5. **Verify changes**:

   ```bash
   pnpm run db:status
   ```

6. **Commit migration** with schema changes in same PR

### Migration File Naming Convention

```
YYYYMMDD_HHMMSS_description.ts
```

Example:

```
20260131_210000_add_queued_status_to_stats_loading.ts
```

### Migration File Structure

```typescript
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export async function up(db: PostgresJsDatabase<any>): Promise<void> {
  // Forward migration
  await db.execute(sql`
    ALTER TYPE stats_loading_status 
    ADD VALUE IF NOT EXISTS 'queued' BEFORE 'loading'
  `);
}

export async function down(db: PostgresJsDatabase<any>): Promise<void> {
  // Rollback migration
  // Note: Cannot remove enum values in PostgreSQL
  console.log('⚠️  Cannot remove enum value in PostgreSQL');
}
```

## 🔄 Migration Lifecycle

### Running Migrations

```bash
# Apply next migration
pnpm run db:up

# Apply all pending migrations
pnpm run db:migrate

# Check migration status
pnpm run db:status
```

### Rolling Back Migrations

```bash
# Rollback last migration
pnpm run db:down

# Rollback all migrations
pnpm run db:fresh

# Rollback and reapply all
pnpm run db:refresh
```

## 📂 File Organization

### ✅ Correct Structure

```
lib/db-client/
├── migrations/              # ALL schema changes here
│   ├── 20260131_210000_add_queued_status.ts
│   ├── 20260130_150000_add_indexes.ts
│   └── ...
├── src/
│   ├── drizzle/
│   │   ├── public/schema.ts      # Schema definitions
│   │   └── internal/schema.ts    # Internal schema
│   └── scripts/
│       ├── rollback-migrations.ts  # Migration runner
│       └── delete-league.ts        # Data operations only
└── drizzle.config.ts

scripts/
├── check-position-availability.sql  # ✅ Read-only query
├── db-query.ps1                     # ✅ Query wrapper
└── [NO SCHEMA CHANGES]              # ❌ Never schema here

# Destructive league deletion now lives in the CLI:
#   apps/cli/src/commands/deleteLeague.ts  → `cli delete-league --id <id> --yes`
```

## 🛡️ Enforcement

### Code Review Checklist

When reviewing PRs, verify:

- [ ] No `ALTER TABLE`, `CREATE TABLE`, etc. in `scripts/`
- [ ] Schema changes are in `lib/db-client/migrations/`
- [ ] Migration files follow naming convention
- [ ] Migration has both `up` and `down` functions
- [ ] Migration tested locally
- [ ] Schema files updated to match migration

### CI/CD Validation

The CI pipeline should:

1. Run migrations in test environment
2. Verify schema matches expected state
3. Test rollback capability
4. Block PRs with schema changes outside migrations

## 🚨 Exception Process

If you need to make a schema change via script (emergency hotfix):

1. **Get approval** from database team lead
2. **Document reason** in script comments
3. **Create matching migration** immediately after
4. **Mark script as temporary** with deletion date
5. **Update this document** with the exception

## 📖 Related Documentation

- [Drizzle Rollback Migrations](./drizzle-rollback-migrations.md)
- [Database Role Separation](../guides/database-role-separation.md)
- [DB Client README](../../lib/db-client/README.md)

## ✨ Benefits

### Why Migrations?

1. **Version Control**: Track all schema changes in git
2. **Reproducibility**: Consistent schema across environments
3. **Rollback**: Safe rollback when issues occur
4. **Documentation**: Migration files document schema evolution
5. **Testing**: Test schema changes before production
6. **Collaboration**: Team knows what changes are happening

### Why Not Scripts?

1. **No tracking**: Scripts don't record what was applied
2. **No rollback**: Can't undo schema changes easily
3. **Drift**: Different environments get out of sync
4. **Risk**: Accidents happen more easily
5. **No review**: Harder to review ad-hoc schema changes

## 📝 Examples

### ✅ Good: Query Script

```sql
-- scripts/check-active-leagues.sql
SELECT id, name, season
FROM leagues
WHERE status = 'active';
```

### ✅ Good: Data Operation Script

```typescript
// scripts/archive-old-leagues.ts
await db.execute(sql`
  UPDATE leagues 
  SET status = 'archived' 
  WHERE season < 2024
`);
```

### ✅ Good: Migration

```typescript
// lib/db-client/migrations/20260201_120000_add_league_status.ts
export async function up(db: PostgresJsDatabase<any>): Promise<void> {
  await db.execute(sql`
    ALTER TABLE leagues 
    ADD COLUMN status VARCHAR(20) DEFAULT 'active'
  `);
}
```

### ❌ Bad: Schema Change in Script

```typescript
// scripts/add-league-status.ts  ❌ WRONG!
await db.execute(sql`
  ALTER TABLE leagues 
  ADD COLUMN status VARCHAR(20) DEFAULT 'active'
`);
```

## 🔍 Audit

Current state (as of Feb 1, 2026):

### ✅ Compliant

- All schema changes in `lib/db-client/migrations/`
- `check-position-availability.sql` - Read-only query ✅
- `cli delete-league` command - Data operations only ✅
- `db-query.ps1` - Query wrapper ✅

### 🧹 Recently Cleaned Up

- ❌ Removed: `add-queued-status.sql` (was schema change)
- ❌ Removed: `add-queued-status.ts` (was schema change)
- ✅ Proper migration created: `20260131_210000_add_queued_status_to_stats_loading.ts`

## 📞 Questions?

Contact the database team or refer to:

- [DB Client Documentation](../../lib/db-client/README.md)
- [Migration Examples](../../lib/db-client/migrations/)
