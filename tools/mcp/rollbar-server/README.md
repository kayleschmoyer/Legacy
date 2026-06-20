# rollbar-server

> **Server ID:** `legacy-sports-rollbar` (hosted HTTP)

Read-only access to [Rollbar](https://rollbar.com) error tracking data, so agents can triage production errors during debugging workflows the same way they read Jira/GitHub/CI data.

This is the read complement to the project's existing **write** integration (`lib/rollbar` for error reporting, `lambdas/rollbar-discord` for alerting). It performs **no writes** — there are no resolve/mute/delete tools.

## Tools

- **rollbar_auth_status** — Check whether the read token is configured. Call first.
- **rollbar_list_items** — List items (deduplicated errors), filterable by status, level, environment, or search query.
- **rollbar_get_item** — Fetch one item by internal `id` or by its per-project `counter` (the number in the item URL).
- **rollbar_list_occurrences** — List recent occurrences (instances) of an item, each with a truncated message summary.
- **rollbar_top_active_items** — The dashboard "top active items" view, each with its summed recent occurrence count.

## Deployment

The server runs as a hosted Lambda + HTTP API Gateway (LS-8142), mirroring the LS-8116/8117/8119 db-admin pattern. Callers reach it via the API Gateway with a Cognito-issued bearer carrying the `mcp/rollbar` scope.

Local Claude Code resolves the server from `~/.claude.json#/mcpServers` after running:

```bash
node scripts/mcp-auth.mjs --force
```

That command reads the invoke URL from SSM (`/legacy-sports-<env>/mcp/rollbar/api-url`) and provisions the headersHelper that mints a per-connect bearer.

## Authentication

The Rollbar **read-scope** project access token is held in AWS Secrets Manager at `<env>/rollbar-read-access-token` and fetched by the Lambda at cold-start via `ROLLBAR_READ_TOKEN_SECRET_NAME`. Seed it once per environment:

```bash
aws secretsmanager put-secret-value \
  --secret-id dev/rollbar-read-access-token \
  --secret-string <your-rollbar-read-token>
```

Generate the token in **Rollbar → Project Settings → Access Tokens** — choose (or create) a token with the **`read`** scope. It is distinct from the `post_server_item` / `post_client_item` write tokens used by `lib/rollbar`.

Local unit tests and any direct invocation can also supply the token via the `ROLLBAR_READ_ACCESS_TOKEN` env var, which is checked before Secrets Manager.

## Response format

Responses use `@legacy-sports/mcp-format` for token efficiency — flat lists render as compact Markdown tables (pruned to the columns agents read), single items as minified JSON, and occurrence message bodies are truncated.
