# Database Dump & Restore

## Dump Production Data to S3

### Overview

Dumps the live `legacy-sports-dev-postgres` RDS instance to a compressed custom-format (`-Fc`) pg_dump file, uploads it to S3 with a timestamped key, and updates the `latest.dump` alias. No local PostgreSQL installation required -- uses `docker run postgres:16-alpine`.

### When to Use

- Refreshing the production snapshot before creating a scrubbed dev seed
- Creating a local backup before a risky migration
- Debugging production data locally

### Prerequisites

- AWS SSO authenticated: check with `aws_sso_status()` (MCP) or `aws sts get-caller-identity` — only run `aws sso login` if expired
- Docker Desktop running
- `.env` present with `DB_USER` and `DB_PASSWORD` (run `pnpm run sync-env` if missing)

### Steps

#### Run the dump

```powershell
make db-dump
```

This calls `scripts/db-dump.ps1` which:

1. Reads `DB_USER` / `DB_PASSWORD` from `.env`
2. Runs `pg_dump` via `docker run postgres:16-alpine` (no local psql needed)
3. Outputs `resources/dev.dump` (~11 MB compressed)
4. Uploads to `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/<timestamp>.dump`
5. Updates `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/latest.dump`

#### Skip S3 upload (local only)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-dump.ps1 -SkipUpload
```

#### Custom output file

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-dump.ps1 -DumpFile resources\my-backup.dump
```

### S3 Layout

```
s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/
  latest.dump              <- always points to most recent
  2026-02-26_14-30.dump    <- timestamped archive
  2026-02-20_03-06.dump
```

### Key Details

| Detail       | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| RDS instance | `legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com` |
| RDS database | `postgres` (the actual DB name on the instance)                       |
| Format       | Custom binary (`-Fc -Z9`)                                             |
| Local output | `resources/dev.dump` (gitignored)                                     |
| S3 bucket    | `legacy-sports-dev-lambdas-cca20ad9`                                  |
| S3 prefix    | `db-dumps/`                                                           |

### Troubleshooting

**AWS SSO expired**

```typescript
// MCP tool (preferred) — check before logging in
aws_sso_status();
```

```powershell
# Shell fallback — confirm expired, then login
aws sts get-caller-identity
aws sso login
```

**Docker not running**
Start Docker Desktop, then retry.

**`pg_dump` connection error**
Verify the RDS instance is running and your IP is in the security group. The RDS host must be reachable from your machine (not inside Docker container networking).

## Restore to Local Docker

### Overview

Downloads `latest.dump` from S3 and restores it into the `ls-postgres` Docker container, replacing the local `legacy_sports_dev` database with a copy of production data. No local PostgreSQL installation required -- uses `docker exec pg_restore`.

### When to Use

- Setting up a fresh local dev environment with real data
- Refreshing a stale local database
- Before running `make db-dump-dev` to create a scrubbed seed

### Prerequisites

- AWS SSO authenticated: check with `aws_sso_status()` (MCP) or `aws sts get-caller-identity` — only run `aws sso login` if expired
- Docker Desktop running
- Postgres container running: `docker compose up -d postgres`

### Steps

#### Run the restore

```powershell
make db-restore
```

Prompts for confirmation before dropping the local database, then:

1. Downloads `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/latest.dump` -> `resources/dev.dump`
2. `docker cp` the dump into `ls-postgres:/tmp/restore.dump`
3. Drops and recreates `legacy_sports_dev`
4. Runs `pg_restore -j 4 -Fc` (parallelized, ~3-5s)
5. Cleans up temp file

#### Skip S3 download (reuse existing local dump)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-restore.ps1 -SkipDownload
```

#### Custom dump file

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-restore.ps1 -DumpFile resources\my-backup.dump
```

### After Restore

Run migrations to apply any schema changes that are ahead of the dump:

```powershell
make db-migrate
```

### Key Details

| Detail        | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Container     | `ls-postgres`                                                  |
| Local DB      | `legacy_sports_dev`                                            |
| Local DB user | `legacy_sports`                                                |
| Dump source   | `s3://legacy-sports-dev-lambdas-cca20ad9/db-dumps/latest.dump` |
| Local cache   | `resources/dev.dump` (gitignored)                              |

### Troubleshooting

**AWS SSO expired**

```typescript
// MCP tool (preferred) — check before logging in
aws_sso_status();
```

```powershell
# Shell fallback — confirm expired, then login
aws sts get-caller-identity
aws sso login
```

**Postgres container not running**

```powershell
docker compose up -d postgres
# wait for healthy, then retry
```

**`pg_restore` exits non-zero with warnings**
This is normal. `pg_restore` exits 1 for non-fatal warnings (e.g. missing extensions, role mismatches). Check the output -- if the restore completed, it succeeded.

**Migrations fail after restore**
The dump may be older than the latest migration files. Run `make db-migrate` -- it will apply pending migrations on top of the restored data.

### Restore Dev Seed (No AWS Required)

For developers without AWS access, restore the scrubbed anonymized seed from the repo:

```powershell
make db-restore-dev
```

This restores `resources/dev-seed.dump` (committed via Git LFS) into `ls-postgres`. The seed contains real game/league/player/stats data with PII replaced (usernames -> `user_N`, emails anonymized, passwords zeroed, device tokens redacted).

The script auto-pulls from Git LFS if the file is a pointer stub. After restore, run:

```powershell
make db-migrate   # Apply any pending migrations on top of the seed
```

**If seed file not found**: Install Git LFS (`winget install GitHub.GitLFS ; git lfs install`), then retry.

## Create Scrubbed Dev Seed

After restoring production data, create an anonymized seed for devs without AWS access:

```powershell
make db-restore    # Pull production data first (AWS needed)
make db-dump-dev   # Scrub PII and create seed
```

`make db-dump-dev` calls `scripts/db-dump-dev.ps1` which:

1. Runs `scripts/db-scrub.ps1` -- anonymizes PII (usernames, emails, passwords, device tokens)
2. Runs `pg_dump` -> `resources/dev-seed.dump`
3. Prints commit instructions

### What Gets Scrubbed

| Table                               | Columns                        | Replacement                            |
| ----------------------------------- | ------------------------------ | -------------------------------------- |
| `app_internal.users`                | username, email, password_hash | `user_N`, `user_N@example.com`, zeroed |
| `app_internal.device_tokens`        | token                          | `REDACTED_N`                           |
| `app_internal.notification_history` | entire table                   | `TRUNCATE`                             |

### Commit the Seed

```powershell
git add resources/dev-seed.dump
git commit -m "chore(db): refresh scrubbed dev seed dump"
git push
```

Git LFS handles the binary automatically. To add new PII fields, edit `scripts/db-scrub.ps1` first.
