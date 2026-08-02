# 0019. Realtime reliability: subsystem ownership, binding rules, and the no-mocked-neighbour testing standard

Date: 2026-08-01

## Status

Accepted

## Context

The WebSocket / server-driven notification subsystem (draft board, chat,
presence, trades, stats, entitlements) has been the single most
regression-prone part of the platform: ~180 WebSocket-related commits over
five months, with multi-client features like the live draft board repeatedly
failing in real use despite green CI.

A forensic sweep of git history, Jira, and the test suite (LS-8876) found six
recurring failure categories:

1. **Subscription wiring lost on redesign** — a screen is rebuilt and the
   socket simply is not connected (LS-4422: 15 WS E2E tests silently skipped
   because the redesigned league page dropped the socket; LS-8067: web draft
   socket not connected at all; LS-7625, LS-7514/7679, LS-6387).
2. **Auth / token lifecycle** — token missing, expired, or not rotated
   (LS-8108: native draft socket never sent the token; LS-8388, LS-5110,
   LS-6788).
3. **Reconnect semantics** — detector wrong, refetch set incomplete, no retry
   (LS-8506: the reconnect detector never actually detected a reconnect;
   LS-4534, LS-390, LS-6787/6790/6793).
4. **Fan-out correctness** — message not sent, sent to the wrong scope, or
   lost (LS-7977: idempotent picks silently not re-sent; LS-2787: unpaginated
   DynamoDB fan-out; LS-6355/6356/6358/6301).
5. **Config / deploy drift** — URL, origin allowlist, env var, packaging
   (LS-374, LS-8342: 1,253+ Rollbar occurrences from a CORS allowlist gap;
   LS-4562, LS-5056, LS-6783).
6. **Test topology that cannot catch any of the above** — every layer mocked
   its neighbour. Lambda tests mock the SDK; client tests mock the server;
   hook tests mock the client; hermetic E2E plays the server via
   `routeWebSocket`. Until LS-8856 landed the two-client fan-out harness
   (`lambdas/websocket/src/fan-out.spec.ts`), zero tests in the repo opened
   two independently connected clients — which is precisely the shape of the
   LS-7977/LS-8067/LS-8108 incident trio. The live integration draft suite
   deliberately detects picks via HTTP polling, so a total WebSocket outage
   in the deployed stack fails no CI job.

Two structural causes underlie all six: **nobody owned realtime as a
subsystem** (findings were scattered across per-page QA epics; no ADR or
postmortem existed), and **the test pyramid was all mocks at every seam**, so
correctness of the _contract between layers_ (envelope shape, event-name
casing, auth handshake, ping/pong wire format) was never exercised. The
confirmed presence bug (LS-8877 — server sends bare `{type: 'USER_JOINED'}`
while clients only listen for the enveloped kebab-case form, so presence
never renders) is the canonical example: both sides pass their own tests;
the wire contract between them is broken.

## Decision

### Ownership

Epic **LS-8876** owns realtime reliability as a system. New realtime defects
and hardening work attach there, not to per-page QA epics.

### Binding rules for realtime changes

These rules are enforced by the `websocket-realtime` skill
(`.agents/skills/websocket-realtime/SKILL.md`), which auto-loads for any
agent touching the realtime file set:

1. **One envelope.** Every server→client push uses
   `{ type: 'notification', data: { type: <WireNotificationType>, ... } }`.
   No bare messages, no ad-hoc `broadcast()` payloads outside
   `WebSocketNotificationService`.
2. **The typed registry is the wire contract.** New event types require the
   four coordinated edits documented in
   `lib/utils/src/lib/notification-types.ts` (wire type, client type,
   aws-utils interface, websocket-client interface). Producers use the typed
   `notify*` API only.
3. **No mocked-neighbour-only testing for cross-layer changes.** Any change
   to the connection lambda, notification service, `WebSocketClient`, or the
   envelope/registry must add or extend a genuine-socket test in
   `lambdas/websocket/src/fan-out.spec.ts` (harness:
   `lambdas/websocket/src/test-support/localWsBridge.ts`). Single-layer
   mock tests remain welcome but are not sufficient evidence.
4. **Realtime consumers ship with lifecycle coverage.** A screen that
   consumes realtime events must have tests asserting the socket is created,
   connected with auth, and disposed (pattern:
   `apps/web/src/hooks/useLeagueWebSocketLifecycle.spec.ts`). A redesign or
   page rewrite that drops these tests is an incomplete migration, not a
   test cleanup.
5. **Await every notify.** Notification calls after DB mutations are awaited
   inside the request lifetime (existing rule from
   `docs/guides/websocket-notifications.md`, restated here because Lambda
   freeze makes fire-and-forget silently lossy).
6. **Fallback is deliberate, not accidental.** Where polling exists as a
   fallback (draft status, auction rooms), it must be documented as such at
   the call site. Tests must not let polling mask a dead socket: at least
   one assertion per critical flow must require delivery _via the socket_.

### Testing standard (target pyramid)

- **Contract seam (blocking CI, exists):** two-client fan-out specs over the
  real handler + real `WebSocketClient` on loopback TCP — extend per rule 3.
  Second slice (reconnect mid-draft, auto-pick burst/dedup, presence
  observability): LS-8865.
- **Client unit (exists):** reconnect/backoff/heartbeat arithmetic, hook
  lifecycle — keep as-is.
- **Hermetic E2E (exists):** `routeWebSocket`-driven rendering checks —
  valid for UI reconciliation only; never cite them as evidence the realtime
  path works.
- **Live canary (new, LS-8884):** scheduled check that opens a real
  authenticated socket to the deployed endpoint and asserts delivery of a
  test notification, so a dead deployed WS stack surfaces within hours.

## Consequences

- PRs touching realtime seams get slower to write (a fan-out spec is more
  work than a mock test) and materially harder to regress. This is the
  point: the six-month history shows the mock-only alternative cost far
  more in incident-response time than it saved in test-writing time.
- The skill router (`.agents/skills/INDEX.md`) now routes any agent working
  in the realtime file set through the checklist, closing the "redesign
  forgot the socket" and "new event type skipped the registry" classes at
  authoring time rather than in production.
- Known architecture debt is now ticketed rather than latent: presence
  envelope (LS-8877), TTL eviction on >2h sessions (LS-8878), dead
  `updateContext` server path (LS-8879), heartbeat margin (LS-8880),
  infinite reconnect on permanent rejection (LS-8881), untyped
  season-draft-game broadcasts (LS-8882), untested draft-processor seam
  (LS-8883), live canary (LS-8884), mobile multi-socket consolidation
  (LS-8885).
- The auction room's 5 s polling remains an explicit, documented exception
  until unified under the epic.
