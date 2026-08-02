# 0020. Native-emulator WebSocket fan-out coverage stays manual until the mock server speaks WS

Date: 2026-08-02

## Status

Accepted

## Context

LS-8856 built a genuine two-client WebSocket fan-out harness
(`lambdas/websocket/src/fan-out.spec.ts`) proving that the real
`WebSocketClient` (`lib/websocket-client`) — the exact class both web and
native construct via the shared `useWebSocket` hook
(`lib/shared-components/src/hooks/useWebSocket.ts`) — round-trips correctly
against the real connection lambda. That is the closest testable proxy for
"native receives a web-triggered broadcast" available today, but it is not
true device-level coverage: it never runs on an emulator, and it never
exercises `AppiumNativeDriver` or a native WebSocket connection at all.

LS-8865 (this ticket) was asked to resolve, not just re-describe, whether a
low-cost path exists to stand up genuine native+live WS E2E coverage for
this one flow. Two prior ADRs already establish the relevant facts:

- **[ADR-0017](0017-native-graphql-mock-server.md)** — the native hermetic
  backend (`playwright.native.config.ts`'s `native-android` project, the only
  native Playwright project that exists) runs `backend: 'mock'` against
  `GraphQLMockServer`, which speaks **HTTP only**. A `subscription` operation
  reaching it is rejected with a loud `SUBSCRIPTIONS_NOT_SUPPORTED` GraphQL
  error, and WS-dependent shared specs gate via
  `realtimeUnavailable({ platform, backend })` — an explicit, reasoned skip,
  never a silent one. There is no native WS mock, by design (ADR-0017's own
  "Forces in tension" section names this an explicit boundary).
- **[ADR-0018](0018-appium-native-driver.md)** — `AppiumNativeDriver` itself
  is not the blocker. It shipped under LS-8447, is the accepted native
  `AppDriver` implementation, and is exercised today by the login →
  league-list proof job. (This corrects LS-8856's original Technical
  Approach, which had flagged the driver itself as the missing piece.)

So the actual gap is narrower than "native E2E is unsupported": the platform
driver exists and works; only a **`backend: 'live'` native Playwright
project** — one that skips the HTTP mock server and lets the emulator app
talk to a real deployed (or local) backend, including a real WebSocket
connection — does not exist. Standing one up is not a config toggle:

- It needs a real, reachable GraphQL + WebSocket backend for the emulator to
  hit (local dev stack or a deployed environment), which the existing
  `native-android` project's CI job deliberately avoids by design (hermetic,
  no live dependency, matching ADR-0017's whole rationale).
- It needs its own auth story — the existing native proof job uses a
  bypass-auth APK (`EXPO_PUBLIC_BYPASS_AUTH=true`) that never talks to a real
  backend at all (ADR-0018); a live-backend project needs real credentials,
  which is exactly the kind of environment-dependent secret-provisioning
  problem the web `live` backend seam has its own established (but separate)
  answer for.
- It needs a real draft-in-progress fixture on the live backend to trigger a
  pick broadcast against, which does not exist as reusable native E2E
  scaffolding today.

None of that is a low-cost addition to this ticket's scope (no production
WebSocket behavior changes, no new infrastructure — see LS-8865's Out of
Scope). Building it as a rushed add-on to a test-coverage ticket would also
duplicate work already tracked: [ADR-0019](0019-realtime-reliability-hardening.md)
names a **live canary** (LS-8884) — a scheduled check that opens a real
authenticated socket against the deployed endpoint and asserts delivery —
as the intended mechanism for catching a dead deployed WS stack. A native
live-backend Playwright project would be solving the same "does the real
stack deliver over a real socket" problem LS-8884 already owns, on a second
axis (native platform) that nothing currently requires.

## Decision

True device-level (Appium, native-emulator) coverage of a web-triggered
WebSocket broadcast reaching a native client stays **manual and
unautomated**. This is a permanent, documented decision, not an open
question:

- The nearest automated proxy remains LS-8856's fan-out harness, which
  proves the shared transport (`WebSocketClient`) both platforms construct
  identically — see that spec's docblock.
- The native hermetic E2E suite (`native-android` project) will keep
  rejecting WS subscriptions via `SUBSCRIPTIONS_NOT_SUPPORTED` /
  `realtimeUnavailable` (ADR-0017) — this is not a bug to fix opportunistically
  here.
- Real deployed-stack WS delivery is covered on a platform-agnostic axis by
  the live canary (LS-8884, tracked under epic LS-8876), not by a
  native-specific E2E project.
- A native `backend: 'live'` Playwright project (or equivalent
  emulator-driven, real-socket native coverage) remains a legitimate future
  addition — filed as its own scoped ticket under LS-8444 (native rollout
  epic) if a concrete need for it arises — rather than left as ambiguous
  scope on this or any future test-hardening ticket.

## Consequences

### Easier

- Future readers/agents hitting the "why doesn't native WS have E2E
  coverage" question have one canonical, dated answer instead of
  re-investigating LS-8856's deferred Open Question from scratch.
- LS-8865's AC3 resolves cleanly to "explicitly re-affirmed, not built" —
  the correct outcome per that AC's own wording, given the cost/benefit
  above.

### Harder

- Nothing new — no runtime behavior changes. This ADR documents a
  non-decision (deliberately not building something) as explicitly as a
  build decision, per LS-8865's Technical Approach.

### Now constrained

- Do not add a `backend: 'live'` native Playwright project as a drive-by
  part of an unrelated realtime ticket; it needs its own scoped ticket
  (auth story, live fixture data, CI cost) under epic LS-8444.
- Do not treat `native-android`'s `SUBSCRIPTIONS_NOT_SUPPORTED` rejection as
  a defect — it is the intended boundary from ADR-0017.
