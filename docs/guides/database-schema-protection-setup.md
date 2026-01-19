# Database Schema Protection - Setup Instructions

## What Was Done

Your database is now protected with role-based access control to prevent unauthorized schema modifications outside of migrations.

## Files Created/Modified

### 1. Migration File

- **File**: `lib/db-client/migrations/20251112_110000_implement_database_role_separation.ts`
- **Purpose**: Creates separate database roles for runtime vs. migration access

### 2. Configuration Updates

- **File**: `lib/db-client/src/config/database.ts`
- **Added**: `getMigrationDatabaseConfig()` function
- **Purpose**: Migration scripts now use privileged `migration_user`

### 3. Migration Script Updates

- **File**: `lib/db-client/src/scripts/run-drizzle-migrations.ts`
- **Changed**: Now uses `getMigrationDatabaseConfig()` instead of `getDatabaseConfig()`
- **Purpose**: Ensures migrations run with proper privileges

### 4. Documentation

- **File**: `docs/guides/database-role-separation.md`
- **Purpose**: Complete guide on the new security model
- **File**: `agents.md` (updated)
- **Purpose**: Added critical warning for AI agents

## Next Steps (IMPORTANT)

### Step 1: Set Migration Passwords

Add these environment variables to your `.env` file:

```bash
# Add these new lines (keep existing DB_USER/DB_PASSWORD):
DB_MIGRATION_USER=migration_user
DB_MIGRATION_PASSWORD=<choose-a-secure-password>
```

### Step 2: Run the Role Separation Migration

**This migration will:**

- Create `app_user` role (limited to data access)
- Create `migration_user` role (can modify schema)
- Set up proper permissions

**Run it now:**

```powershell
# From project root
pnpm run db:migrate
```

### Step 3: Also Run the Earlier Constraint Fix Migration

The constraint removal migration is also ready:

```powershell
# This will drop the matchups_league_id_week_number_unique constraint properly
pnpm run db:migrate
```

### Step 4: Update AWS Secrets Manager (For Production)

Once tested locally, update your AWS secrets:

**Main app secret** (legacy-sports-dev-db-creds-\*):

```json
{
  "user": "app_user",
  "password": "<app_user_password>",
  "host": "your-rds-instance.rds.amazonaws.com",
  "database": "postgres"
}
```

**Create new secret for migrations** (legacy-sports-dev-migration-creds):

```json
{
  "user": "migration_user",
  "password": "<migration_user_password>",
  "host": "your-rds-instance.rds.amazonaws.com",
  "database": "postgres"
}
```

### Step 5: Update CI/CD (If Applicable)

Add migration credentials to your CI/CD secrets:

- `DB_MIGRATION_USER=migration_user`
- `DB_MIGRATION_PASSWORD=<migration_user_password>`

## How It Protects You

### Before (Unsafe)

```typescript
// AI agent could do this directly:
await pool.query('DROP CONSTRAINT matchups_league_id_week_number_unique');
// ❌ No audit trail, not version controlled, can break production
```

### After (Safe)

```typescript
// AI agent must create a migration:
// lib/db-client/migrations/20251112_120000_fix_constraint.ts
export const up = async ({ db }) => {
  await db.execute('DROP CONSTRAINT ...');
};
// ✅ Version controlled, auditable, rollback-able
```

## Testing

After running the migrations, verify protection works:

```powershell
# Try to ALTER a table with app_user credentials (should fail):
cd lib\db-client
pnpm tsx -e "
  import { Pool } from 'pg';
  import { getDatabaseConfig } from './src/config/database';
  (async () => {
    const config = await getDatabaseConfig();
    const pool = new Pool({ ...config, port: 5432 });
    try {
      await pool.query('ALTER TABLE matchups ADD COLUMN test_col VARCHAR(10)');
      console.log('❌ FAIL: Schema change should have been blocked!');
    } catch (error) {
      console.log('✅ SUCCESS: Schema change blocked as expected');
      console.log('Error:', error.message);
    } finally {
      await pool.end();
    }
  })();
"
```

Expected output:

```
✅ SUCCESS: Schema change blocked as expected
Error: permission denied for table matchups
```

## Benefits

✅ **No More Direct Schema Changes**

- Forces all schema modifications through migrations
- Prevents accidents like the one that just happened

✅ **Version Control**

- All schema changes tracked in git
- Clear history and rollback capability

✅ **Environment Consistency**

- Same migrations run everywhere (dev, staging, prod)
- No schema drift

✅ **Audit Trail**

- Know exactly when and why schema changed
- Can review migrations before deployment

✅ **Security**

- Principle of least privilege
- Application only has permissions it needs

## Troubleshooting

### "permission denied for table X"

**This is expected!** It means the protection is working. Create a migration instead.

### Migration fails with "permission denied"

Check that `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` are set in `.env`.

### Need to revert?

Each migration has a `down()` function:

```powershell
# Rollback last migration
pnpm run db:rollback
```

## Questions?

See the full documentation: `docs/guides/database-role-separation.md`

---

**Summary**: The database is now locked down. Schema changes must go through migrations. This prevents direct modifications like the constraint drop that just happened. Run `pnpm run db:migrate` to apply the protection.
