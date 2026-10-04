# MCP DB role password drift (`mcp_write` / `mcp_readonly`)

Symptom: `db_execute` (or `db_query` / `db_migration_status`) fails with
`password authentication failed for user "mcp_write"` (or `"mcp_readonly"`),
or with `... and the automatic resync failed: ...`. The other role still works
fine, which rules out general DB connectivity or MCP server health and isolates
the fault to one role's credential.

**Since LS-10416 the hosted mcp-db Lambda heals this itself** (see
[Automatic self-heal](#automatic-self-heal-ls-10416)) — a bare `password
authentication failed` should no longer reach an agent. If you still see one,
the self-heal did not run (Lambda not yet redeployed with LS-10416) or failed;
the error text then names the manual fallback below.

## Root cause

`mcp_write` and `mcp_readonly` are each created/updated by a **one-time**
migration:

- [`lib/db-client/migrations/20260902_120100_add_mcp_write_role.ts`](../../../../lib/db-client/migrations/20260902_120100_add_mcp_write_role.ts)
- [`lib/db-client/migrations/20260616_150000_add_mcp_readonly_role.ts`](../../../../lib/db-client/migrations/20260616_150000_add_mcp_readonly_role.ts)

Each migration's `ALTER ROLE ... PASSWORD` statement is seeded from an env var
(`MCP_WRITE_DB_PASSWORD` / `MCP_READONLY_DB_PASSWORD`) read **at the moment the
migration ran**, defaulting to the literal `'CHANGE_ME_IN_PRODUCTION'` if that
env var was unset. Once applied, drizzle records the migration as done in
`drizzle.__drizzle_migrations` and never re-runs it automatically.

Separately, Terraform owns the "real" password: `random_password.mcp_write_db_password`
/ `random_password.mcp_readonly_db_password` in
[`terraform/main/secrets.tf`](../../../../terraform/main/secrets.tf), stored in
the Secrets Manager secret the hosted mcp-db Lambda reads at connect time
(`MCP_WRITE_SECRET_NAME` / `MCP_READONLY_SECRET_NAME`, wired in
[`terraform/main/lambda-mcp-db.tf`](../../../../terraform/main/lambda-mcp-db.tf)).

**These two stores are never linked after the migration's initial run.** The
Lambda's environment only carries the secret's _name_ (used to authenticate AS
the role) — it never carries `MCP_WRITE_DB_PASSWORD`/`MCP_READONLY_DB_PASSWORD`
(the value used to _set_ the role's password), so if the role-creation
migration is ever (re-)applied through the hosted `db_migrate` tool without a
human manually exporting the matching env var first, the ALTER ROLE silently
falls back to the placeholder password. There is no rotation Lambda
linking the two (LS-784); the hosted self-heal below is what links them now. Either path — a placeholder-password migration run, or a later
out-of-band secret rotation — permanently desyncs the live Postgres role from
what the Lambda thinks the password is.

Why `db_migrate` can't self-heal this: its sandboxed migration `require` shim
(`tools/mcp/db-admin-server/src/tools/migrate.ts`, `migrationRequire`) only
resolves `postgres` and `drizzle-orm[/*]` — a migration cannot `require` the
AWS SDK to fetch the current secret value itself, even if it wanted to.

## Automatic self-heal (LS-10416)

[`tools/mcp/db-admin-server/src/db.ts`](../../../../tools/mcp/db-admin-server/src/db.ts)
(`openRolePool`) probes each `mcp_readonly` / `mcp_write` pool with `SELECT 1`
when it is first opened in a Lambda container. On SQLSTATE `28P01`
(invalid_password) it:

1. re-reads the role's secret and refuses unless its `username` matches the role;
2. runs `ALTER ROLE <role> WITH PASSWORD <secret value>` over the
   `DB_SECRET_NAME` connection — the RDS master user `postgres`
   (`rds_superuser`, CREATEROLE) that `db_migrate` already uses, so the heal
   grants the Lambda **no new privilege** (`migration_user` lacks CREATEROLE and
   could not do this);
3. reopens the pool, verifies login, and serves the original tool call.

The heal is logged with `LOGGER.error` ("password drifted from Secrets
Manager"), which forwards to Rollbar — that is the drift alert. If the resync
itself fails, the tool returns `Database unavailable: ... automatic resync
failed: <reason>. Manual fallback: pnpm --prefix lib/db-client run
db:resync-role -- --role <role> --secret-name <secret>`.

Covered triggers: a Terraform `random_password` regeneration (the next cold
container heals), and a fresh-environment migrate that seeds the placeholder
password (the first `db_query`/`db_execute` heals). Not covered: a role password
changed underneath an already-warm container whose pooled connections are
still authenticated — new connections in that container fail until it recycles.
Nothing in the normal workflow does that; if you did it by hand, use the manual
fallback or wait for a cold start.

## Manual fallback

Run [`lib/db-client/src/scripts/resync-mcp-role-password.ts`](../../../../lib/db-client/src/scripts/resync-mcp-role-password.ts)
**locally** (it needs `aws sso login` credentials plus DB network access —
neither is available in a hosted/cloud agent session):

```bash
pnpm --prefix lib/db-client run db:resync-role -- --role mcp_write --secret-name <secret-id-or-arn>
```

Find `<secret-id-or-arn>` (the same value wired into the Lambda) via:

```bash
aws lambda get-function-configuration --function-name <env>-legacy-sports-mcp-db \
  --query "Environment.Variables.MCP_WRITE_SECRET_NAME"
```

The script fetches the secret's current value, verifies its `username` matches
`--role` (refuses to proceed on a mismatch), `ALTER ROLE`s the live Postgres
role to that password via the privileged migration-user connection, and
self-verifies by reconnecting as the target role. No Lambda redeploy is
needed — its connection pool reconnects with the corrected password on the
next cold `db_execute`/`db_query` call.

After running it, confirm end-to-end with the actual MCP tool (`db_execute`
for `mcp_write`, `db_query` for `mcp_readonly`) using a harmless, reversible
statement (e.g. `SELECT 1`).

## Preventing recurrence

Do not re-run `20260902_120100_add_mcp_write_role.ts` or
`20260616_150000_add_mcp_readonly_role.ts` through `db_migrate` (or any path)
without first exporting the matching `MCP_WRITE_DB_PASSWORD` /
`MCP_READONLY_DB_PASSWORD` env var to the _current_ Secrets Manager value —
otherwise the ALTER ROLE silently reapplies the placeholder password. These
migration files are landed and immutable (`scripts/check-migration-immutability.js`),
so the hosted self-heal above — not an edit to them — is the durable fix; it
repairs the placeholder password on first use anyway.
