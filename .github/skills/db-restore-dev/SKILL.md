---
name: db-restore-dev
description: 'Restore the scrubbed anonymized dev seed dump into the local Docker PostgreSQL container without requiring AWS access; use when onboarding a new developer or when AWS credentials are unavailable. Requires git lfs pull first.'
---

# Skill: Restore Dev Seed (No AWS Required)

## Overview

Restores `resources/dev-seed.dump` — a scrubbed, anonymized snapshot committed to the repo via Git LFS — into the local `ls-postgres` Docker container. No AWS credentials needed.

The seed contains real game/league/player/stats data with all user PII replaced:

- `username` → `user_N`
- `email` → `user_N@example.com`
- `password_hash` → zeroed
- `device_tokens` → `REDACTED_N`
- `notification_history` → truncated

## When to Use

- Onboarding a new developer without AWS access
- Working offline or in an environment without AWS SSO
- Getting a clean, consistent dev database state quickly

## Prerequisites

- Docker Desktop running
- Postgres container running: `docker compose up -d postgres`
- Git LFS installed: `git lfs version`

## Steps

### 1. Pull the seed dump from Git LFS

```powershell
git lfs pull
```

This downloads `resources/dev-seed.dump` (~11 MB) from the LFS store.

### 2. Restore

```powershell
make db-restore-dev
```

Prompts for confirmation, then:

1. Verifies `resources/dev-seed.dump` exists (prompts `git lfs pull` if missing)
2. `docker cp` into `ls-postgres:/tmp/restore.dump`
3. Drops and recreates `legacy_sports_dev`
4. Runs `pg_restore -j 4 -Fc`
5. Cleans up

### 3. Apply any pending migrations

```powershell
make db-migrate
```

## Key Details

| Detail            | Value                                          |
| ----------------- | ---------------------------------------------- |
| Seed file         | `resources/dev-seed.dump` (Git LFS, committed) |
| Container         | `ls-postgres`                                  |
| Local DB          | `legacy_sports_dev`                            |
| AWS required      | No                                             |
| Contains real PII | No — anonymized                                |

## Troubleshooting

**Seed file not found / appears as LFS pointer text**

```powershell
git lfs pull
```

**Git LFS not installed**

```powershell
# Windows — install via winget or download from git-lfs.com
winget install GitHub.GitLFS
git lfs install
git lfs pull
```

**Postgres container not running**

```powershell
docker compose up -d postgres
```

**`pg_restore` warnings**
Non-fatal. Check output for errors — if restore completed, it succeeded.

## Related Skills

- [db-dump-dev](../db-dump-dev/SKILL.md) — refresh the seed from production (AWS needed)
- [db-restore](../db-restore/SKILL.md) — restore full production dump (AWS needed)
