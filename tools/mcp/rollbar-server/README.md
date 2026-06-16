# rollbar-server

> **Server ID:** `legacy-sports-rollbar`

Read-only access to [Rollbar](https://rollbar.com) error tracking data, so agents can triage production errors during debugging workflows the same way they read Jira/GitHub/CI data.

This is the read complement to the project's existing **write** integration (`lib/rollbar` for error reporting, `lambdas/rollbar-discord` for alerting). It performs **no writes** — there are no resolve/mute/delete tools.

## Tools

- **rollbar_auth_status** — Check whether the read token is configured. Call first.
- **rollbar_list_items** — List items (deduplicated errors), filterable by status, level, environment, or search query.
- **rollbar_get_item** — Fetch one item by internal `id` or by its per-project `counter` (the number in the item URL).
- **rollbar_list_occurrences** — List recent occurrences (instances) of an item, each with a truncated message summary.
- **rollbar_top_active_items** — The dashboard "top active items" view, each with its summed recent occurrence count.

## Authentication

Set `ROLLBAR_READ_ACCESS_TOKEN` in `.env.local`. Generate it in **Rollbar → Project Settings → Access Tokens** — choose (or create) a token with the **`read`** scope.

This token is intentionally **local-only**: unlike the server-side write token (`dev/rollbar-access-token` in AWS Secrets Manager), the read token is documented in `.env.example` and `terraform/main/secrets.auto.tfvars.example` as a value to keep in `.env.local`, since this server runs over stdio for local dev/agent use and never in a Lambda.

It is distinct from the `post_server_item` / `post_client_item` write tokens used by `lib/rollbar`.

## Response format

Responses use `@legacy-sports/mcp-format` for token efficiency — flat lists render as compact Markdown tables (pruned to the columns agents read), single items as minified JSON, and occurrence message bodies are truncated.

## Run manually

```bash
ROLLBAR_READ_ACCESS_TOKEN=... node --import tsx tools/mcp/rollbar-server/src/index.ts
```
