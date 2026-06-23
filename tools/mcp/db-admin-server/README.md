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

| Tool                  | Description                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `db_query`            | Read-only SQL. Connects as the SELECT-only `mcp_readonly` role inside a `READ ONLY` txn.                      |
| `db_migration_status` | Applied vs pending diff. Pass local migration filenames; applied are keyed by filename.                       |
| `db_migrate`          | Apply UNMERGED local migrations by sending client-transpiled module source; runs as migration_user. Dev-only. |

### `db_migrate` (remote DDL — handle with care)

`db_migrate` is effectively a remote DDL endpoint. The hosted Lambda cannot see
a developer's local migrations directory, so the **client** transpiles each
pending migration `.ts` to CommonJS with esbuild and POSTs
`{ migrations: [{ name, hash, jsSource }] }` (ordered by timestamp). The server
evaluates each `jsSource` in a constrained `vm` sandbox — a `require` shim
resolving **only** `postgres` and `drizzle-orm[/*]` to the Lambda's bundled
instances — and applies it via `applyMigrationModule`
(`lib/db-client`, the same code path as the local runner; migrations run with
autocommit semantics since LS-8254). Already-applied
migrations are skipped; the run stops on the first failure.

It is defended in depth: the **`mcp/db`** scope, a **dev-only** `NODE_ENV` guard,
payload size/count caps, a strict migration-name regex, the `require` allowlist,
and a `LOGGER` audit of every migration keyed to the calling Cognito principal
(`client_id` / `sub`). The threat model is _developer-authored_ migrations
transported over the wire, not arbitrary third-party code.

Client helper: `src/client/migrate-cli.ts` (run via `tsx`). It reads
`MCP_DB_ADMIN_URL` + `MCP_DB_ADMIN_BEARER` from the environment. The pure
transpile/payload logic lives in `src/client/migrate-client.ts`.

## Environment (set by Terraform — see `terraform/main/lambda-mcp-db.tf`)

- `MCP_COGNITO_ISSUER`, `MCP_COGNITO_AUDIENCE`, `MCP_OAUTH_SCOPES="openid mcp/db"`
- `MCP_READONLY_SECRET_NAME` — Secrets Manager secret `{ username, password }` for `mcp_readonly`
- `DB_HOST` (RDS instance endpoint `host:5432`), `DB_PORT`, `DB_NAME`
- `DB_SECRET_NAME` — migration_user creds (used by `db_migrate`)
- `NODE_ENV` — environment name; `db_migrate` refuses to run unless this is `dev`/`development`

## Build

`vite build` bundles `src/lambda.ts` → `dist/index.js` (CJS, node20), with
`@aws-sdk/client-secrets-manager` left external (provided by the Lambda runtime).
