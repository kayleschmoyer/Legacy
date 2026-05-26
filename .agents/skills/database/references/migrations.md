# Database Migrations

## Hard Rules

- **Never claim you cannot run migrations.** If a tool fails, read the error, fix the root cause (Docker down, DATABASE_URL unset, etc.), and retry. Surface the specific error to the user only if you've exhausted the troubleshooting steps below.
- **Never commit a migration file without first successfully applying it locally.**
- **Never edit a previously-landed migration** — write a new one that corrects it.
- **Always run migrations before `make pc`** — pending migrations cause failures.

## Steps

### 1. Pre-flight health check

```
db_check_health()
```

Confirms Docker is running, Postgres is reachable, and the migration runner can connect. Fix any failures here before proceeding.

### 2. Check migration status

```
db_migration_status(worktreePath: "<absolute worktree path>")
```

- `needsMigration: false` → nothing pending; skip to step 5.
- `needsMigration: true` → proceed to step 3.
- Tool unavailable → shell fallback: `pnpm --prefix lib/db-client run db:status`

### 3. Apply migrations

```
db_migrate(worktreePath: "<absolute worktree path>")
```

Confirm the response contains `"applied": N` (N ≥ 0) or `"No new migrations to apply"`. Any other result is a failure — do not proceed to `make pc`.

Shell fallback: `pnpm --prefix lib/db-client run db:up`

### 4. Verify (spot-check)

Confirm the expected tables or columns exist by substituting the literal table name from your migration:

```
db_query(query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'game_football_passing_stats' ORDER BY ordinal_position")
```

Replace `game_football_passing_stats` with the exact table name defined in your migration file.

### 5. Update Drizzle schema models

After applying, update the corresponding model files under `lib/db-client/src/drizzle/public/models/`. Migrations and Drizzle models must stay in sync.

---

## Troubleshooting

| Error                                 | Fix                                                               |
| ------------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL is not set`             | Copy `.env` from main repo root or run `make wt-setup`            |
| `Connection refused` / `ECONNREFUSED` | `docker compose up -d postgres` (from main repo root)             |
| `relation already exists`             | Add `IF NOT EXISTS` guard to the migration's `up()`               |
| `enum label already exists`           | Idempotent — safe to ignore; the value was already added          |
| `Cannot rollback enum value`          | Expected — PostgreSQL can't remove enum values; `down` must throw |
| MCP tool not found                    | Shell fallback: `pnpm --prefix lib/db-client run db:up`           |
| AWS SSO expired (dump/restore only)   | Stop and prompt the user — `aws sso login` is user-only           |

---

## Migration File Rules

| Rule          | Correct                                       | Wrong                                      |
| ------------- | --------------------------------------------- | ------------------------------------------ |
| **Directory** | `lib/db-client/migrations/`                   | `lib/db-client/src/drizzle/migrations/`    |
| **Filename**  | `YYYYMMDD_HHMMSS_name.ts`                     | `0051_name.ts`                             |
| **Exports**   | Named `export const up` / `export const down` | `export default { up, down }`              |
| **Signature** | `up({ db }: { db: PgDatabase<any> })`         | `up(db: NodePgDatabase)`                   |
| **SQL calls** | ``db.execute(`...`)`` (plain string)          | ``db.execute(sql`...`)`` (tagged template) |

> **Why plain string for SQL calls?** The Drizzle `sql` tagged template wraps the statement in a SQL node that breaks PostgreSQL dollar-quote delimiters (`$fn$`) used in function bodies. Migration SQL is developer-written DDL only — no parameterization or external input is involved, so the tagged template's injection-prevention benefit does not apply here. Use plain strings in migrations; use `sql\`...\`` only outside migrations where parameterized queries are needed.

> Full patterns and code examples: [db-migration-patterns-and-operations.md](../../repo-tooling/references/db-migration-patterns-and-operations.md)
