# Scripts Directory

This directory contains operational and utility scripts for the Legacy Sports application.

## ⚠️ CRITICAL: Database Schema Changes

**Scripts in this directory are for DATA operations and utilities ONLY.**

### ❌ DO NOT use scripts for schema changes

Schema changes (ALTER TABLE, CREATE TABLE, CREATE INDEX, etc.) must NEVER be in scripts.

**All schema changes MUST use migrations:**

- Location: `lib/db-client/migrations/`
- Documentation: [Migration Policy](../docs/database/migration-policy.md)
- How to create: See [Drizzle Rollback Migrations](../docs/database/drizzle-rollback-migrations.md)

### ✅ Scripts ARE allowed for

1. **Data queries** (SELECT)
2. **Data operations** (INSERT, UPDATE, DELETE) - for operational tasks
3. **Build utilities** (deployment, validation)
4. **Development tools** (testing, debugging)
5. **Git/workflow automation** (branching, rebasing)

## 📂 Script Categories

### Database Operations (Data Only)

- `delete-league.ts` - Admin cleanup operations
- `db-query.ps1` - Query wrapper for ad-hoc queries
- `check-position-availability.sql` - Analytics query

### Deployment

- `deploy-lambda.ps1` - Deploy Lambda functions
- `deploy-lambda-all.ps1` - Deploy all Lambda functions
- `terraform-unlock.js` - Terraform state management

### Git & Branching

- `branch-create.ps1` - Automated branch creation with Jira integration
- `rebase-branch-tree.ps1` - Rebase dependent branches
- `squash-branch.ps1` - Squash commits interactively
- `resolve-generated-conflicts.ps1` - Auto-resolve generated file conflicts
- `skip-migration-conflict.ps1` - Skip duplicate migration commits

### Environment & Configuration

- `sync-env.ps1` - Sync AWS secrets to .env
- `run-migrations.ps1` - Migration runner wrapper

### Validation

- `check-services.js` - Verify services are running
- `check-skipped-tests.ps1` - Find skipped tests
- `validate-*.js` - Various validation scripts

### Build & Development

- `start-dev-services.js` - Start development servers
- `fix-tamagui-install.js` - Fix Tamagui installation
- `add-project-tags.js` - Nx project tagging

### CI/CD

- `simulate-ci.ps1` - Simulate CI validation locally
- `compare-ci-performance.sh` - CI performance comparison

## 🚫 What NOT to Put Here

### Schema Changes - Use Migrations Instead

```typescript
// ❌ WRONG - In scripts/add-column.ts
await db.execute(sql`ALTER TABLE users ADD COLUMN email VARCHAR(255)`);

// ✅ CORRECT - In lib/db-client/migrations/20260201_120000_add_email.ts
export async function up(db: PostgresJsDatabase<any>) {
  await db.execute(sql`ALTER TABLE users ADD COLUMN email VARCHAR(255)`);
}
```

### One-Time Fixes That Should Be Migrations

```typescript
// ❌ WRONG - In scripts/fix-enum.ts
await db.execute(sql`ALTER TYPE status_enum ADD VALUE 'pending'`);

// ✅ CORRECT - In lib/db-client/migrations/20260201_130000_add_pending_status.ts
export async function up(db: PostgresJsDatabase<any>) {
  await db.execute(sql`ALTER TYPE status_enum ADD VALUE 'pending'`);
}
```

## 📝 Script Guidelines

### Naming Convention

- Use kebab-case: `my-script.ts`
- Be descriptive: `delete-league.ts` not `cleanup.ts`
- Include extension: `.ts`, `.ps1`, `.sh`, `.js`

### File Headers

All scripts should include:

```typescript
/**
 * Script Name - Brief Description
 *
 * Purpose: What this script does
 * Usage: How to run it
 *
 * ⚠️ For schema changes, use migrations: docs/database/migration-policy.md
 */
```

### PowerShell Scripts

```powershell
#!/usr/bin/env pwsh
# Script Name - Brief Description
#
# Usage: .\script-name.ps1 -Param1 value
#
# ⚠️ For schema changes, use migrations: docs/database/migration-policy.md

param(
    [Parameter(Mandatory=$true)]
    [string]$Param1
)
```

### Environment Variables

- Use `.env` file for local development
- Use AWS Secrets Manager for production
- Use `sync-env.ps1` to sync secrets
- Never commit secrets to git

### Error Handling

```typescript
try {
  // Script operations
} catch (error) {
  LOGGER.error('Script failed:', error);
  process.exit(1);
}
```

## 🔍 Finding the Right Tool

| Task             | Tool                | Location                    |
| ---------------- | ------------------- | --------------------------- |
| Schema change    | Migration           | `lib/db-client/migrations/` |
| Query database   | `db-query.ps1`      | `scripts/db-query.ps1`      |
| Delete test data | `delete-league.ts`  | `scripts/delete-league.ts`  |
| Deploy Lambda    | `deploy-lambda.ps1` | `scripts/deploy-lambda.ps1` |
| Create branch    | `branch-create.ps1` | `scripts/branch-create.ps1` |
| Sync env vars    | `sync-env.ps1`      | `scripts/sync-env.ps1`      |
| Run migrations   | Migration runner    | `pnpm run db:up`            |

## 🛡️ Best Practices

1. **Test locally** before running in production
2. **Use transactions** for multi-step data operations
3. **Log operations** for audit trail
4. **Handle errors** gracefully
5. **Document purpose** in file header
6. **No schema changes** - use migrations instead
7. **Idempotent when possible** - safe to run multiple times
8. **Validate inputs** before executing

## 📖 Related Documentation

- **[Migration Policy](../docs/database/migration-policy.md)** - ⚠️ Required reading for database changes
- [Drizzle Rollback Migrations](../docs/database/drizzle-rollback-migrations.md)
- [DB Client README](../lib/db-client/README.md)
- [Development Setup](../docs/guides/development-setup.md)
- [Troubleshooting Guide](../docs/guides/troubleshooting.md)

## ✨ Script Examples

### Good: Data Query

```sql
-- check-active-users.sql
SELECT id, email, created_at
FROM users
WHERE status = 'active';
```

### Good: Data Operation

```typescript
// archive-old-leagues.ts
await db.execute(sql`
  UPDATE leagues 
  SET status = 'archived' 
  WHERE season < 2024 AND status = 'active'
`);
```

### Bad: Schema Change (Use Migration Instead!)

```typescript
// ❌ add-status-column.ts - WRONG!
await db.execute(sql`
  ALTER TABLE leagues 
  ADD COLUMN status VARCHAR(20)
`);
```

---

**Remember**: If you're modifying the database structure, you need a migration!
See [Migration Policy](../docs/database/migration-policy.md) for complete guidelines.
