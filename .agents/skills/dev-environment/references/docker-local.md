# Local Docker Compose Stack

The full local dev stack runs via Docker Compose and replaces all AWS services. It includes PostgreSQL, all four Lambda backends, the Vite web app, and a run-and-exit CLI service. It is the only full-stack path in environments without AWS credentials (cloud agents).

## Services

Ports are listed once in the [canonical port map](../SKILL.md#port-map-canonical--link-here-do-not-restate).

| Container           | Compose service  | Purpose                                                  |
| ------------------- | ---------------- | -------------------------------------------------------- |
| `ls-postgres`       | `postgres`       | PostgreSQL 16 database (replaces AWS RDS)                |
| `ls-migrate`        | `migrate`        | Runs Drizzle migrations on startup, exits 0              |
| `ls-graphql`        | `graphql`        | Apollo GraphQL API (`lambdas/db`)                        |
| `ls-oauth`          | `oauth`          | OAuth proxy (`lambdas/oauth-proxy`)                      |
| `ls-stats`          | `stats`          | Stats Lambda (`lambdas/stats-lambda`)                    |
| `ls-game-selection` | `game-selection` | Game selection Lambda (`lambdas/game-selection`)         |
| `ls-web`            | `web`            | Vite web app (`apps/web`, `--host 0.0.0.0`)              |
| `ls-cli`            | `cli`            | CLI (run-and-exit via `docker compose run --rm cli ...`) |

## Quick start

Preconditions: Docker running, and a `.env` file present (compose refuses to start without it) — bootstrap per OS via the [environment bootstrap table](../SKILL.md#environment-bootstrap-per-os).

```bash
make docker-up
# or: docker compose up -d --build
```

Starts everything detached, builds images if needed, and runs migrations before backend services start. Wait ~30s for the Vite/Tamagui cold start, then:

- Web app: http://localhost:4200
- GraphQL: http://localhost:5000/graphql
- OAuth: http://localhost:5001/oauth

Subset startup:

```bash
docker compose up -d postgres graphql oauth   # backend only
docker compose up -d postgres                 # just the database
```

## Stopping

```bash
docker compose down      # stop containers, keep data
docker compose down -v   # stop + wipe the database volume (full reset)
```

## Logs, rebuilds, restarts

```bash
docker compose logs -f                     # all services, follow
docker compose logs graphql --tail=50      # one service
docker compose ps                          # container status
docker inspect ls-postgres --format "{{.State.Health.Status}}"

# After package.json or Dockerfile.dev changes:
docker compose build --no-cache [service]
docker compose up -d --build graphql       # rebuild + restart one service

docker compose restart web                 # plain restart
```

Source directories are volume-mounted (`lambdas/*/src`, `apps/web/src`, `lib/`), so code edits hot-reload without a rebuild; dependency changes need a rebuild.

## Migrations

The `migrate` service applies migrations automatically on `docker compose up`. Manually:

```bash
docker compose run --rm migrate
# or from the host: make db-migrate
```

If `migrate` exits non-zero, all backend services refuse to start — `docker compose logs migrate`, fix the migration, then `docker compose up -d`.

## CLI against the stack

```bash
docker compose run --rm cli seed-dev-data --letters a,b
docker compose run --rm cli help
```

Full catalog: [cli-commands.md](cli-commands.md).

## Environment variables

Compose loads two env files, later wins:

```yaml
env_file:
  - .env # real synced secrets (gitignored) — or a copy of .env.example when AWS is unavailable
  - .env.docker # committed docker overrides: local DB creds, service URLs, dev auth secrets
```

Key `.env.docker` overrides (read the file for the full set):

- `USE_LOCAL_CREDENTIALS=true` — skip AWS Secrets Manager / SSL for local postgres
- `DB_HOST=postgres:5432`, `DATABASE_URL=postgresql://legacy_sports:legacy_sports_dev@postgres:5432/legacy_sports_dev`
- `VITE_GRAPHQL_HOST=http://localhost:5000/graphql`, `VITE_OAUTH_PROXY_URL=http://localhost:5001/oauth`

## Troubleshooting

**Web not loading on 4200** — Vite has a ~11s+ cold start from Tamagui compilation. Wait and refresh.

**`Cannot connect to database` in graphql/oauth logs** — confirm `USE_LOCAL_CREDENTIALS=true` is in effect (i.e. `.env.docker` loaded) and that `migrate` completed: `docker compose ps -a`, `docker compose logs migrate`.

**Port already in use** — find the holder, then stop it or change the mapping in `docker-compose.yml`:

```bash
ss -ltnp | grep 5000            # Linux
netstat -ano | findstr :5000    # Windows
```

**Stale image after dependency changes** — `docker compose build --no-cache <service>` then `docker compose up -d <service>`.

**Full reset (nuclear)**:

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

(`make db-restore-dev` re-seeds from the scrubbed dev dump but is Windows-only — see the [OS support matrix](../SKILL.md#os-support-matrix-run-and-operate-targets). On Linux, re-seed with `docker compose run --rm cli seed-dev-data`.)

## Related

- [database](../../database/SKILL.md) — migrations, queries, dev RDS
- [../SKILL.md](../SKILL.md) — port map, per-OS setup, native (non-Docker) startup
