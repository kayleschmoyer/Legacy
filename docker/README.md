# Docker Local Development

Run the full Legacy Sports stack locally — no AWS credentials required.

## Services

| Service          | Container           | Port | Purpose                               |
| ---------------- | ------------------- | ---- | ------------------------------------- |
| `postgres`       | `ls-postgres`       | 5432 | Local PostgreSQL (replaces RDS)       |
| `graphql`        | `ls-graphql`        | 5000 | Apollo GraphQL API (`lambdas/db`)     |
| `oauth`          | `ls-oauth`          | 5001 | OAuth proxy (`lambdas/oauth-proxy`)   |
| `stats`          | `ls-stats`          | 5002 | Stats lambda (`lambdas/stats-lambda`) |
| `game-selection` | `ls-game-selection` | 5003 | Game selection lambda                 |
| `web`            | `ls-web`            | 4200 | Web app (`apps/web`)                  |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 4.x
- Enough RAM (~4 GB recommended for all services)

## Quick Start

```powershell
# 1. Copy the env template (only needed once)
Copy-Item .env.docker .env.docker.local

# 2. (Optional) Add real Google OAuth credentials to .env.docker.local
#    Without them, the app runs but OAuth login won't work.

# 3. Build and start all services
docker compose up --build

# 4. In a separate terminal, run Drizzle migrations against the local DB
$env:USE_LOCAL_CREDENTIALS="true"
$env:DB_HOST="localhost:5432"
$env:DB_USER="legacy_sports"
$env:DB_PASSWORD="legacy_sports_dev"
pnpm run db:migrate
```

Web app is available at **http://localhost:4200**

GraphQL playground at **http://localhost:5000/graphql**

## Common Commands

```powershell
# Start all services (detached)
docker compose up -d

# Start only backend services (no web)
docker compose up -d postgres graphql oauth stats game-selection

# Follow logs for a specific service
docker compose logs -f graphql

# Restart a single service after code changes
docker compose restart graphql

# Stop everything (keep DB data)
docker compose down

# Stop and wipe the database volume
docker compose down -v

# Rebuild images after adding npm packages
docker compose build --no-cache
docker compose up
```

## Environment Variables

| File                | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `.env.docker`       | Default dev values, committed to git           |
| `.env.docker.local` | Personal overrides (OAuth secrets), gitignored |

To use `.env.docker.local`, update `env_file` in `docker-compose.yml`:

```yaml
env_file: .env.docker.local
```

## Database Access

Connect to the local Postgres container:

```powershell
docker exec -it ls-postgres psql -U legacy_sports -d legacy_sports_dev
```

Or from the host (requires `psql` installed):

```powershell
psql -h localhost -p 5432 -U legacy_sports -d legacy_sports_dev
```

## Hot Reload

Source code is bind-mounted into each container, so changes to:

- `lambdas/*/src/**` — picked up immediately by `tsx watch`
- `lib/**` — picked up immediately (shared libs)
- `apps/web/src/**` — picked up by Vite HMR

Adding or removing npm packages requires rebuilding the image:

```powershell
docker compose build --no-cache <service>
docker compose up <service>
```

## Troubleshooting

### Port already in use

```powershell
# Find what's using the port (e.g., 5000)
netstat -ano | findstr :5000
# Kill the process
Stop-Process -Id <PID> -Force
```

### Database connection refused

Make sure the `postgres` container is healthy before starting backend services:

```powershell
docker compose up -d postgres
docker compose ps   # wait for "healthy" status
docker compose up graphql oauth stats game-selection
```

### Image rebuild needed

If you see `MODULE_NOT_FOUND` errors after pulling new code, rebuild:

```powershell
docker compose build --no-cache
```
