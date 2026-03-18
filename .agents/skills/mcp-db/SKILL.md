---
name: mcp-db
description: 'Run database operations via MCP tools (primary) or CLI fallback. Load when checking migration status, running ad-hoc SQL, regenerating schema.graphql, restoring the dev seed, or verifying database health.'
---

# Skill: MCP Database Operations Server

## Overview

The `legacy-sports-db` MCP server exposes seven database tools that replace the multiple terminal commands agents previously had to piece together. It runs over stdio and is configured in `.vscode/mcp.json`.

## When to Use

- Checking if migrations are pending before `make pc`
- Applying database migrations
- Running ad-hoc SQL queries for debugging or data verification
- Regenerating `schema.graphql` after Pothos schema changes
- Pre-flight health check (Docker, Postgres, migrations)

## Location

```
tools/mcp/db-server/
├── tsconfig.json
└── src/
    ├── index.ts              # Entry point, tool registration
    ├── db-connection.ts      # Postgres connection via DATABASE_URL
    ├── run-command.ts        # Shell command helpers
    └── tools/
        ├── migration-status.ts
        ├── migrate.ts
        ├── query.ts
        ├── print-schema.ts
        ├── check-health.ts
        ├── codegen.ts
        └── restore-dev-seed.ts
```

## Workflows

### Pre-flight: Verify Environment

Run `db_check_health` before starting any DB work. It returns `{ dockerRunning, postgresReachable, migrationsUpToDate, issues[] }`. If any issue is reported, fix it before proceeding.

### Check and Apply Migrations (Before `make pc`)

1. Call `db_migration_status` → returns `{ applied, pending, pendingNames[], needsMigration }`
2. If `needsMigration` is true, call `db_migrate` → returns `{ applied, appliedNames[], success }`
3. Confirm `success` is true before continuing

### Regenerate Schema After Pothos Changes

1. Call `db_print_schema` → returns `{ success, schemaChanged, output }`
2. If `schemaChanged`, call `db_codegen` with `printSchemaFirst: false` → returns `{ success, output }`
3. Verify no type errors: run `make typecheck`

### Ad-hoc Query for Debugging

Call `db_query` with `query` (string) and optionally `format` (`'table'` or `'json'`).

- **READ-ONLY by default** — refuses writes unless `allowWrite: true`
- Uses a Postgres `READ ONLY` transaction as a safety net

### Restore Dev Seed (Destructive)

Call `db_restore_dev_seed` with `confirmDestructive: true`. Drops and recreates `legacy_sports_dev`, then runs migrations if `runMigrationsAfter: true` (default).

## Tool Reference

| Tool                  | Key Parameters                                                |
| --------------------- | ------------------------------------------------------------- |
| `db_check_health`     | none                                                          |
| `db_migration_status` | `worktreePath?`                                               |
| `db_migrate`          | `worktreePath?`                                               |
| `db_query`            | `query` (required), `format?`, `allowWrite?`                  |
| `db_print_schema`     | `worktreePath?`                                               |
| `db_codegen`          | `worktreePath?`, `printSchemaFirst?`, `base?`, `skipNxCache?` |
| `db_restore_dev_seed` | `confirmDestructive` (required `true`), `runMigrationsAfter?` |

## Configuration

Registered in `.vscode/mcp.json`:

```json
{
  "servers": {
    "legacy-sports-db": {
      "type": "stdio",
      "command": "node",
      "args": ["--import", "tsx", "tools/mcp/db-server/src/index.ts"]
    }
  }
}
```

## Prerequisites

- `.env` must exist in the repo root with a valid `DATABASE_URL`
- Docker Desktop running (for local Postgres)
- `node_modules` present (for `postgres`, `@modelcontextprotocol/sdk`, `zod`)

## Troubleshooting

| Issue                       | Fix                                                    |
| --------------------------- | ------------------------------------------------------ |
| `DATABASE_URL is not set`   | Copy `.env` from main repo or run `make wt-setup`      |
| Postgres connection refused | Start Docker: `docker compose up -d postgres`          |
| Migration status fails      | Ensure `lib/db-client` exists and `.env` is loaded     |
| Schema print fails          | Check that `db` Nx project has a `print-schema` target |

## CLI Fallback (Direct Database Access)

When MCP tools are unavailable, use these CLI commands:

```powershell
# Test database connection
pnpm run db:test

# Interactive PostgreSQL shell
pnpm run db:psql

# Run SQL queries via script (recommended over psql for one-off queries)
.\scripts\db-query.ps1 -Query "SELECT * FROM players LIMIT 10"
.\scripts\db-query.ps1 -Query "SELECT * FROM leagues" -Format json

# View connection details
pnpm run db:url            # masked password
pnpm run db:credentials    # full credentials (careful!)

# Resync credentials from AWS
pnpm run sync-env
```

### Common psql Commands

```sql
\dt                    -- List all tables
\d table_name          -- Describe table structure
\dn                    -- List all schemas
SELECT COUNT(*) FROM players;
\q                     -- Exit psql
```
