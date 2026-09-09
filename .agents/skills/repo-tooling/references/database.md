# Database Operations Reference

## Overview

`db_query` is served by the hosted `legacy-sports-db-admin` MCP server (in-VPC, no SSM tunnel). All other DB operations are shell commands — there is no stdio DB server.

## Operations

| Operation                      | Command                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Ad-hoc SQL (read-only)         | `db_query` (hosted MCP)                                                                          |
| Check pending migrations       | `pnpm --prefix lib/db-client run db:status`                                                      |
| Apply pending migrations       | `pnpm --prefix lib/db-client run db:up`                                                          |
| Apply migrations to dev RDS    | `node scripts/db/transpile-migration.mjs` piped into `db_migrate` (hosted MCP, POSTs over HTTPS) |
| Migration diff vs applied      | `db_migration_status` (hosted MCP; pass local migration filenames)                               |
| Regenerate `schema.graphql`    | `pnpm exec nx run db:print-schema`                                                               |
| GraphQL codegen after schema   | `make codegen`                                                                                   |
| Restore dev seed (DESTRUCTIVE) | `make db-restore-dev`                                                                            |
| Restore from S3 prod dump      | `make db-restore` (AWS required)                                                                 |
| Dump to S3                     | `make db-dump`                                                                                   |
| Scrub-and-dump dev seed        | `make db-dump-dev`                                                                               |
| Interactive psql               | `pnpm --prefix lib/db-client run db:psql`                                                        |

## Common Workflows

### Check and Apply Migrations (Before `make pc`)

1. `pnpm --prefix lib/db-client run db:status` → check for pending migrations
2. If pending → `pnpm --prefix lib/db-client run db:up`
3. Confirm `Applied N new migrations` or `No new migrations to apply` before continuing

### Write a New Migration

**Location**: `lib/db-client/migrations/` -- **Filename**: `YYYYMMDD_HHMMSS_descriptive_name.ts`

Critical rules (violating any causes the migration to be silently skipped):

| Rule          | Correct                                       | Wrong                                      |
| ------------- | --------------------------------------------- | ------------------------------------------ |
| **Directory** | `lib/db-client/migrations/`                   | `lib/db-client/src/drizzle/migrations/`    |
| **Filename**  | `YYYYMMDD_HHMMSS_name.ts`                     | `0051_name.ts`                             |
| **Exports**   | Named `export const up` / `export const down` | `export default { up, down }`              |
| **Signature** | `up({ db }: { db: PgDatabase<any> })`         | `up(db: NodePgDatabase)`                   |
| **SQL calls** | `db.execute(\`...\`)` (plain string)          | `db.execute(sql\`...\`)` (tagged template) |

After creating a migration: update the Drizzle schema model in `lib/db-client/src/drizzle/public/models/`, then apply locally with `pnpm --prefix lib/db-client run db:up`.

> Full migration patterns and code examples: [db-migration-patterns-and-operations.md](db-migration-patterns-and-operations.md)

### Ad-hoc Query

Use the hosted `db_query` MCP tool. CLI fallback:

```powershell
powershell -File .\scripts\db-query.ps1 -Query "SELECT * FROM matchups LIMIT 10" -Format json
```

### Regenerate Schema After Pothos Changes

Step 1 must run before step 2 — `make codegen` alone validates against the committed `schema.graphql`, not the live Pothos builder, so a new/changed field there fails codegen with a confusing `Cannot query field "X" on type "Query"` error until the SDL is regenerated.

1. `pnpm exec nx run db:print-schema` → regenerate schema.graphql
2. If changed → `make codegen`
3. Verify: `make typecheck`

### Dump Production Data to S3

```powershell
make db-dump           # Full dump + S3 upload
make db-dump-dev       # Scrubbed dev seed (after db-restore)
```

> Full dump/restore guide: [db-dump-and-restore.md](db-dump-and-restore.md)

### Restore Data Locally

```powershell
make db-restore        # From S3 production dump (AWS required)
make db-restore-dev    # From scrubbed dev seed (no AWS)
pnpm --prefix lib/db-client run db:up   # Apply pending migrations after restore
```

## Schema Reference

Two PostgreSQL schemas -- **always use the schema prefix**:

| Schema         | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `public`       | Fantasy league data, matchups, players, statistics             |
| `app_internal` | Authentication and internal tables (users, game_stats, events) |

```sql
-- Always prefix with schema name
SELECT * FROM app_internal.users WHERE id = 123;
SELECT * FROM public.leagues WHERE id = 16;
```

> Full schema reference (tables, columns, views, functions): [db-schema-reference.md](db-schema-reference.md)

## Configuration

Hosted `db_query` / `db_migrate` need `MCP_DB_ADMIN_URL` + `MCP_DB_ADMIN_BEARER` (set by the MCP client on connect). Shell commands need `.env` with `DATABASE_URL` and Docker running.

| Issue                       | Fix                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL is not set`   | Copy `.env` from main repo or run `make wt-setup`                                                                                                                          |
| Postgres connection refused | Start Docker: `docker compose up -d postgres`                                                                                                                              |
| AWS SSO expired (dump)      | Stop; prompt the user to run `aws sso login` in their terminal (user-only, Tier 1 — see [mcp-first Auth Model](../../mcp-first/references/auth-and-routing.md#auth-model)) |
