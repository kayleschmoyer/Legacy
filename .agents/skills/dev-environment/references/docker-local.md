---
name: docker-local
description: 'Start, stop, rebuild, and debug the Legacy Sports local Docker Compose stack; use when spinning up the local dev environment, restarting services, viewing logs, or troubleshooting container issues.'
---

# Skill: Local Docker Compose Stack

## Overview

The full local dev stack runs via Docker Compose and replaces all AWS services for local development. It includes PostgreSQL, all Lambda backends, and the web app.

## Services

| Container           | Name           | Port | Purpose                                          |
| ------------------- | -------------- | ---- | ------------------------------------------------ |
| `ls-postgres`       | postgres       | 5432 | PostgreSQL database                              |
| `ls-migrate`        | migrate        | —    | Runs Drizzle migrations on startup, exits 0      |
| `ls-graphql`        | graphql        | 5000 | Apollo GraphQL API (`lambdas/db`)                |
| `ls-oauth`          | oauth          | 5001 | OAuth proxy (`lambdas/oauth-proxy`)              |
| `ls-stats`          | stats          | 5002 | Stats Lambda (`lambdas/stats-lambda`)            |
| `ls-game-selection` | game-selection | 5003 | Game selection Lambda                            |
| `ls-web`            | web            | 4200 | Next.js / Vite web app                           |
| `ls-cli`            | cli            | —    | CLI tool (run-and-exit via `docker compose run`) |

## Quick Start

### Prerequisites

1. Sync environment variables:
   ```powershell
   pnpm run sync-env
   ```
2. Start Docker Desktop

### Start everything

```powershell
make docker-up
# or
docker compose up -d --build
```

This starts all services in detached mode, builds images if needed, and runs migrations automatically before backend services start.

Wait ~30s for Vite/Tamagui cold start. Then visit:

- Web app: http://localhost:4200
- GraphQL: http://localhost:5000/graphql
- OAuth: http://localhost:5001/oauth

### Start a subset of services

```powershell
# Backend only (no web)
docker compose up -d postgres graphql oauth

# Just the database
docker compose up -d postgres
```

## Stopping

```powershell
# Stop all containers (preserves volumes/data)
docker compose down

# Stop and wipe the database volume (full reset)
docker compose down -v
```

## Viewing Logs

```powershell
# All services, follow
docker compose logs -f

# Single service, last 50 lines
docker compose logs graphql --tail=50
docker compose logs web --tail=50
docker compose logs migrate --tail=50

# Follow a specific service
docker compose logs -f oauth
```

## Rebuilding

Required after `package.json` changes or Dockerfile edits:

```powershell
# Rebuild all images
docker compose build --no-cache

# Rebuild one service only
docker compose build --no-cache graphql

# Rebuild + restart a single service
docker compose up -d --build graphql
```

## Restarting a Single Service

```powershell
docker compose restart graphql
docker compose restart web
```

## Running Migrations

Migrations run automatically via the `migrate` service on `docker compose up`. To run them manually:

```powershell
make db-migrate
# or inside the stack:
docker compose run --rm migrate
```

## Running CLI Commands

```powershell
# Seed player data
docker compose run --rm cli seed-dev-data --letters a,b

# Get help
docker compose run --rm cli help
```

## Checking Service Health

```powershell
# Status of all containers
docker compose ps

# Health of postgres specifically
docker inspect ls-postgres --format "{{.State.Health.Status}}"
```

## Startup Dependency Order

Services start in this order (enforced by `depends_on`):

```
postgres (healthy)
    └── migrate (completed successfully)
            ├── graphql
            ├── oauth
            ├── stats
            ├── game-selection
            └── web (also waits on graphql + oauth started)
```

If `migrate` fails (exit non-zero), all backend services will refuse to start.

## Environment Variables

Docker Compose loads two env files, with `.env.docker` overriding `.env`:

```yaml
env_file:
  - .env # real secrets from AWS Parameter Store (gitignored)
  - .env.docker # docker-specific overrides: local DB creds, service URLs
```

Key `.env.docker` overrides:

- `USE_LOCAL_CREDENTIALS=true` — skips SSL/certificate auth for local Postgres
- `DB_HOST=postgres:5432` — points to the Docker postgres container
- `DATABASE_URL=postgresql://legacy_sports:legacy_sports_dev@postgres:5432/legacy_sports_dev`
- `VITE_GRAPHQL_HOST=http://localhost:5000/graphql`
- `VITE_OAUTH_PROXY_URL=http://localhost:5001/oauth`

To refresh `.env` from AWS:

```powershell
pnpm run sync-env
```

## Troubleshooting

**Web app not loading at localhost:4200**
Vite has an ~11s cold start due to Tamagui compilation. Wait and refresh.

**`migrate` service fails / backend services won't start**

```powershell
docker compose logs migrate
```

Fix the failing migration, then: `docker compose up -d`

**`Cannot connect to database` errors in graphql/oauth logs**
Ensure `USE_LOCAL_CREDENTIALS=true` is set in `.env.docker` and that the `migrate` service completed successfully.

**Port already in use**

```powershell
# Find what's using the port (e.g. 5000)
netstat -ano | findstr :5000
```

Stop the conflicting process or change the port mapping in `docker-compose.yml`.

**Stale image after code changes**

```powershell
docker compose build --no-cache <service>
docker compose up -d <service>
```

**Full reset (nuclear option)**

```powershell
docker compose down -v          # stop + delete volumes
docker compose build --no-cache # rebuild all images
make db-restore-dev             # restore database from seed
docker compose up -d            # start fresh
```

## Related Skills

- [database](../../database/SKILL.md) — restore database, run migrations, query data
- [sync-env](../../sync-env/SKILL.md) — refresh `.env` from AWS Parameter Store
