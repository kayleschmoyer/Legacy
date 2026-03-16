---
name: mcp-db
description: 'MCP server exposing database operations (migration status, query execution, schema regeneration, health checks) as tools for AI agents. Use when agents need to run database queries, check migration status, apply migrations, regenerate schema.graphql, or verify database health.'
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

## Tools

### db_check_health

Pre-flight check before starting work.

- **Parameters**: none
- **Returns**: `{ dockerRunning, postgresReachable, migrationsUpToDate, issues[] }`
- **Use first** to verify the dev environment is ready.

### db_migration_status

Check pending migration status.

- **Parameters**: `worktreePath?` (optional, defaults to repo root)
- **Returns**: `{ applied, pending, pendingNames[], needsMigration }`
- Equivalent to running `pnpm run db:status` from `lib/db-client`.

### db_migrate

Apply pending migrations.

- **Parameters**: `worktreePath?` (optional)
- **Returns**: `{ applied, appliedNames[], success }`
- Checks for pending migrations first. Returns a warning if none to apply.
- Equivalent to running `pnpm run db:up` from `lib/db-client`.

### db_query

Execute an ad-hoc SQL query.

- **Parameters**: `query` (string, required), `format` (`'table'` | `'json'`, default `'json'`), `allowWrite` (boolean, default `false`)
- **Returns**: `{ rows[], rowCount, columns[] }`
- **READ-ONLY by default** — refuses INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER unless `allowWrite=true`.
- Uses a Postgres `READ ONLY` transaction as a safety net.

### db_print_schema

Regenerate `schema.graphql` from the Pothos schema.

- **Parameters**: `worktreePath?` (optional)
- **Returns**: `{ success, schemaChanged, output }`
- Equivalent to `pnpm exec nx run db:print-schema`.

### db_codegen

Run GraphQL codegen using Nx affected.

- **Parameters**: `worktreePath?`, `printSchemaFirst?` (default `false`), `base?`, `skipNxCache?` (default `false`)
- **Returns**: `{ success, ranPrintSchema, output }`
- Equivalent to `pnpm exec nx affected -t codegen` (optionally runs `pnpm exec nx run db:print-schema` first).

### db_restore_dev_seed

Restore the scrubbed dev seed into the local Docker Postgres database.

- **Parameters**: `worktreePath?`, `confirmDestructive` (required `true`), `runMigrationsAfter?` (default `true`)
- **Returns**: `{ success, migrationsRun, output }`
- Equivalent to running `scripts/db-restore-dev.ps1` (with required confirmation) and optionally `make db-migrate`.
- **Destructive**: drops and recreates local `legacy_sports_dev`.

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
