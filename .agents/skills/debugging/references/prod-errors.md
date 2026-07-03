# Production Error Triage (Rollbar)

Runbook for investigating errors reported from deployed code. Rollbar is this repo's only error-reporting destination (the Sentry-era `lib/sentry` no longer exists; server + web + native all report through `lib/rollbar`). This file is the single home for the **Rollbar tool surface** and the **error-classification convention** — link here, do not restate.

## Tool surface

The hosted `legacy-sports-rollbar` MCP server (source: `tools/mcp/rollbar-server/src/lambda.ts`) exposes:

| Tool                       | Kind      | Use for                                                                                                                              |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `rollbar_auth_status`      | read      | Call **first** in any Rollbar workflow; other tools fail if not configured                                                           |
| `rollbar_top_active_items` | read      | The dashboard "top active items" view; optional `environment` filter                                                                 |
| `rollbar_list_items`       | read      | Filter by `status` / `level` / `environment` / free-text `query`; paginated                                                          |
| `rollbar_get_item`         | read      | One item by internal `id` OR per-project `counter` (the number in the item URL)                                                      |
| `rollbar_list_occurrences` | read      | Recent occurrences of an item by internal `itemId` — the actual payloads                                                             |
| `rollbar_get_occurrence`   | read      | One occurrence's **full untruncated** `data.body` by `occurrenceId` (or latest via `itemId`) — use when `list_occurrences` truncates |
| `rollbar_set_status`       | **write** | Set `active` / `resolved` / `muted` / `archived`; needs a write-scope token                                                          |

**Environment names differ by layer** — server items resolve `ROLLBAR_ENVIRONMENT` → `NODE_ENV` → `'development'` (`getRollbarConfigFromEnv` in `lib/rollbar/src/lib/rollbar.node.ts`); Terraform sets `NODE_ENV = var.environment` (default `dev`) on every Lambda and nothing sets `ROLLBAR_ENVIRONMENT`, so deployed **Lambda items carry `environment: "dev"`** (the single AWS environment is dev-labeled even though it serves the live product). Web items use build-time `NODE_ENV` (`getRollbarConfigFromEnv` in `rollbar.web.ts`), so deployed **web-client items carry `environment: "production"`**.

## Triage workflow

1. `rollbar_auth_status()` — stop and surface the `fallback` hint if not configured.
2. `rollbar_top_active_items()` — pick the item(s) to work. Filter by the layer you're hunting: `environment: "production"` for the deployed web client, `environment: "dev"` for deployed Lambdas (see [Tool surface](#tool-surface) for why they differ).
3. `rollbar_get_item(counter: <N>)` then `rollbar_list_occurrences(itemId: <id>)` — read real payloads before forming a hypothesis. Evidence-first, per [SKILL.md](../SKILL.md#core-methodology).
4. Classify the item:
   - **Our defect** → run the [fix-problem](../../fix-problem/SKILL.md) / [bug-fixing](bug-fixing.md) flow. Every fix ships with a regression test.
   - **Misclassified expected condition** (user input, missing resource surfacing as a generic `Error`) → reclassify using the convention below; that IS the fix.
   - **Third-party noise** (Google GIS script, browser extensions, ad blockers) → filter via `checkIgnore`, don't chase. See [Client-side noise](#client-side-web-rollbar-noise).
5. If the Rollbar payload lacks the server-side story (what the resolver/cron actually did, request-scoped context, suspected swallowed errors) → pivot to [cloudwatch-archaeology](../../cloudwatch-archaeology/SKILL.md). Rollbar tells you _that_ it broke; CloudWatch tells you _what the server did around it_.
6. After the fix is merged **and deployed**, `rollbar_set_status(counter: <N>, status: "resolved")`. Use `muted` only for accepted noise with a filter ticket.

## Error-classification convention

Established by the June 2026 Rollbar-noise cluster (LS-8222, LS-8223, LS-8226, LS-8227, LS-8239, LS-8098, LS-8276, LS-8283; root incident LS-1948). Three rules:

### 1. Expected conditions get typed errors, never plain `Error`

`lambdas/db/src/schema/graphql-errors.ts` is the constructor home:

| Constructor            | `extensions.code`  | Throw when                                   |
| ---------------------- | ------------------ | -------------------------------------------- |
| `AuthenticationError`  | `UNAUTHENTICATED`  | JWT missing / expired / malformed            |
| `ForbiddenError`       | `FORBIDDEN`        | Authenticated but lacks role / membership    |
| `PremiumRequiredError` | `PREMIUM_REQUIRED` | Premium-gated feature without entitlement    |
| `UserInputError`       | `BAD_USER_INPUT`   | Invalid or conflicting user input            |
| `GameUnavailableError` | `GAME_UNAVAILABLE` | Feature temporarily unavailable (data state) |
| `NotFoundError`        | `NOT_FOUND`        | Requested resource does not exist            |

These never reach Rollbar by construction: resolver catch blocks re-throw `error instanceof GraphQLError` as-is (so `LOGGER.error` is never hit), and `checkIgnore` in `lib/rollbar/src/lib/rollbar.node.ts` drops client-facing GraphQL errors that arrive by any other path (LS-8144). A "League X not found" firing as a generic `Error` in Rollbar is a classification bug — fix it by switching to the typed constructor (LS-8223's pattern), not by filtering.

Note: `lambdas/game-selection` has its own `UserInputError` class in `lambdas/game-selection/src/errors.ts` (it is not a GraphQL service).

### 2. Pass `Error` objects to `LOGGER.error`, never strings

`RollbarOutputDestination.write` (in `lib/rollbar/src/lib/RollbarOutputDestination.ts`) forwards the **first `Error` argument** to Rollbar (falling back to an `Error` found one level inside a plain-object argument, so `LOGGER.error('msg', { error })` is rescued); if no `Error` is anywhere in the args it synthesizes `new Error(entry.message)` — the real stack trace is lost and unrelated failures group under one message string (LS-8222). Pattern:

```ts
// Wrong — stack lost, grouping broken
LOGGER.error('Failed to start draft:', errorMessage);

// Right
LOGGER.error(
  'Failed to start draft:',
  error instanceof Error ? error : new Error(errorMessage),
);
```

### 3. Destination-only capture

The deliberate reporting path is `LOGGER.error` / `LOGGER.fatal` → `RollbarOutputDestination`; uncaught exceptions and rejections are forwarded through that same path by the global handlers in `lib/logging/src/server.ts`. Rollbar's own `captureUncaught` / `captureUnhandledRejections` hooks are constructor-default **off** (`?? false` in `initWithToken`, `rollbar.node.ts`) because running an extra capture route alongside the LOGGER path triple-reported (LS-1948). Note: `getRollbarConfigFromEnv()` currently returns them `true`, so deployed Lambdas do run the native hooks as a crash backstop — `checkIgnore` (LS-8144) still drops client-facing GraphQL errors on that route. Two preconditions:

- Before adding a manual `rollbar.captureError(...)` next to a `LOGGER.error` call: confirm the destination doesn't already forward it (it does — that duplicate callback was the LS-1948 bug; `withRollbar` also dedupes via its `reportedErrors` WeakSet).
- Before touching capture config: the LOGGER → destination path must still surface future occurrences (see [SKILL.md Critical Rules](../SKILL.md#critical-rules) — never fix noise by silencing the reporter; LS-8239 is the cautionary tale of a masked real failure).

## Client-side (web) Rollbar noise

Config home: `lib/rollbar/src/lib/rollbar.web.ts`.

1. **Rate limits first** — `maxItems: 50` per session, `itemsPerMinute: 25`. Noisy third-party warnings can exhaust these and **silently drop real errors**.
2. **`checkIgnore` filter** — existing filters: `AbortError`, `Failed to fetch`, WebSocket error/closed, ResizeObserver loop. New classes of browser noise get added here (with the LS ticket in a comment), not "fixed".
3. **HTTP 429 from api.rollbar.com** = server-side account rate limiting — distinct from the client caps above. Find what's flooding Rollbar before blaming the service.
4. **Third-party script errors are not actionable** — verify the error originates in our bundle before investigating.

## Provenance and maintenance

Created 2026-07-02 from the skills audit (debugging-playbook refresh); encodes the June 2026 error-classification commit cluster. Re-verify volatile facts:

- Tool names/params: `grep -n "server.tool(" -A2 tools/mcp/rollbar-server/src/lambda.ts`
- Typed constructors: `Read lambdas/db/src/schema/graphql-errors.ts`
- Capture flags + server checkIgnore: `grep -n "captureUncaught\|checkIgnore" lib/rollbar/src/lib/rollbar.node.ts`
- Lambda environment label: `grep -n "NODE_ENV\|ROLLBAR_ENVIRONMENT" terraform/main/lambda-graphql.tf`
- Client caps + filters: `grep -n "maxItems\|itemsPerMinute\|checkIgnore" lib/rollbar/src/lib/rollbar.web.ts`
- Destination Error-selection behavior: `Read lib/rollbar/src/lib/RollbarOutputDestination.ts`
