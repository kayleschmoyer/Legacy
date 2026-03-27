---
name: dev-environment
description: 'Start and manage local dev services: Next.js web dev server, local GraphQL Lambda, and Docker Compose stack. Use when spinning up the local dev environment, debugging services, or running the full stack locally.'
---

# Skill: Dev Environment

## Overview

Consolidated guide for starting and managing all local development services. Choose the right approach based on what you're working on.

## When to Use

- Starting local dev services for any part of the stack
- Debugging dev environment issues
- Running services locally for development or testing

## Context-Driven Startup

### Working on Web UI

Start just the Next.js dev server with hot-reloading:

```bash
make dev-web
# or: pnpm exec nx run web:serve
```

Server runs at `http://localhost:3000` with React Fast Refresh.

See [references/dev-web.md](references/dev-web.md) for full details (alternative commands, custom ports, hot-reload behavior, debugging, troubleshooting).

### Working on GraphQL / Backend

Start the DB Lambda locally to develop and test GraphQL without deploying to AWS:

```bash
pnpm exec nx run db:serve
# with watch mode: pnpm exec nx run db:serve --watch
```

GraphQL endpoint at `http://localhost:<port>/graphql`.

See [references/dev-db-lambda.md](references/dev-db-lambda.md) for full details (SAM CLI alternative, database connection, schema updates, debugging).

### Full Stack or Docker

Use Docker Compose to run the entire stack (PostgreSQL, all Lambdas, web app):

```bash
make docker-up
# or: docker compose up -d --build
```

Services: web (`localhost:4200`), GraphQL (`localhost:5000`), OAuth (`localhost:5001`), stats (`localhost:5002`), game-selection (`localhost:5003`), PostgreSQL (`localhost:5432`).

See [references/docker-local.md](references/docker-local.md) for full details (subset startup, logs, rebuilding, environment variables, troubleshooting).

## Quick Start Commands

| Goal                | Command                              |
| ------------------- | ------------------------------------ |
| Start everything    | `make dev` or `docker compose up -d` |
| Web only            | `make dev-web`                       |
| GraphQL Lambda only | `pnpm exec nx run db:serve`          |
| Docker full stack   | `make docker-up`                     |
| Stop Docker stack   | `docker compose down`                |
| Stop + wipe DB      | `docker compose down -v`             |

## Common Prerequisites

1. **Install dependencies**: `make install` (never raw `pnpm install` in worktrees)
2. **Sync environment variables**: `make sync-env` or `.\scripts\sync-env.ps1`
3. **Database accessible**: local PostgreSQL running or Docker Compose stack up
4. **Migrations applied**: `db_migration_status(worktreePath: "$wt")` then `db_migrate(worktreePath: "$wt")` (MCP tools). Shell fallback: `pnpm --prefix lib/db-client run db:status` then `pnpm --prefix lib/db-client run db:up`

## Full Stack Local Workflow

```bash
# Terminal 1: Start DB Lambda
pnpm exec nx run db:serve

# Terminal 2: Start Web Server
make dev-web

# Web at http://localhost:3000, GraphQL at http://localhost:<port>/graphql
```

Or use Docker for a single-command start:

```bash
docker compose up -d --build
# Web at http://localhost:4200, GraphQL at http://localhost:5000/graphql
```

## Stopping Services

- **Web/Lambda**: Ctrl+C in the terminal
- **Docker**: `docker compose down` (preserves data) or `docker compose down -v` (full reset)
- **Stale processes**: `make kill-stale`

## Related Skills

- [sync-env](../sync-env/SKILL.md) -- environment variable management
- [database](../database/SKILL.md) -- migrations, queries, schema
- [build](../build/SKILL.md) -- production builds
- [test](../test/SKILL.md) -- running tests
