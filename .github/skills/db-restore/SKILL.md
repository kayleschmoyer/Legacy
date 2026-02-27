---
name: db-restore
description: 'Download the latest production database dump from S3 and restore it into the local Docker PostgreSQL container; use when initializing a fresh local environment with real data or refreshing stale local data. Requires AWS SSO access.'
---

# Skill: Restore Production Dump into Local Docker

## Overview

Downloads `latest.dump` from S3 and restores it into the `ls-postgres` Docker container, replacing the local `legacy_sports_dev` database with a copy of production data. No local PostgreSQL installation required — uses `docker exec pg_restore`.

## When to Use

- Setting up a fresh local dev environment with real data
- Refreshing a stale local database
- Before running `make db-dump-dev` to create a scrubbed seed

## Prerequisites

- AWS SSO authenticated: `aws sso login`
- Docker Desktop running
- Postgres container running: `docker compose up -d postgres`

## Steps

### Run the restore

```powershell
make db-restore
```

Prompts for confirmation before dropping the local database, then:

1. Downloads `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/latest.dump` → `resources/dev.dump`
2. `docker cp` the dump into `ls-postgres:/tmp/restore.dump`
3. Drops and recreates `legacy_sports_dev`
4. Runs `pg_restore -j 4 -Fc` (parallelized, ~3-5s)
5. Cleans up temp file

### Skip S3 download (reuse existing local dump)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-restore.ps1 -SkipDownload
```

### Custom dump file

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-restore.ps1 -DumpFile resources\my-backup.dump
```

## After Restore

Run migrations to apply any schema changes that are ahead of the dump:

```powershell
make db-migrate
```

## Key Details

| Detail        | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Container     | `ls-postgres`                                                  |
| Local DB      | `legacy_sports_dev`                                            |
| Local DB user | `legacy_sports`                                                |
| Dump source   | `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/latest.dump` |
| Local cache   | `resources/dev.dump` (gitignored)                              |

## Troubleshooting

**AWS SSO expired**

```powershell
aws sso login
```

**Postgres container not running**

```powershell
docker compose up -d postgres
# wait for healthy, then retry
```

**`pg_restore` exits non-zero with warnings**
This is normal. `pg_restore` exits 1 for non-fatal warnings (e.g. missing extensions, role mismatches). Check the output — if the restore completed, it succeeded.

**Migrations fail after restore**
The dump may be older than the latest migration files. Run `make db-migrate` — it will apply pending migrations on top of the restored data.

## Related Skills

- [db-dump](../db-dump/SKILL.md) — create a new dump from RDS
- [db-dump-dev](../db-dump-dev/SKILL.md) — scrub and package as commitable seed
- [db-restore-dev](../db-restore-dev/SKILL.md) — restore without AWS access
