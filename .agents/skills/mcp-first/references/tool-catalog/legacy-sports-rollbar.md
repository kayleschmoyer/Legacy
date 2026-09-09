# Rollbar MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/rollbar-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Production error triage: list and inspect items and occurrences, and set item status.

Hosted connector only — no local stdio process. 8 tools.

---

### `rollbar_auth_status`

Check if the Rollbar read access token is configured. Call first in any Rollbar workflow; if not configured, the other rollbar_* tools will fail.

_No parameters._

### `rollbar_get_item`

Fetch a single Rollbar item by internal id or by its per-project counter (the number in the item URL). READ-ONLY.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `id` | number |  | integer, > 0 | Internal item id |
| `counter` | number |  | integer, > 0 | Per-project item counter (shown in the Rollbar item URL) |

### `rollbar_get_occurrence`

Fetch full Rollbar occurrence payload (trace_chain, message, custom, logArgs) without truncation, by `occurrenceId` or `itemId` (latest occurrence). READ-ONLY.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `occurrenceId` | number |  | integer, > 0 | Occurrence id from rollbar_list_occurrences. LS-9808: older ids often 400 "not found" — use the list summary instead. |
| `itemId` | number |  | integer, > 0 | Internal item id (fetches latest occurrence) |

### `rollbar_graphql_introspect_type`

Introspect one or more types' fields on a deployed GraphQL endpoint's schema — the MCP-native replacement for hand-rolling `curl -X POST <endpoint> -d '{"query":"{__type(name:\"X\"){fields{name}}}"}'` during schema-mismatch RCA. Use this for the "Cannot query field X on type Y" class of Rollbar errors caused by client/server deploy lag. Pass `compareEnv` to also introspect a second environment and get the field-name differences between them in one call. Pass `typeNames` (1-20) instead of `typeName` to check several types in one call (e.g. confirming a batch of query/mutation/type names all landed after a deploy) — bounded concurrency, output capped at 20k chars. Returns `type: null` / `present: false` (not an error) when a type does not exist on that schema, and surfaces GraphQL application errors (e.g. introspection disabled) in an `errors` field rather than failing the call. READ-ONLY.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `env` | enum | **required** | — | Deployed environment to introspect |
| `typeName` | string |  | min 1 | GraphQL type name to introspect, e.g. "TradeOfferPlayer". Provide this OR `typeNames`, not both. |
| `typeNames` | string[] |  | min 1, max 20 | Batch mode: 1-20 GraphQL type names to introspect concurrently. Provide this OR `typeName`, not both. |
| `compareEnv` | enum |  | — | Optional second environment to introspect and diff field names against (e.g. env: "prod", compareEnv: "dev" to check for deploy lag). Applies to both single and batch mode. |

### `rollbar_list_items`

List Rollbar items (deduplicated errors), optionally filtered by status, level, environment, or a search query. READ-ONLY.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `status` | enum |  | — | Filter by item status (default: all) |
| `level` | enum |  | — | Filter by severity level |
| `environment` | string |  | — | Filter by environment, e.g. "production" |
| `query` | string |  | — | Free-text search over item titles |
| `page` | number |  | integer, > 0 | 1-based page number |
| `perPage` | number |  | integer, > 0 | Results per page (Rollbar default 20, max 100) |

### `rollbar_list_occurrences`

List recent occurrences of a Rollbar item by itemId or counter, each with a truncated summary. READ-ONLY.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `itemId` | number |  | integer, > 0 | Internal item id (not the counter) |
| `counter` | number |  | integer, > 0 | Per-project item counter (in the item URL) |
| `page` | number |  | integer, > 0 | 1-based page number |
| `perPage` | number |  | integer, > 0 | Results per page (Rollbar default 20, max 100) |

### `rollbar_set_status`

Set the status of a Rollbar item by internal id or per-project counter. WRITE — requires a token with the "write" scope (see rollbar_auth_status). Returns the updated item JSON.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `id` | number |  | integer, > 0 | Internal item id |
| `counter` | number |  | integer, > 0 | Per-project item counter (shown in the Rollbar item URL) |
| `status` | enum | **required** | — | Target status for the item |

### `rollbar_top_active_items`

Report the most active items in the project (the dashboard "top active items" view), each with its summed recent occurrence count. READ-ONLY.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `environment` | string |  | — | Filter by environment, e.g. "production" |

