---
name: db-dump
description: 'Dump the live AWS RDS PostgreSQL database to a compressed binary file and upload it to S3; use when refreshing the production snapshot stored in S3 or creating a local cache of the live database. Requires AWS SSO access.'
---

# Skill: Dump RDS Database to S3

## Overview

Dumps the live `legacy-sports-dev-postgres` RDS instance to a compressed custom-format (`-Fc`) pg_dump file, uploads it to S3 with a timestamped key, and updates the `latest.dump` alias. No local PostgreSQL installation required — uses `docker run postgres:16-alpine`.

## When to Use

- Refreshing the production snapshot before creating a scrubbed dev seed
- Creating a local backup before a risky migration
- Debugging production data locally

## Prerequisites

- AWS SSO authenticated: `aws sso login`
- Docker Desktop running
- `.env` present with `DB_USER` and `DB_PASSWORD` (run `pnpm run sync-env` if missing)

## Steps

### Run the dump

```powershell
make db-dump
```

This calls `scripts/db-dump.ps1` which:

1. Reads `DB_USER` / `DB_PASSWORD` from `.env`
2. Runs `pg_dump` via `docker run postgres:16-alpine` (no local psql needed)
3. Outputs `resources/dev.dump` (~11 MB compressed)
4. Uploads to `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/<timestamp>.dump`
5. Updates `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/latest.dump`

### Skip S3 upload (local only)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-dump.ps1 -SkipUpload
```

### Custom output file

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-dump.ps1 -DumpFile resources\my-backup.dump
```

## S3 Layout

```
s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/
  latest.dump              <- always points to most recent
  2026-02-26_14-30.dump    <- timestamped archive
  2026-02-20_03-06.dump
```

## Key Details

| Detail       | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| RDS instance | `legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com` |
| RDS database | `postgres` (the actual DB name on the instance)                       |
| Format       | Custom binary (`-Fc -Z9`)                                             |
| Local output | `resources/dev.dump` (gitignored)                                     |
| S3 bucket    | `legacy-sports-dev-lambdas-cca20ad9`                                  |
| S3 prefix    | `db-dumps/`                                                           |

## Troubleshooting

**AWS SSO expired**

```powershell
aws sso login
```

**Docker not running**
Start Docker Desktop, then retry.

**`pg_dump` connection error**
Verify the RDS instance is running and your IP is in the security group. The RDS host must be reachable from your machine (not inside Docker container networking).

## Related Skills

- [db-restore](../db-restore/SKILL.md) — restore the S3 dump into local Docker
- [db-dump-dev](../db-dump-dev/SKILL.md) — scrub PII and create the repo seed dump
