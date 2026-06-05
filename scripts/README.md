# Scripts Directory

This directory contains operational and utility scripts for the Legacy Sports application.

## 🧭 Before you add a script: should this be a CLI command?

**Default to a CLI command in [`apps/cli`](../apps/cli), not a script here.** CLI commands
go through the normal Nx build, type-check, lint, and test pipeline; they are imported
from `apps/cli/src/main.ts`, get reviewed like any other application code, and can freely
import workspace packages (`@legacy-sports/db-client`, `@legacy-sports/logging`, etc.).
Standalone scripts skip most of that — they are easy to write but harder to maintain,
test, and review, and they tend to rot. When in doubt, **write a CLI command.**

### ✅ Write an `apps/cli` command when the task…

- Performs **data or business operations** — querying, seeding, backfilling, cleanup,
  deleting, queueing work, reconciling external services (Stripe, SQS, etc.).
- **Imports workspace packages** (`@legacy-sports/*`) or talks to our database, GraphQL
  API, or domain services.
- Is **operator-facing** and likely to be run more than once or by more than one person.
- Benefits from typed arguments, `--help`, validation, and a spec.

There is already a large, established command set in `apps/cli/src/commands/` (e.g.
`cleanupTestLeagues`, `seedDevData`, `queryDb`, `investigateLeague13`, `createMatchup`).
New data/ops tooling belongs alongside those, not in `scripts/`. To add one:

1. Create `apps/cli/src/commands/<command-name>.ts` exporting an async `handle…` function
   that takes a typed args interface extending `CommandArgs`.
2. Register it in `apps/cli/src/main.ts` with
   `program.command('<name>').option(...).action(handler)`.
3. Use `LOGGER` from `@legacy-sports/logging` for output and add a spec.

### 🚫 Keep it as a script in `scripts/` **only** when the task…

- Must run **before `node_modules` exists or outside the workspace dependency graph** —
  bootstrap/toolchain glue that therefore **cannot import `@legacy-sports/*`**
  (e.g. `preinstall-guard.js`, `postinstall-security.js`, `modules-pool/*.mjs`,
  `mcp-mint-token.mjs`, `mcp-auth.mjs`, `install-git-hooks.js`, `patch-child-process.js`).
- Is a **platform-specific developer/CI wrapper** with no app logic — the PowerShell and
  shell helpers for git, AWS, the DB tunnel, and CI simulation (`*.ps1`, `*.sh`).
- Is **CI / build glue or repo linting** invoked by Make/CI/package.json hooks
  (`validate-*.js`, `lint-*.js`, `gen-*.js`, `classify-changes.js`).
- Is a **pure SQL query** (`*.sql`) or a one-off data-parsing helper for an external
  source (`*.py`).

If a "script" would import `@legacy-sports/*` and could just as easily live in `apps/cli`,
that is the signal it should be a CLI command instead.

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
- `sync-jira-status.ps1` - Synchronize Jira ticket statuses with Git branches (run via `make sync-jira`; caches Done tickets in `~/.legacy-sports/jira-sync-done.json` to skip them on later runs — pass `RECHECK=1` to re-evaluate)

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

### Logging & console output

The repo-wide `no-console` rule (use `LOGGER` from `@legacy-sports/logging`) **does not
apply to scripts in this directory.** Many scripts here run before `node_modules` is
installed or otherwise outside the workspace dependency graph, so they **cannot import
`@legacy-sports/*`** and must use `console.*` (or `process.stdout.write`) for output.
This is expected — automated reviewers should not flag `console.*` in `scripts/`. See
[lint-discipline](../.agents/skills/standards/references/lint-discipline.md) and
[common review pattern #40](../.agents/skills/pr-lifecycle/references/common-review-patterns.md).

If your script **does** import `@legacy-sports/*` (e.g. a TypeScript script that uses
`@legacy-sports/db-client`), prefer `LOGGER` for consistency — and reconsider whether it
should be an [`apps/cli` command](#-before-you-add-a-script-should-this-be-a-cli-command)
instead.

## 🔍 Finding the Right Tool

| Task            | Tool                | Location                     |
| --------------- | ------------------- | ---------------------------- |
| Schema change   | Migration           | `lib/db-client/migrations/`  |
| Query database  | `db-query.ps1`      | `scripts/db-query.ps1`       |
| Delete a league | `cli delete-league` | `apps/cli` (`delete-league`) |
| Deploy Lambda   | `deploy-lambda.ps1` | `scripts/deploy-lambda.ps1`  |
| Create branch   | `branch-create.ps1` | `scripts/branch-create.ps1`  |
| Sync env vars   | `sync-env.ps1`      | `scripts/sync-env.ps1`       |
| Run migrations  | Migration runner    | `pnpm run db:up`             |

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
