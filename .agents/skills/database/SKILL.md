---
name: database
description: 'Database operations: MCP tools (primary), migrations, queries, schema reference, dump/restore. Load when checking migration status, running SQL, writing migrations, dumping/restoring data, or verifying database health.'
---

# Skill: Database Operations

## Overview

The `legacy-sports-db` MCP server is the primary interface for all database operations. Fall back to CLI commands when MCP is unavailable.

## MCP Tools (Primary)

| Tool                  | Purpose                                         | Key Parameters                                                |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `db_check_health`     | Pre-flight check (Docker, Postgres, migrations) | none                                                          |
| `db_migration_status` | Check for pending migrations                    | `worktreePath?`                                               |
| `db_migrate`          | Apply pending migrations                        | `worktreePath?`                                               |
| `db_query`            | Ad-hoc SQL (read-only by default)               | `query` (required), `format?`, `allowWrite?`                  |
| `db_print_schema`     | Regenerate schema.graphql                       | `worktreePath?`                                               |
| `db_codegen`          | GraphQL codegen after schema changes            | `worktreePath?`, `printSchemaFirst?`, `base?`, `skipNxCache?` |
| `db_restore_dev_seed` | Restore dev seed (destructive)                  | `confirmDestructive` (required `true`), `runMigrationsAfter?` |

## Common Workflows

### Check and Apply Migrations (Before `make pc`)

1. `db_migration_status` → check for pending migrations
2. If `needsMigration` is true → `db_migrate`
3. Confirm `success` before continuing

### Write a New Migration

**Location**: `lib/db-client/migrations/` — **Filename**: `YYYYMMDD_HHMMSS_descriptive_name.ts`

Critical rules (violating any causes the migration to be silently skipped):

| Rule          | Correct                                       | Wrong                                      |
| ------------- | --------------------------------------------- | ------------------------------------------ |
| **Directory** | `lib/db-client/migrations/`                   | `lib/db-client/src/drizzle/migrations/`    |
| **Filename**  | `YYYYMMDD_HHMMSS_name.ts`                     | `0051_name.ts`                             |
| **Exports**   | Named `export const up` / `export const down` | `export default { up, down }`              |
| **Signature** | `up({ db }: { db: PgDatabase<any> })`         | `up(db: NodePgDatabase)`                   |
| **SQL calls** | `db.execute(\`...\`)` (plain string)          | `db.execute(sql\`...\`)` (tagged template) |

After creating a migration: update the Drizzle schema model in `lib/db-client/src/drizzle/public/models/`, then run `db_migrate` to apply it locally.

> Full migration patterns and code examples: [references/migration-patterns-and-operations.md](references/migration-patterns-and-operations.md)

### Ad-hoc Query

Use `db_query` MCP tool (preferred) or CLI fallback:

```powershell
powershell -File .\scripts\db-query.ps1 -Query "SELECT * FROM matchups LIMIT 10" -Format json
```

### Regenerate Schema After Pothos Changes

1. `db_print_schema` → regenerate schema.graphql
2. If changed → `db_codegen` with `printSchemaFirst: false`
3. Verify: `make typecheck`

### Dump Production Data to S3

```powershell
make db-dump           # Full dump + S3 upload
make db-dump-dev       # Scrubbed dev seed (after db-restore)
```

> Full dump/restore guide: [references/dump-and-restore.md](references/dump-and-restore.md)

### Restore Data Locally

```powershell
make db-restore        # From S3 production dump (AWS required)
make db-restore-dev    # From scrubbed dev seed (no AWS)
make db-migrate        # Apply pending migrations after restore
```

## Schema Reference

Two PostgreSQL schemas — **always use the schema prefix**:

| Schema         | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `public`       | Fantasy league data, matchups, players, statistics             |
| `app_internal` | Authentication and internal tables (users, game_stats, events) |

```sql
-- Always prefix with schema name
SELECT * FROM app_internal.users WHERE id = 123;
SELECT * FROM public.leagues WHERE id = 16;
```

> Full schema reference (tables, columns, views, functions): [references/schema-reference.md](references/schema-reference.md)

## CLI Fallback

When MCP tools are unavailable:

```powershell
pnpm --prefix lib/db-client run db:status    # Check migration status
pnpm --prefix lib/db-client run db:up        # Apply migrations
.\scripts\db-query.ps1 -Query "..."          # Run SQL
pnpm --prefix lib/db-client run db:psql      # Interactive shell
```

## Configuration

MCP server registered in `.vscode/mcp.json`. Requires `.env` with `DATABASE_URL` and Docker running.

| Issue                       | Fix                                               |
| --------------------------- | ------------------------------------------------- |
| `DATABASE_URL is not set`   | Copy `.env` from main repo or run `make wt-setup` |
| Postgres connection refused | Start Docker: `docker compose up -d postgres`     |
| Migration status fails      | Ensure `lib/db-client` exists and `.env` loaded   |
| AWS SSO expired (dump)      | `aws sso login`                                   |
