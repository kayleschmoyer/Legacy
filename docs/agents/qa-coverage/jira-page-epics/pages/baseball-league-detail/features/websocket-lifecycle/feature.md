# Feature: League Realtime WebSocket Lifecycle

**Jira:** LS-7625 (GAP-001)
**Page:** `baseball-league-detail` (Epic LS-5259)
**Platforms:** web
**Entitlement:** all (authenticated)

## Description

The Baseball League Detail page (`/baseball/league/:id`) maintains a single
shared WebSocket connection that pushes live updates into the league
experience — draft lifecycle transitions, matchup score refreshes, chat
messages, trade/waiver activity, and subscription changes. Child components
(chat, roster, matchup, etc.) subscribe to this one socket via
`useLeagueWebSocket` rather than opening their own connections.

This feature documents the **connection lifecycle** itself — how the socket is
created, authenticated, torn down, reconnected, and silently disabled — as
distinct from the individual event handlers already covered by the other tab
features.

### Behaviors

1. **Connect on mount** — when the user is authenticated, `websocketUrl` is
   non-empty, and `leagueId` is a valid number, `useLeagueWebSocketLifecycle`
   constructs a `WebSocketClient` (passing the in-memory JWT as `token`,
   `leagueId`, and `viewContext: 'league'`, with `autoConnect: false`), wires
   `connected` / `disconnected` / `error` listeners, and calls `connect()`.

2. **Disconnect / dispose on unmount** — the effect cleanup calls
   `wsClient.dispose()` and resets `client` / `connected` state so the socket
   is not leaked when the user leaves the page.

3. **Reconnect on token refresh** — the lifecycle effect's dependency array is
   `[leagueId, isAuthenticated, authToken]`. When the in-memory JWT rotates
   (a token refresh), the cleanup disposes the previous client and the effect
   body creates + connects a brand-new `WebSocketClient` carrying the updated
   token. This keeps the authenticated socket valid across token rotations.

4. **Reconnect-after-drop → league refetch** — `useLeagueWebSocket` fires its
   `onReconnect` callback only when a `connected` event follows a prior
   `connected` (a drop-and-reconnect, tracked by a local `wasConnected` flag).
   `LeagueWSPageHandler` wires `onReconnect` to `refetchLeague()` so league
   data that changed while the socket was down is refreshed once the socket
   comes back (LS-7625 decision — see [Related](#related)).

5. **Draft-started → league refetch** — a `DRAFT_STARTED` notification fires
   `onDraftStarted`, wired to `refetchLeague()`, transitioning the draft-status
   badge (e.g. Pre-Draft → Draft Queued).

6. **Disabled when URL is empty** — `env.websocketUrl` resolves to `''` when
   `VITE_WEBSOCKET_URL` is unset (production misconfiguration) or in E2E builds.
   With an empty URL the lifecycle effect returns early: no client is
   constructed and `connected` stays `false`, so the page degrades silently
   rather than erroring. Under Playwright (`navigator.webdriver === true`) a
   `window.__e2eWsUrl` runtime override supplies a non-empty URL so hermetic
   tests can exercise the connected paths (esbuild would otherwise constant-fold
   the empty string and dead-code-eliminate the guard).

## Source

Extracted from finding:
`docs/agents/qa-coverage/jira-page-epics/pages/baseball-league-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`

## Implementation

| Concern                                                   | File                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Page wiring (`LeagueWSPageHandler`, provider)             | `apps/web/src/pages/baseball/league-detail-v2/LeagueDetailPageV2.tsx`  |
| Socket lifecycle (create / connect / dispose / reconnect) | `apps/web/src/hooks/useLeagueWebSocketLifecycle.ts`                    |
| Event subscription + `onReconnect` semantics              | `apps/web/src/hooks/useLeagueWebSocket.ts`                             |
| Shared client context                                     | `apps/web/src/context/LeagueWebSocketContext.tsx`                      |
| `websocketUrl` resolution + E2E override                  | `apps/web/src/config/environment.ts`                                   |
| Transport (out of scope for this feature)                 | `lib/websocket-client` (`WebSocketClient` reconnect/backoff internals) |

**GraphQL query used for refetch:** `useGetLeagueByIdQuery` — its `refetch`
(`refetchLeague`) is invoked by the `onDraftStarted`, `onSubscriptionUpdated`,
and `onReconnect` handlers.

## Test Coverage

### Unit tests

File: `apps/web/src/hooks/useLeagueWebSocketLifecycle.spec.ts`

- Creates and connects a `WebSocketClient` on mount
- Disposes the client on unmount
- Returns `connected: true` when the socket emits `connected`
- Returns `connected: false` after the socket emits `disconnected`
- Does not create a client when `isAuthenticated` is false
- Returns a null client before the effect fires (no url / auth)
- **Reconnect on token refresh (LS-7625):** changing `authToken` between
  renders disposes the previous client and creates + connects a new one with
  the updated token
- **Disabled URL (LS-7625):** when `env.websocketUrl` is `''`, no
  `WebSocketClient` is created and `connected` stays false even though
  `isAuthenticated` is true

File: `apps/web/src/hooks/useLeagueWebSocket.spec.ts`

- Does not fire `onReconnect` on the initial connect
- **Reconnect-after-drop (LS-7625):** fires `onReconnect` when `connected`
  follows a prior `connected`
- Fires `onDraftStarted` when a `DRAFT_STARTED` notification arrives
- Does not subscribe (and does not throw) when there is no client

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/websocket-lifecycle.spec.ts`

- **Disabled URL:** with no `window.__e2eWsUrl` injected (so `websocketUrl`
  stays `''`), the league page renders without opening any WebSocket
  connection.

### Coverage notes

- **Reconnect-after-token-refresh is verified at the hook/unit level, not E2E.**
  The reconnect is driven by a rotation of the in-memory JWT owned by `useAuth`.
  Playwright's hermetic auth fixture supplies a fixed token and has no supported
  way to rotate it mid-session, so a live token-refresh reconnect cannot be
  simulated end-to-end without real auth infrastructure. The unit test above
  (`authToken` change → dispose + recreate with new token) is the authoritative
  coverage for this path; the E2E suite covers the disabled-URL degradation
  instead. See AC3 on LS-7625.
- **Connected-path realtime events** (chat arrival, matchup score refresh,
  `DRAFT_STARTED` → refetch) are already covered — not duplicated here — by
  `apps/web-e2e/src/tests/websocket-realtime.spec.ts` and
  `apps/web-e2e/src/tests/websocket-realtime-updates.spec.ts`.

## Related

- **Epic:** LS-5259 — QA — Page: Baseball League Detail
- **Ticket:** LS-7625 (GAP-001) — Missed feature: Live WebSocket
  league-realtime channel (draft-started, lifecycle, reconnect)
- **Existing realtime event coverage:**
  `apps/web-e2e/src/tests/websocket-realtime.spec.ts`,
  `apps/web-e2e/src/tests/websocket-realtime-updates.spec.ts`
