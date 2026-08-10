---
name: database
description: 'All local database operations: running migrations, ad-hoc queries, schema inspection, dump/restore, and health checks. Use when writing or applying migrations, checking schema state, running SQL, or troubleshooting database connectivity.'
metadata:
  scope: '**'
---

# Skill: Database

## When to Use

- Writing or applying a new migration
- Checking whether migrations are pending before `make pc`
- Running ad-hoc SQL against the dev database
- Inspecting or regenerating the schema
- Dumping or restoring the database
- Troubleshooting database connectivity

## Tools

The hosted DB MCP server is the only DB MCP server. It reaches the dev RDS over HTTPS with no SSM tunnel. **Naming**: live connector sessions expose it as `legacy-sports-db` (tool prefix `mcp__legacy-sports-db__*`); the repo-side alias in Copilot/VS Code configs and `tools/mcp/db-admin-server/` is `legacy-sports-db-admin` — same server, see [mcp-first](../mcp-first/SKILL.md). Everything else is a shell command.

| Operation                      | Command                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ad-hoc SQL (read-only)         | `db_query` (hosted MCP; connector prefix `mcp__legacy-sports-db__db_query`)                                                                                               |
| Check pending migrations       | `pnpm --prefix lib/db-client run db:status`                                                                                                                               |
| Apply pending migrations       | `pnpm --prefix lib/db-client run db:up`                                                                                                                                   |
| Apply migrations to dev RDS    | `node scripts/db/transpile-migration.mjs` piped into `db_migrate` (hosted MCP, async — returns `jobId`; poll `db_migration_status({ jobId })`) — never hand-run `esbuild` |
| Migration applied/pending diff | `db_migration_status` (hosted MCP; pass local migration filenames)                                                                                                        |
| Regenerate `schema.graphql`    | `pnpm exec nx run db:print-schema`                                                                                                                                        |
| GraphQL codegen after schema   | `make codegen`                                                                                                                                                            |
| Restore dev seed (DESTRUCTIVE) | `make db-restore-dev` (Windows; runs `scripts/db-restore-dev.ps1`)                                                                                                        |
| Pre-flight health check        | `pnpm --prefix lib/db-client run db:status` (reports DB reachability + pending migration count)                                                                           |
| Look up a user                 | `db_query` with a SELECT on `users` (no dedicated tool)                                                                                                                   |

## Decision Tree

| Situation                                | Reference                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Writing or applying a migration          | [references/migrations.md](references/migrations.md)                                                      |
| Running ad-hoc SQL or inspecting tables  | [repo-tooling/references/database.md](../repo-tooling/references/database.md) — Ad-hoc Query section      |
| Regenerating schema after Pothos changes | [repo-tooling/references/database.md](../repo-tooling/references/database.md) — Regenerate Schema section |
| Dumping or restoring data                | [repo-tooling/references/database.md](../repo-tooling/references/database.md) — Dump/Restore sections     |
| Schema table/column reference            | [repo-tooling/references/db-schema-reference.md](../repo-tooling/references/db-schema-reference.md)       |

## Configuration

Requires Docker running and `.env` with `DATABASE_URL`. If missing:

| Issue                     | Fix                                                    |
| ------------------------- | ------------------------------------------------------ |
| `DATABASE_URL is not set` | Copy `.env` from main repo root or run `make wt-setup` |
| Connection refused        | `docker compose up -d postgres` (from main repo root)  |

The hosted `db_query` / `db_migrate` MCP tools additionally need `MCP_DB_ADMIN_URL` + `MCP_DB_ADMIN_BEARER` (minted per-connect by the MCP client). See [`tools/mcp/db-admin-server/README.md`](../../../tools/mcp/db-admin-server/README.md).

## Related Skills

- [domain-reference](../domain-reference/SKILL.md) — what the tables mean (product + data-model ground truth); this skill is how to change them
- [repo-tooling](../repo-tooling/SKILL.md) — `make pc`, lint, typecheck, build
- [dev-process/entrypoints/08-migration.md](../dev-process/entrypoints/08-migration.md) — migration entrypoint (RFC, rollback plan, staging for high-risk changes)
