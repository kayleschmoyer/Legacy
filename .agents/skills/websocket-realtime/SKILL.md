---
name: websocket-realtime
description: 'Binding rules and checklists for the WebSocket / realtime notification subsystem (draft board, chat, presence, trades, stats, entitlement pushes). Load when touching the websocket lambda, websocket-client, WebSocketNotificationService, notification-types registry, useWebSocket/useDraftWebSocket/useLeagueWebSocket* hooks, realtime terraform, or any screen that consumes realtime events. Enforces the one-envelope contract, the typed-registry 4-edit procedure, and the no-mocked-neighbour testing standard from ADR-0019.'
metadata:
  scope: 'lambdas/websocket/**, lambdas/draft-processor/**, lib/websocket-client/**, lib/aws-utils/src/notification/**, lib/utils/src/lib/notification-types.ts, lib/shared-components/src/hooks/useWebSocket*, lib/shared-components/src/features/elite-draft/**, apps/web/src/hooks/useLeagueWebSocket*, apps/web/src/context/LeagueWebSocketContext.tsx, terraform/main/websocket.tf'
---

# Skill: WebSocket / Realtime

**Why this skill exists:** realtime was the most regression-prone subsystem in
the repo (~180 fix commits in 5 months). Root cause of the recurrence: every
test layer mocked its neighbour, so wire-contract breaks (envelope shape,
event-name casing, auth handshake, ping/pong) always passed CI and failed in
production. Full taxonomy and rationale:
[ADR-0019](../../../docs/decisions/0019-realtime-reliability-hardening.md).
Subsystem owner epic: **LS-8876**. Architecture reference:
`docs/guides/websocket-notifications.md`.

## The map (30 seconds)

```
producers (lambdas/db mutations, draft-processor, stats, stripe-webhook, …)
  └─ createNotificationService() → lib/aws-utils/src/notification/WebSocketNotificationService.ts
       └─ DynamoDB connections table (LeagueIdIndex / MatchupIdIndex / UserIdIndex GSIs)
            └─ API Gateway ManageConnections → client sockets
connection lifecycle: lambdas/websocket/src/index.ts ($connect auth+DB authz, $disconnect, $default ping/updateContext)
client transport:     lib/websocket-client/src/WebSocketClient.ts (backoff, heartbeat, token expiry)
react layer:          lib/shared-components/src/hooks/useWebSocket.ts → useDraftWebSocket / useLeagueWebSocket*
```

There are **no GraphQL subscriptions** — all realtime is this raw pipeline.

## Binding rules (ADR-0019)

1. **One envelope.** Every server→client push is
   `{ type: 'notification', data: { type: <WireNotificationType>, ... } }`.
   Never send bare `{ type: 'SOMETHING' }` — the client only kebab-cases and
   re-dispatches inside the `notification` branch
   (`WebSocketClient.handleMessage`), so bare messages reach no React
   handler. (This exact bug shipped: LS-8877, presence events.)
2. **Typed registry only.** New event type ⇒ the 4 coordinated edits listed
   at the top of `lib/utils/src/lib/notification-types.ts`. Producers call
   typed `notify*` methods — never raw `broadcast()` with an ad-hoc payload.
3. **Await every notify** inside the request lifetime — Lambda freeze makes
   fire-and-forget silently lossy.
4. **`createNotificationService()` returns `null`** when env is missing and
   call sites no-op. If your change depends on a notification actually being
   sent, that env guard is a silent-failure path — surface it in tests.

## Testing standard — no mocked-neighbour-only evidence

| Change                                                                        | Required coverage                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connection lambda, notification service, `WebSocketClient`, envelope/registry | Add/extend a genuine two-client spec in `lambdas/websocket/src/fan-out.spec.ts` (harness: `lambdas/websocket/src/test-support/localWsBridge.ts` + `fakeConnectionsTable.ts`). Real handler, real client, real loopback socket. |
| Hook / screen consuming realtime                                              | Lifecycle spec proving the socket is created with auth, connected, and disposed — pattern: `apps/web/src/hooks/useLeagueWebSocketLifecycle.spec.ts`.                                                                           |
| UI reaction to a payload                                                      | Hermetic Playwright with `routeWebSocket` is fine — but it is UI-only evidence; never cite it as proof the realtime path works.                                                                                                |

Mock-only tests (SDK mocks, `mock-socket`, mocked `WebSocketClient`) are
welcome _additions_ but are **not sufficient** for cross-layer changes.
Harness caveats: connect-time pushes are dropped by the bridge (presence not
observable yet — LS-8877 will fix), and negative assertions currently use
fixed sleeps — prefer event-based waits in new tests.

## Redesign / rewrite checklist

Rebuilding a page that consumes realtime? The socket wiring is part of the
feature, not incidental:

- [ ] Socket provider/context still mounted on the new page
- [ ] Auth token still reaches the client (web: lifecycle hook; native:
      passed explicitly — native has no cookie path, see LS-8108)
- [ ] Lifecycle tests moved with the page, not deleted/skipped (LS-4422:
      15 tests silently skipped for months)
- [ ] Reconnect refetch set reviewed — every query the page renders from
      must be in the reconnect refetch list (LS-6787)

## Known sharp edges (open tickets — don't rediscover)

- Presence events unenveloped → handlers never fire: **LS-8877**
- Connections-table TTL (2 h) never refreshed → long drafts go silent: **LS-8878**
- `WebSocketClient.updateContext()` reconnects instead of sending the server
  `updateContext` action (server path unreachable): **LS-8879**
- Heartbeat 8 min vs API Gateway 10 min idle; `setHeartbeatInterval` has no
  production caller: **LS-8880**
- Infinite reconnect on permanent 401/403: **LS-8881**
- `season-draft-game.ts` raw `broadcast()` bypasses the registry: **LS-8882**
- Auction drafts deliberately poll (no socket) — a documented exception, not
  a pattern to copy: `useDraftWebSocket.ts` (`isAuctionDraft` opt-out)

## Config / deploy drift checklist

URL and origin config live in three places that must agree:
`VITE_WEBSOCKET_URL` (web), `EXPO_PUBLIC_WEBSOCKET_URL` (native), and
`CORS_ALLOWED_ORIGINS` on the lambda (`terraform/main/websocket.tf`). Adding
a deploy target/preview origin ⇒ update the allowlist or every connect 403s
(LS-8342). The websocket lambda is VPC-attached and does a Postgres round
trip on every `$connect` — DB health affects connect latency.
