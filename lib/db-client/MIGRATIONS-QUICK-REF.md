# Database Migration Quick Reference

## Core Principle

**All database changes MUST go through migrations. No direct SQL execution.**

## Common Commands

```powershell
# Check status
pnpm run db:status

# Generate new migration from schema changes
pnpm run db:generate --name your_migration_name

# Apply pending migrations
pnpm run db:up

# Rollback last migration
pnpm run db:down

# Drop all & recreate (⚠️ DESTROYS DATA)
pnpm run db:fresh

# Rollback all & reapply (⚠️ DESTROYS DATA)
pnpm run db:refresh
```

## Typical Workflow

```powershell
# 1. Edit schema in TypeScript
# lib/db-client/src/drizzle/public/models/*.ts

# 2. Generate migration
cd lib/db-client
pnpm run db:generate --name add_feature_x

# 3. Review the generated migration file
# migrations/YYYYMMDD_HHMMSS_add_feature_x.ts

# 4. Test it
pnpm run db:up      # Apply
pnpm run db:down    # Test rollback
pnpm run db:up      # Re-apply

# 5. Commit
git add migrations/YYYYMMDD_HHMMSS_add_feature_x.ts
git commit -m "feat(db): add feature x"
```

## Migration File Structure

```typescript
import type { PgDatabase } from 'drizzle-orm/pg-core';

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `ALTER TABLE "your_table" ADD COLUMN "new_col" varchar(255);`,
  );
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`ALTER TABLE "your_table" DROP COLUMN "new_col";`);
};
```

## Key Rules

✅ **DO:**

- Auto-generate migrations
- Test rollbacks locally
- Write reversible down() functions
- Use transactions for multi-step changes

❌ **DON'T:**

- Execute SQL directly on database
- Edit already-applied migrations
- Skip testing rollbacks
- Deploy without checking status

## Full Documentation

See [MIGRATIONS.md](./MIGRATIONS.md) for complete guide including:

- How Drizzle generates migrations
- Best practices
- Troubleshooting
- CI/CD integration
- Data migration patterns
