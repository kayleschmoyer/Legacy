# legacy-sports-db-admin (hosted MCP server)

A hosted (Lambda + API Gateway) MCP server that provides **tunnel-free** access
to the dev RDS database. It runs **inside the VPC**, so it reaches RDS directly
over TCP — no SSM port-forward tunnel and no live AWS SSO session at request
time.

This is the only DB MCP server. The previous local stdio `legacy-sports-db`
server has been removed (LS-8143). For fully-offline / local Docker Postgres
operations (migration apply, schema regeneration, dev seed restore) use the
shell commands documented in `.agents/skills/database/SKILL.md`.

## Trust model

`db_query` is a SQL **console** for agents holding the `mcp/db` Cognito scope —
it is not an end-user-facing API. The whole SQL statement IS the input, so
parameterization does not apply (there is no separable "data" boundary). The
boundaries that matter are:

1. **OAuth scope** — `@legacy-sports/mcp-bearer-auth` enforces `mcp/db` on
   every request; jira/github/ci-scoped tokens are rejected.
2. **Engine-enforced role** — connections use the SELECT-only `mcp_readonly`
   Postgres role; writes/DDL are rejected by the engine, not by app code.
3. **READ ONLY transaction** — every query runs inside `sql.begin('READ ONLY', …)`.
4. **Statement timeout** — connections set `statement_timeout` (default 30s,
   `DB_STATEMENT_TIMEOUT_MS` to override) so a runaway query (e.g.
   `SELECT pg_sleep(9999)`) is server-cancelled rather than tying up the Lambda.

This is the trust model of the previous local `tools/mcp/db-server` `db_query`
tool, which has been removed in favour of this hosted server.

## Auth

Same Cognito machine-credential scheme as the `legacy-sports-{jira,github,ci}`
hosted servers. The Lambda validates a bearer carrying the **`mcp/db`** scope
via `@legacy-sports/mcp-bearer-auth`. Clients mint the bearer per-connect with
`scripts/mcp-mint-token.mjs` (headersHelper).

## Tools

| Tool                  | Description                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `db_query`            | Read-only SQL. Connects as the SELECT-only `mcp_readonly` role inside a `READ ONLY` txn.                          |
| `db_migration_status` | Applied vs pending diff (pass local filenames), or async job polling (pass `jobId`).                              |
| `db_migrate`          | Submit UNMERGED local migrations as an async job; poll `db_migration_status({ jobId })` for the result. Dev-only. |
| `db_execute`          | Ad-hoc single-statement DML (INSERT/UPDATE/DELETE). Connects as the DML-only `mcp_write` role. Dev-only.          |

### `db_migrate` (remote DDL — handle with care)

`db_migrate` is effectively a remote DDL endpoint. The hosted Lambda cannot see
a developer's local migrations directory, so the caller POSTs
`{ migrations: [{ name, hash, tsSource }] }` (ordered by timestamp) with the
**raw** `.ts` migration source — the server transpiles it to CommonJS itself
via the TypeScript compiler API (`transpileTsSource`, LS-9582), so no
client-side transpile step is required. `jsSource` (already-transpiled CJS,
e.g. from esbuild) is still accepted for backward compatibility; provide
exactly one of `jsSource`/`tsSource` per migration, never both.

**Async job contract (LS-8563).** The tool validates the payload, persists it
to a job row (`drizzle.__db_migrate_jobs`, created on demand), fires an async
self-invoke of the same Lambda, and returns `{ jobId, status: "running" }`
well inside the API Gateway's ~29s window — heavy DDL (`CREATE INDEX`,
backfills) runs in the worker branch with the function's full ~15-min timeout.
Poll `db_migration_status({ jobId })` (~5s cadence) until `terminal: true`; the
terminal payload carries the same result shape the tool used to return
synchronously (`applied`, `appliedNames`, `skipped`, `success`, `failed?`,
`error?`). A `db_migrate` call while a job is running **joins** it (returns the
existing `jobId`) — a partial unique index allows at most one `running` row. A
worker that dies without a terminal write is reported as `orphaned` once its
`updated_at` heartbeat exceeds the stale cutoff (`DB_MIGRATE_JOB_STALE_MS`,
default 960s) and is reaped to `failed` by the next submit.

The worker evaluates each `jsSource` in a constrained `vm` sandbox — a
`require` shim resolving **only** `postgres` and `drizzle-orm[/*]` to the
Lambda's bundled instances — and applies it via `applyMigrationModule`
(`lib/db-client`, the same code path as the local runner; migrations run with
autocommit semantics since LS-8254). Already-applied migrations are skipped;
the run stops on the first failure, so re-submitting after a mid-batch failure
is resume-safe. The worker's migration connection sets a `statement_timeout`
just below the worker timeout (`DB_MIGRATION_STATEMENT_TIMEOUT_MS`, default
840s) so runaway DDL fails cleanly instead of freezing mid-statement.

It is defended in depth: the **`mcp/db`** scope, a **dev-only** `NODE_ENV` guard,
payload size/count caps, a strict migration-name regex, the `require` allowlist,
and a `LOGGER` audit of every migration keyed to the calling Cognito principal
(`client_id` / `sub`). The threat model is _developer-authored_ migrations
transported over the wire, not arbitrary third-party code. The principal is
persisted on the job row, so the worker's per-migration audit lines stay keyed
to the original caller across the async boundary.

Client helper: `src/client/migrate-cli.ts` (run via `tsx`, outside an MCP
session — needs `MCP_DB_ADMIN_URL` + `MCP_DB_ADMIN_BEARER` in the shell). It
still transpiles locally with esbuild before POSTing (`src/client/migrate-client.ts`)
and polls the job to its terminal state so callers still see one logical
operation; this path is unaffected by LS-9582.

**Agent callers** (MCP session, calling the `db_migrate` tool directly): read
each pending migration file's raw `.ts` source (e.g. with the `Read` tool) and
pass it straight through as `tsSource` — `{ migrations: [{ name, hash,
tsSource }] }`. The server transpiles it itself (LS-9582); no local esbuild
invocation, and no intermediate script, is needed. (The
`scripts/db/transpile-migration.mjs` helper from LS-9203 still works — it
produces a `jsSource`-shaped payload — but `tsSource` is the simpler path now
that the server does the transpile.)

### `db_execute` (ad-hoc data writes)

`db_execute` fills the gap between `db_query` (read-only) and `db_migrate`
(write-capable, but only for versioned schema migrations): a single
INSERT/UPDATE/DELETE statement, run synchronously, no migration file, no
tunnel (LS-9358). It exists because agents repeatedly needed to write or read
rows in `app_internal.*` tables (e.g. `app_internal.subscriptions`,
`app_internal.users`) that aren't exposed via the `public.*` views
`db_query`'s `mcp_readonly` role can see, and aren't schema changes so
`db_migrate` doesn't apply — the only prior path was a fully manual
SSM-tunnel-plus-throwaway-script workaround, which has since become
unworkable entirely (the DB-superuser secret fetch it needs is blocked by
session auto-mode classifiers).

It connects as the **DML-only `mcp_write` role** — INSERT/UPDATE/DELETE/SELECT
on `public` and `app_internal` (current and future tables), **no
CREATE/ALTER/DROP grants at all** — so any DDL is rejected by the database
engine, the same layered model `db_query` uses for its SELECT-only role. A
single-statement guard rejects `;`-stacked queries as a second, app-level
layer. Like `db_migrate`, it is dev-only (`NODE_ENV` guard) and every
statement is logged with the calling Cognito principal (`client_id` / `sub`).

The SQL statement structure itself is executed verbatim (this is a console for
trusted `mcp/db`-scoped agents, not user input) — but always bind values via
`params` (`$1`/`$2`/... placeholders) rather than interpolating them into the
`sql` string, to keep the statement injection-safe.
`db_execute({ sql: "INSERT INTO app_internal.subscriptions
(user_id, tier) VALUES ($1, $2) RETURNING id", params: [userId, tier] })`
returns any `RETURNING` rows plus the affected `rowCount`.

## Environment (set by Terraform — see `terraform/main/lambda-mcp-db.tf`)

- `MCP_COGNITO_ISSUER`, `MCP_COGNITO_AUDIENCE`, `MCP_OAUTH_SCOPES="openid mcp/db"`
- `MCP_READONLY_SECRET_NAME` — Secrets Manager secret `{ username, password }` for `mcp_readonly`
- `MCP_WRITE_SECRET_NAME` — Secrets Manager secret `{ username, password }` for `mcp_write` (used by `db_execute`)
- `DB_HOST` (RDS instance endpoint `host:5432`), `DB_PORT`, `DB_NAME`
- `DB_SECRET_NAME` — migration_user creds (used by `db_migrate`)
- `NODE_ENV` — environment name; `db_migrate`/`db_execute` refuse to run unless this is `dev`/`development`
- `DB_MIGRATION_STATEMENT_TIMEOUT_MS` — worker DDL statement_timeout (default 840000; Terraform wires it to the function timeout minus 60s)
- `DB_WRITE_STATEMENT_TIMEOUT_MS` — `db_execute` connection statement_timeout (default 30000)
- `DB_MIGRATE_JOB_STALE_MS` — heartbeat age past which a `running` job is treated as dead (default 960000)
- `AWS_LAMBDA_FUNCTION_NAME` — runtime-provided; used for the async self-invoke

## Build

`vite build` bundles `src/lambda.ts` → `dist/index.js` (CJS, node22), with
`@aws-sdk/client-secrets-manager` left external (provided by the Lambda runtime).
