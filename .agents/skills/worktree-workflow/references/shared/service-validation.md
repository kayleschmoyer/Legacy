---
name: service-validation
description: 'Validate backend changes (resolvers, migrations, Lambda logic) against real local services before committing. Load when you changed code in lambdas/, lib/db-client/migrations/, or resolver files and need to verify beyond unit tests and type checks.'
---

# Skill: Service Validation

## Overview

`make pc` runs type-checking, lint, unit tests, migration immutability checks, schema/codegen, formatting, workflow validation, and build, but it does **not** verify that a resolver works against real Postgres, that a migration applies cleanly to a running database, or that a Lambda serves correct responses over HTTP. This skill covers how to start only the services you need, run targeted validation, and shut them down. It slots between step 7 (Code) and step 8 (Commit) in the AGENTS.md workflow.

## When to Use

- Changed a resolver in `lambdas/db/src/schema/`
- Added or modified a Drizzle migration in `lib/db-client/migrations/`
- Changed shared library code used by resolvers (`lib/db-client`, `lib/data-loaders`, `lib/scoring`)
- Added a new GraphQL query/mutation and want to verify it serves correctly
- Changed Lambda logic in `lambdas/stats-lambda/`, `lambdas/game-selection/`, or `lambdas/oauth-proxy/`
- Need to verify a migration + resolver change work together

**Skip this skill** if you only changed frontend code, styles, or hermetic E2E test mocks.

## Decision Tree

| What you changed                             | Validation approach                                                            | Services needed              |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| Migration only (`lib/db-client/migrations/`) | `db_migrate` + `db_migration_status` MCP tools                                 | Docker Postgres only         |
| Resolver logic (existing behavior)           | Jest integration tests via `nx_run(project: "db", target: "test:integration")` | None (uses in-memory SQLite) |
| New/changed query — want real Postgres proof | Start GraphQL, send test query via curl                                        | Docker Postgres + GraphQL    |
| Resolver + frontend wiring                   | Start GraphQL + web, run targeted Playwright integration test                  | Postgres + GraphQL + Web     |
| Multi-Lambda flow (game-selection, stats)    | Start relevant Lambdas, run integration suite                                  | Postgres + relevant Lambdas  |

## Validation Procedures

### Migration-Only Validation

Use MCP tools — no HTTP services needed, just a running Postgres:

```powershell
docker compose up -d postgres        # start Postgres container
docker compose exec -T postgres pg_isready -U postgres -d postgres -h localhost -p 5432  # wait until Postgres is ready
```

Then validate via MCP:

```
db_migrate()                          # apply pending migrations
db_migration_status()                 # confirm "Applied N new migrations" or "No new migrations"
db_print_schema()                     # regenerate GraphQL schema from Pothos (only needed if resolver/type definitions changed)
```

Shell fallback:

```powershell
pnpm --prefix lib/db-client run db:up
pnpm --prefix lib/db-client run db:status
```

> **Note:** The shell fallback reads database connection settings from the repo root `.env` (not `.env.docker`). Ensure `.env` has `DATABASE_URL` pointing at `localhost:5432` when validating against the Docker Postgres container, otherwise these commands may hit a different database or fail to resolve the `postgres` hostname.

### Resolver Validation (Jest Integration Tests)

These tests use in-memory SQLite via `better-sqlite3` — no running services needed:

```
# MCP-first:
nx_run(project: "db", target: "test:integration")

# Shell fallback:
pnpm exec nx run db:test:integration
```

> **Warning:** SQLite does not catch Postgres-specific SQL like `ON CONFLICT`, `RETURNING`, array columns, or `jsonb` operators. If your change uses Postgres-specific features, use Live GraphQL Validation instead.

### Live GraphQL Validation

For verifying a query/mutation works end-to-end against real Postgres:

**Step 1 — Start services:**

```powershell
docker compose up -d graphql          # pulls in postgres + migrate via depends_on
```

> The `migrate` service runs automatically before `graphql` starts. Do not also run migrations manually.

**Step 2 — Verify readiness:**

```powershell
curl -s http://localhost:5000/health  # expect JSON with "status": "healthy"
```

**Step 3 — Send test queries:**

```powershell
curl -s -X POST http://localhost:5000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ leagues { id name } }"}'
```

The dev GraphQL server falls back to an admin user (id=1) when no JWT is provided, so most queries work without auth headers.

For mutations or queries needing a specific user, pass a dev JWT. The dev server skips signature verification, so any valid-shaped JWT works — **never use production tokens here**:

```bash
# Generate a dev-only JWT (no real secret needed — dev server skips verification)
DEV_JWT=$(node -e "console.log(require('jsonwebtoken').sign({sub:'1',role:'admin'},'dev-secret'))")
curl -s -X POST http://localhost:5000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEV_JWT" \
  -d '{"query": "mutation { createLeague(input: { name: \"Test\" }) { id } }"}'
```

### Full-Stack Validation (Playwright Integration)

For changes spanning resolver + frontend:

**Step 1 — Start services:**

```powershell
docker compose up -d graphql web      # starts postgres → migrate → graphql → web
```

**Step 2 — Run targeted integration tests:**

```powershell
# Target a specific test file:
INTEGRATION_BASE_URL=http://localhost:5000 INTEGRATION_WEB_URL=http://localhost:4200 pnpm exec playwright test \
  --config=apps/web-e2e/playwright.integration.config.ts \
  --grep='@smoke' \
  apps/web-e2e/src/integration/tests/<your-test>.integration.spec.ts
```

See the `integration-testing` skill for Playwright integration test patterns.

### Multi-Lambda Validation

Start only the Lambdas involved in the flow:

```powershell
# Example: game-selection flow
docker compose up -d graphql game-selection   # postgres + migrate included via depends_on

# Example: stats pipeline
docker compose up -d graphql stats
```

Health check all running services:

```powershell
make check-services
```

## Cleanup (MANDATORY)

**Always stop services after validation.** Leaving them running causes port conflicts in other worktrees and holds file locks.

```powershell
# Docker services:
docker compose down

# Safety net — kill any stale node processes:
make kill-stale
```

> Do NOT use `docker compose down -v` routinely — it destroys the Postgres data volume, requiring a full reseed.

## Gotchas

| Gotcha              | Detail                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite != Postgres  | Jest integration tests use SQLite. Postgres-specific SQL (`ON CONFLICT`, `RETURNING`, arrays, `jsonb`) is NOT validated. Use Live GraphQL Validation for Postgres-specific changes.                                                                                                                                                         |
| `--build` flag      | Use `docker compose up -d --build graphql` only after changing dependencies, the Dockerfile, or other files not bind-mounted into the container. Lambda code in `lambdas/*/src` and shared libs in `lib/` are mounted for hot-reload, so most code changes don't require rebuilding the image.                                              |
| Dev server auth     | The GraphQL dev server decodes JWTs without signature verification and falls back to admin user id=1. Fine for data validation, not for testing auth flows.                                                                                                                                                                                 |
| Port conflicts      | If port 5000 is in use (stale process, another dev server), Docker Compose fails. Free the port (for example, `pnpm dlx kill-port 5000`, `docker compose down`, or OS-specific process lookup). On Windows, `make kill-stale` is only for stale Node processes holding native addon locks under `node_modules`, not general port conflicts. |
| Migrations auto-run | Docker Compose's `migrate` service runs automatically before backends start via `depends_on`. Don't also run `db:up` manually when using Docker Compose.                                                                                                                                                                                    |

## Anti-Patterns

| Anti-pattern                                                                | Do this instead                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Start all services for a resolver-only change                               | Start only `postgres` + `graphql`                                                        |
| Leave Docker services running after validation                              | `docker compose down` immediately after                                                  |
| Skip validation — rely only on hermetic mocks when you changed backend code | Run at least `db:test:integration` for resolver changes                                  |
| Use `make dev` for automated validation                                     | Use `docker compose up -d` with specific services (deterministic, no interactive output) |
| Run `docker compose down -v` routinely                                      | Use `docker compose down` (no `-v`) to preserve Postgres data                            |
| Manually run `db:up` alongside Docker Compose                               | The `migrate` container handles it — only run manually in native mode                    |

## Workflow Position

This skill fits into the AGENTS.md workflow as step **7b**:

```
7.  Code: make changes
7b. SERVICE VALIDATION (this skill): verify backend changes work
8.  Commit
10. Migrations (make pc prerequisite)
11. make pc
```

## Related Skills

- **docker-local** — Docker Compose stack management, service ports, troubleshooting
- **integration-testing** — Playwright integration test patterns, serial phases, multi-user fixtures
- **test** — Jest unit and integration testing
- **db-migration-write** — Writing and applying Drizzle migrations
- **e2e-testing** — Hermetic Playwright E2E tests (mocked network)
