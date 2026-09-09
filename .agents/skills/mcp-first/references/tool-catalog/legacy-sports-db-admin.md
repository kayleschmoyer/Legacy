# Database MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/db-admin-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Read-only SQL and migration status/apply against the dev RDS over HTTPS — no SSM tunnel required.

Hosted connector only — no local stdio process. 4 tools.

---

### `db_execute`

Run a single ad-hoc DML statement (INSERT/UPDATE/DELETE) against the dev database over HTTPS (no SSM tunnel), for data an agent needs to write directly and cannot reach through a versioned migration (db_migrate) or the read-only public schema (db_query) — e.g. app_internal.* rows. Connects as the DML-only mcp_write Postgres role (INSERT/UPDATE/DELETE/SELECT on public + app_internal, no CREATE/ALTER/DROP grants at all), so DDL is rejected by the database engine. Exactly one statement per call (no ";"-stacked queries). Structure is trusted verbatim (console for mcp/db-scoped agents, not user input) — bind values via params ($1/$2/...), never interpolate into sql. Returns any RETURNING rows plus row count. Dev-only, like db_migrate.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `sql` | string | **required** | — | Single DML statement (INSERT / UPDATE / DELETE), optionally with a RETURNING clause. |
| `params` | any[] |  | — | Bind values for $1/$2/... placeholders in the statement. |
| `format` | enum |  | — | Output format (default: json). |

### `db_migrate`

Apply UNMERGED local-branch migrations to the dev database over HTTPS (no SSM tunnel). Send { migrations: [{ name, hash, tsSource }] } ordered by timestamp — tsSource is raw .ts source, transpiled server-side (no client esbuild step); jsSource (pre-transpiled CJS) also still works — exactly one per migration. ASYNC: validates, persists a job row, fires a worker, returns { jobId, status: "running" } — poll db_migration_status({ jobId }) every ~5s until terminal (done/failed/orphaned) for the result ({ applied, appliedNames, skipped, success, failed?, error? }). Already-applied migrations are skipped and the run stops on the first failure, so re-submitting after a failure is resume-safe. A running job is joined, not duplicated. Dev-only.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `migrations` | object[] | **required** | — | Pending migrations to apply, ordered by timestamp. |

### `db_migration_status`

Report which migrations are applied vs pending on the dev database, over HTTPS (no SSM tunnel). Pass the local migration filenames (e.g. "20260616_120000_add_x.ts") so the server can compute the pending set; applied migrations are keyed by filename in drizzle.__drizzle_migrations. Alternatively pass jobId (from db_migrate) to poll an async migration job: returns { jobId, status: running|done|failed|orphaned, terminal, ... } and, once terminal, the full db_migrate result (applied, appliedNames, skipped, success, failed?, error?).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `localMigrationNames` | string[] |  | — | Local migration filenames to diff against applied migrations. |
| `jobId` | string |  | — | Async db_migrate job id to poll instead of the applied/pending diff. |

### `db_query`

Execute a read-only SQL query against the dev database over HTTPS. Connects as a SELECT-only Postgres role (writes/DDL rejected engine-side); a server-side statement_timeout (default 30s) bounds runaway queries. SQL runs verbatim for trusted mcp/db-scoped agents, not user input. Returns { rows, rowCount, columns }; failures return { error: statement_timeout|sql_error|upstream_unavailable, elapsedMs, message, hint }.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `query` | string | **required** | — | Read-only SQL query (SELECT / EXPLAIN / SHOW / WITH). |
| `format` | enum |  | — | Output format (default: json). |

