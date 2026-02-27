---
name: db-dump-dev
description: 'Scrub PII from the local Docker database and create a sanitized dev seed dump committed to the repo via Git LFS; run after db-restore to refresh the anonymous seed that devs without AWS access use. Requires AWS SSO and a prior db-restore.'
---

# Skill: Create Scrubbed Dev Seed Dump

## Overview

Takes the production data already restored into local Docker, anonymizes all PII, dumps it to `resources/dev-seed.dump`, and instructs how to commit it via Git LFS. Once committed, any developer can restore it with `make db-restore-dev` — no AWS credentials needed.

## When to Use

- After pulling a fresh production dump and wanting to share it with non-AWS devs
- Refreshing the committed seed when production data structure has changed significantly
- After adding new PII-containing columns (update `db-scrub.ps1` first)

## Prerequisites

- AWS SSO authenticated (used for the prior `make db-restore` step)
- Docker Desktop running with postgres container healthy
- Production data already restored: `make db-restore`

## Steps

### Full pipeline (most common)

```powershell
# Step 1: Pull latest production data (AWS needed)
make db-restore

# Step 2: Scrub PII and create the seed dump
make db-dump-dev
```

`make db-dump-dev` calls `scripts/db-dump-dev.ps1` which:

1. Verifies `ls-postgres` container is running
2. Runs `scripts/db-scrub.ps1` — anonymizes PII in the local database
3. Runs `pg_dump` inside the container, outputs `/tmp/dev-seed.dump`
4. `docker cp` → `resources/dev-seed.dump`
5. Prints commit instructions

### Commit the seed to the repo

```powershell
git add resources/dev-seed.dump
git commit -m "chore(db): refresh scrubbed dev seed dump"
git push
```

Git LFS handles the binary automatically (configured in `.gitattributes`).

## What Gets Scrubbed

| Table                               | Columns                              | Replacement                                        |
| ----------------------------------- | ------------------------------------ | -------------------------------------------------- |
| `app_internal.users`                | `username`, `email`, `password_hash` | `user_N`, `user_N@example.com`, `repeat('0', 128)` |
| `app_internal.device_tokens`        | `token`                              | `REDACTED_N`                                       |
| `app_internal.notification_history` | entire table                         | `TRUNCATE`                                         |

All other data (leagues, teams, players, stats, matchups, drafts, scoring) is preserved intact.

### Adding new PII fields

Edit `scripts/db-scrub.ps1` and add a scrub statement for the new column before running `make db-dump-dev`.

## Key Details

| Detail       | Value                                    |
| ------------ | ---------------------------------------- |
| Output       | `resources/dev-seed.dump`                |
| Format       | Custom binary (`-Fc -Z9`)                |
| Storage      | Git LFS (committed to repo)              |
| Size         | ~11 MB compressed                        |
| AWS required | Yes (for `make db-restore` prerequisite) |

## Troubleshooting

**Container not running**

```powershell
docker compose up -d postgres
make db-restore   # reload production data first
make db-dump-dev
```

**Scrub errors on optional tables**
The scrub script gracefully skips tables that don't exist. Non-fatal warnings are expected if `device_tokens` or `notification_history` are absent.

**LFS not tracking `dev-seed.dump`**

```powershell
git lfs track "resources/dev-seed.dump"
git add .gitattributes
```

## Related Skills

- [db-restore](../db-restore/SKILL.md) — prerequisite: restore production data first
- [db-restore-dev](../db-restore-dev/SKILL.md) — how other devs use the seed
- [db-schema](../db-schema/SKILL.md) — table/column reference for updating scrub rules
