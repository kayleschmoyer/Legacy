# 0017. Per-worker GraphQL mock server for hermetic native E2E runs

Date: 2026-07-19

## Status

Proposed (builds on [0016 — Test dependency injection](0016-test-dependency-injection.md))

## Context

ADR-0016 introduced two orthogonal DI seams selected by Playwright projects: a
**platform** seam (`AppDriver` — `PlaywrightWebDriver` | `AppiumNativeDriver`)
and a **backend** seam (`backend: 'mock' | 'live'`). Its native rollout
blueprint deferred one piece behind "its own ADR review of the mock-server
design" — this ADR is that review.

The web hermetic backend works because Playwright's `page.route()` intercepts
requests **in-process**: `fixtures/api-isolation.ts` fulfils GraphQL operations
from the `src/mocks/graphql/` factories without a network hop. Native has no
such hook — `AppiumNativeDriver` declares `networkMock: false`, and the app
under test runs in a **separate process** on an emulator, reaching its GraphQL
API over the wire (`apps/app/src/common/auth/DbClient.ts`, an Apollo `HttpLink`
posting to `EXPO_PUBLIC_GRAPHQL_HOST`). So native hermeticity needs the third
implementation of the backend seam: an **out-of-process** mock — a real HTTP
server the emulator app talks to.

Forces in tension:

- **No forked fixtures.** The whole value of ADR-0016 is one payload source of
  truth. The native server must serve the SAME operation-name-keyed factory
  payloads (`src/mocks/graphql/`, via `BASELINE_GRAPHQL_RESPONSES`) the web
  mocks serve — reusing them, not copying them.
- **Per-test overrides must stay in TypeScript.** `MockTestData` inspects
  request `variables` to answer server-side-filtered operations (the discovery
  search returns two leagues or an empty list depending on `variables.search`).
  That logic cannot be flattened into a static JSON map shipped over a control
  channel.
- **A pre-built APK has a fixed endpoint.** The emulator build bakes
  `EXPO_PUBLIC_GRAPHQL_HOST` at build time; the Playwright worker picks a
  dynamic free port at run time. The two must be reconciled without rebuilding
  the APK per run.
- **Native has no WebSocket mock.** Subscriptions (live draft) use a separate
  `EXPO_PUBLIC_WEBSOCKET_URL`; an HTTP server cannot serve them. This must be an
  explicit, enforced boundary, never a silent skip (ADR-0016 §capability model).

### Alternatives considered

1. **HTTP control channel for overrides** (`POST /__mock/override` with a JSON
   response body). Rejected: the discovery-search precondition is a _function of
   the request variables_, not a static body — a control channel would have to
   ship a mini rules DSL to express "empty iff `search === term`", reinventing
   the TypeScript the web path already has.
2. **Bake the payloads into the APK / a bundled JSON.** Rejected: forks the
   fixtures (a second source of truth that drifts) and makes per-test scenarios
   impossible.
3. **`10.0.2.2` host-loopback alias instead of `adb reverse`.** Rejected as the
   default: `10.0.2.2` is emulator-only (breaks on real devices) and bakes a
   host-networking assumption into the APK. `adb reverse` maps a fixed
   device-side port to any host port, works on devices and emulators, and keeps
   the APK endpoint stable.
4. **A shared server for all workers on a fixed port.** Rejected: cross-worker
   state bleed between overrides. Per-worker isolation mirrors `page.route`'s
   per-context isolation on web.

## Decision

Add a **per-worker, in-worker-process HTTP GraphQL mock server**
(`GraphQLMockServer`, `src/mocks/graphql/server/`) as the native implementation
of the ADR-0016 backend seam, wired by `fixtures/native-mock.ts`.

### 1. In-worker-process server, in-process override API

The server is created **inside the Playwright worker process** — exactly where
`MockTestData` calls `page.route()` for web. Only the **data plane** (the app's
GraphQL POSTs) crosses the process boundary. `NativeMockTestData` registers
per-test overrides by calling `server.override(op, handler)` directly — an
in-process function call, the native analogue of a layer-3 `route.fulfill()`.
The handler is a `(request) => body` closure that may inspect `variables`, so
the discovery-search logic stays in TypeScript, byte-for-byte the same shape
`MockTestData` uses. `NativeMockTestData` reuses the exact factories
(`publicLeaguesResponse`, `careerBattingConnectionResponse`, …) — no forked
fixtures (AC2).

Dispatch mirrors the web LIFO cascade: **override → baseline
(`BASELINE_GRAPHQL_RESPONSES`) → unmocked** (recorded; the fixture fails the
test afterward, same contract as `withApiIsolation`). The server is a generic
transport: the baseline is injected by the fixture layer, so `mocks/` never
imports `fixtures/` (no cycle).

### 2. Per-worker lifecycle + `adb reverse` wiring

A worker-scoped Playwright fixture (`nativeMockServer`) constructs one server
per worker (cheap — no socket until `.start()`), started lazily by the
native + mock `testData` branch and stopped at worker teardown. On start it runs
`adb reverse tcp:<E2E_NATIVE_GRAPHQL_PORT> tcp:<dynamicHostPort>` so the
emulator's `localhost:<devicePort>` reaches the worker's server. The bypass APK
is built once with
`EXPO_PUBLIC_GRAPHQL_HOST=http://localhost:${E2E_NATIVE_GRAPHQL_PORT}/graphql`
(default device port `8083`), and never needs to know the dynamic host port.
`adb reverse` is gated on `isNativeEmulatorConfigured()`, so the same fixture is
inert on web/live workers and on local runs without an emulator.

### 3. WebSocket flows are live-only on native (AC4)

The server speaks HTTP only and opens no WS listener. A `subscription` operation
reaching it is rejected **loudly** with an explicit
`SUBSCRIPTIONS_NOT_SUPPORTED` GraphQL error — never answered with empty data.
WebSocket-driven flows (live draft) are declared live-only on native via an
explicit capability gate, `realtimeUnavailable({ platform, backend })`, which a
WS-dependent shared spec uses as `test.skip(realtimeUnavailable(...),
REALTIME_LIVE_ONLY_REASON)`. The skip carries a reason; it is never silent. When
the server later speaks the WS protocol, the gate flips in one place.

## Rollout

1. **This change**: `GraphQLMockServer` + `NativeMockTestData`, the
   `nativeMockServer` worker fixture + `adb reverse` wiring, `playwright.native.
config.ts` switched to `backend: 'mock'`, the `realtimeUnavailable` gate, and
   node:test coverage proving the server side of AC2/AC3/AC4 without an emulator.
2. The LS-8450 emulator job (`scripts/ci/native-e2e-run.sh`) builds the bypass
   APK with the baked `EXPO_PUBLIC_GRAPHQL_HOST` and runs the login →
   league-list proof (`league-discovery-search.dual.spec.ts`) hermetically
   against the server.
3. Phase B page-object migrations add shared specs that light up on native
   through this backend as they land; WS-dependent ones gate via
   `realtimeUnavailable` until the server speaks WS.

## Consequences

### Easier

- Native runs are hermetic and deterministic — no live backend dependency for
  the migrated shared suite, same 0/0 discipline the web hermetic suite holds.
- One payload source of truth across all three backends (web-mock, live,
  native-mock); a factory change updates every platform at once.
- Per-test scenarios (`TestData` verbs) work identically on native — the spec
  body and its returned handles are unchanged across platforms.

### Harder

- Native hermetic runs depend on `adb reverse` and an APK whose baked
  `EXPO_PUBLIC_GRAPHQL_HOST` port matches `E2E_NATIVE_GRAPHQL_PORT`. A mismatch
  surfaces as the app hitting a dead port — documented in `native-emulator-ci.md`.
- The server is a real HTTP transport, so its determinism rests on unit coverage
  (`native-mock-server.test.ts`) rather than Playwright's web-first retry.

### Now constrained

- WebSocket-driven flows may not run against the native mock server; they gate
  live-only via `realtimeUnavailable` (never a silent `test.skip(true)`).
- New native preconditions are added as `TestData` verbs reusing the factories —
  never as bespoke JSON in the server or a forked fixture.
