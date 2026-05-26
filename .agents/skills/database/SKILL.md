---
name: database
description: 'All local database operations: running migrations, ad-hoc queries, schema inspection, dump/restore, and health checks. Use when writing or applying migrations, checking schema state, running SQL, or troubleshooting database connectivity.'
---

# Skill: Database

## When to Use

- Writing or applying a new migration
- Checking whether migrations are pending before `make pc`
- Running ad-hoc SQL against the local dev database
- Inspecting or regenerating the schema
- Dumping or restoring the database
- Troubleshooting database connectivity

## MCP Tools (Primary)

| Tool                  | Purpose                                         | Key Parameters                                                                                                      |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `db_check_health`     | Pre-flight (Docker, Postgres, migration runner) | none                                                                                                                |
| `db_migration_status` | Check for pending migrations                    | `worktreePath?`                                                                                                     |
| `db_migrate`          | Apply pending migrations                        | `worktreePath?`                                                                                                     |
| `db_query`            | Ad-hoc SQL (read-only by default)               | `query`, `format?`, `allowWrite?` _(internal dev use on local DB only — never pass external/user input as `query`)_ |
| `db_print_schema`     | Regenerate schema.graphql                       | `worktreePath?`                                                                                                     |
| `db_codegen`          | GraphQL codegen after schema changes            | `worktreePath?`, `printSchemaFirst?`                                                                                |
| `db_restore_dev_seed` | Restore dev seed (destructive)                  | `confirmDestructive: true`                                                                                          |

## Decision Tree

| Situation                                | Reference                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Writing or applying a migration          | [references/migrations.md](references/migrations.md)                                                      |
| Running ad-hoc SQL or inspecting tables  | [repo-tooling/references/database.md](../repo-tooling/references/database.md) — Ad-hoc Query section      |
| Regenerating schema after Pothos changes | [repo-tooling/references/database.md](../repo-tooling/references/database.md) — Regenerate Schema section |
| Dumping or restoring data                | [repo-tooling/references/database.md](../repo-tooling/references/database.md) — Dump/Restore sections     |
| Schema table/column reference            | [repo-tooling/references/db-schema-reference.md](../repo-tooling/references/db-schema-reference.md)       |

## CLI Fallback

When MCP tools are unavailable:

```bash
pnpm --prefix lib/db-client run db:status   # check migration status
pnpm --prefix lib/db-client run db:up       # apply migrations
scripts/db-query.ps1 -Query "..."           # ad-hoc SQL
```

## Configuration

Requires Docker running and `.env` with `DATABASE_URL`. If missing:

| Issue                     | Fix                                                    |
| ------------------------- | ------------------------------------------------------ |
| `DATABASE_URL is not set` | Copy `.env` from main repo root or run `make wt-setup` |
| Connection refused        | `docker compose up -d postgres` (from main repo root)  |

## Related Skills

- [repo-tooling](../repo-tooling/SKILL.md) — `make pc`, lint, typecheck, build
- [dev-process/entrypoints/08-migration.md](../dev-process/entrypoints/08-migration.md) — migration entrypoint (RFC, rollback plan, staging for high-risk changes)
