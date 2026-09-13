# 0016. Dependency injection for test suites: platform driver + backend seam

Date: 2026-07-02

## Status

Accepted (builds on [0015 — Semantic Page Object Model](0015-semantic-page-objects.md))

## Context

ADR-0015 gave the Playwright suites a semantic Page Object Model: specs speak
verbs, selectors live in page/component objects, identity and mocking live in
fixtures. That already lets ONE page object drive both the hermetic and the
live integration suite. Two couplings remain:

1. **Page objects are welded to Playwright's `Page`.** Every object takes a
   `Page` and builds `Locator`s, so nothing in the test stack can ever drive
   the native app (`apps/app`), whose skeletal e2e suite at the time
   (`apps/app-e2e`, WebdriverIO + Appium + Mocha — deleted in LS-8697 once
   this ADR's own driver seams superseded it) shared no vocabulary with
   the web suite. Meanwhile the app itself is built once in
   `lib/shared-components` (Tamagui, ADR-0003): the same `testID` renders as
   `data-testid` on web and the accessibility id on native, and the mobile app
   uses expo-router, so app routes are URL-shaped on both platforms. The UI is
   cross-platform; the test vocabulary is not.

2. **A spec's backend is decided by its directory.** `src/tests/` is hermetic,
   `src/integration/tests/` is live, and the two suites cannot share a spec
   body even where the flow is identical. The mock/live decision is baked into
   file location rather than injected, so behavior that deserves both cheap
   deterministic PR coverage _and_ a nightly live check must be written twice
   (e.g. the players-stats flows exist as `player-stats*.spec.ts` and again as
   `player-search-stats-ui.integration.spec.ts`).

Forces in tension:

- **Retry semantics are the determinism backbone.** Playwright's web-first
  assertions are what keep the hermetic suite at 0/0; any abstraction that
  hides `Locator` must preserve "wait until" semantics, not sample-and-hope.
- **Not everything is portable.** `page.route()`/`page.clock` are CDP-only;
  hover has no touch equivalent. A design that pretends otherwise converts
  scoping decisions into runtime flake.
- **Migration cost.** LeaguePage deliberately exposes parameterised `Locator`
  getters and PlayersPage is ~1400 lines of Playwright-typed surfaces; a
  big-bang rewrite is the LS-8096 lesson in reverse. The seam must permit
  object-by-object migration with zero spec churn.

### Alternatives considered

1. **Move both suites to WebdriverIO (drives browsers AND Appium).** Rejected:
   discards the mature Playwright suite, its fixtures/mock architecture, trace
   tooling, and the 0/0 nightly discipline for a wholesale rewrite.
2. **Duplicate suites per platform/backend (status quo).** Rejected: the
   duplication is the problem — every shared flow costs 2–4 spec bodies.
3. **Runtime feature-detection inside page objects** (`if (isWeb) …`).
   Rejected: platform branches in the object layer defeat the abstraction and
   are untestable in isolation.
4. **Backend selection via env var instead of Playwright projects.** Rejected:
   projects are Playwright's native DI for options — they appear in reports,
   filter with `--project`, and compose with the existing browser projects.

## Decision

Introduce **two orthogonal dependency-injection seams**, both selected by
Playwright **projects**, with the Playwright **runner** remaining the single
orchestrator everywhere.

### 1. Platform seam — `AppDriver`

`apps/web-e2e/src/driver/` defines platform-neutral contracts:

- **`AppDriver`** — `open(route)` (URL path on web, deep link on native) plus
  a selector scope (`byTestId`, `byTestIdPrefix`, `byRole`, `byText`,
  `byPlaceholder`) returning `UIElement`s.
- **`UIElement`** — lazily-resolved query (like a `Locator`): actions
  (`tap`, `fill`), plain reads (`count`, `isVisible`, `text`, …), and a
  **retrying assertion surface** (`expectVisible`, `expectCount`,
  `expectContainsText`, …). On web these delegate to Playwright web-first
  assertions; a native driver must implement equivalent polling (wdio
  `waitForDisplayed` / `expect-webdriverio`). Retry lives BEHIND the
  interface, so migrated objects keep identical determinism levers.
- **`DriverCapabilities`** — `networkMock`, `clock`, `trace`, `hover`,
  `multiWindow`. A spec needing a capability gates on it explicitly
  (`test.skip(!driver.capabilities.clock, …)`); a missing capability is a
  scoping decision, never a runtime surprise.

`PlaywrightWebDriver` is the web implementation (all capabilities true). The
selector vocabulary is deliberately narrow — exactly the subset both platforms
resolve via Tamagui `testID` and the accessibility tree.

Migration targets the two object kinds differently, mirroring the ADR-0015
page/component split:

- **Page objects (screens)** extend **`BaseScreen`** (holds an `AppDriver`)
  instead of `BasePage` (holds a `Page`).
- **Component objects** take a **`UIElement` root** instead of a `Locator`
  root (`BaseComponent`), so any migrated screen can compose them by passing
  a driver element for whatever region the widget lives in.

`expect.poll` and other runner-level assertions remain fine in page objects —
only `Locator`-bound assertions must sit behind the element interface.
**DraftPage (screen) + PlayerSearchBox (component) are the reference
migration** (mirroring ADR-0015's DraftPage-first rollout); their verbs are
byte-for-byte unchanged, so consuming specs did not change.

### 2. Backend seam — `backend` option + `TestData`

- **`backend: 'mock' | 'live'`** is a Playwright _option fixture_
  (`fixtures/dual.ts`), set per project. Mock mode installs the hermetic API
  isolation (extracted verbatim from `auth-enhanced.ts` into
  `fixtures/api-isolation.ts` for reuse) and keeps the global-setup
  storageState. Live mode reuses the integration suite's commissioner
  identity (`integration/fixtures/ui.ts`, now exporting `WEB_BASE`,
  `buildIntegrationStorageState`, `getAuthJwt`) and points `baseURL` at the
  live web app.
- **`TestData`** (`fixtures/test-data.ts`) is the data-precondition seam: a
  spec asks for a precondition ("a searchable player pool exists") and gets
  handles back; `MockTestData` satisfies it with `route.fulfill()` payloads,
  `LiveTestData` against real backend state (creating it via real GraphQL
  where needed). The interface grows verb-by-verb with dual-mode specs; a
  verb a backend cannot satisfy must throw, never silently no-op.

### 3. Dual-mode specs — one body, projects for scope

Specs under **`src/tests/shared/`** (named `*.dual.spec.ts`) import the dual
fixtures and speak only page-object verbs + `TestData`:

- Hermetic config (`playwright.config.ts`): picked up automatically by the
  existing browser projects — `backend` defaults to `'mock'`, so they run in
  PR CI like any hermetic spec.
- Integration config: a **`shared-live` project** points at the same
  directory with `use: { backend: 'live' }`. The pre-existing suite lives
  under the `integration` project, unchanged; the nightly workflow passes
  explicit file lists from the shard partition, so nightly behavior is
  untouched until shared specs are deliberately wired into the partition
  (follow-up below).

`player-stats-search.dual.spec.ts` is the reference dual-mode spec.

### 4. What page objects still may not do

ADR-0015 §6 unchanged and extended: page/component objects carry no mocking,
no identity, no data setup, **and no platform branches**. Where web and native
flows genuinely diverge, provide two implementations of one screen interface
behind a fixture — do not `if (platform)` inside a screen.

## Native rollout blueprint (implemented — see below)

The Appium driver lands only when mobile e2e is a committed, watched suite
(the ADR-0016 discussion was explicit that an unexercised second driver is
dead weight). When it does:

1. `AppiumNativeDriver implements AppDriver` — wdio remote; `open()` via deep
   link; `expect*` via wdio polling waits; capabilities
   `{ networkMock: false, clock: false, trace: false, hover: false, … }`.
   Disable animations in the test build (UiAutomator2
   `disableWindowAnimation`) — mid-animation taps are the canonical native
   flake.
2. Hermetic native (`networkMock: false`) needs a **per-worker mock server**
   serving the same payload factories (`src/mocks/graphql/`) keyed by
   operation name, with the app build pointed at it via env — the third
   implementation of the backend seam. WebSocket-driven flows (live draft)
   stay live-only on native until the mock server speaks the WS protocol.
3. Native projects run the shared suite filtered by capability; the
   `platform` dimension becomes a second option fixture mirroring `backend`.
4. Emulator provisioning in CI is the real cost center; prove one flow
   (login → league list) on a scheduled, watched job before generalizing.

**Implemented by:** `AppiumNativeDriver`
(`apps/web-e2e/src/driver/appium-native.driver.ts`, LS-8447), the per-worker
mock server ([ADR-0017](0017-native-graphql-mock-server.md), LS-8448), the
`platform: 'native'` fixture seam (LS-8449), and the scheduled, watched
login → league-list emulator job
(`.github/workflows/e2e-native-android.yml`,
`apps/web-e2e/src/driver/native-emulator-ci.md`, LS-8450). Its "app routes are
URL-shaped on both platforms" premise (Context, point 1) is corrected by
[ADR-0021](0021-native-route-parity-seam.md) for tab-addressed routes — this
ADR's text is left as originally accepted per the immutability rule; ADR-0021
is the current statement of native route resolution.

## Rollout

1. **This change**: driver contracts + web driver, DraftPage/PlayerSearchBox
   reference migration, backend seam, one dual-mode spec, `shared-live`
   project.
2. Migrate page objects to `BaseScreen` opportunistically as their specs are
   touched (ADR-0015 rollout rule); LeaguePage's raw-`Locator` getters must
   collapse into verbs as part of its migration.
3. Add dual-mode specs where a flow deserves both PR-CI determinism and a
   live check; retire the duplicated hermetic/integration pairs they replace.
4. Wire `src/tests/shared/` into the nightly integration shard partition
   (weights manifest + partition CLI) once more than a handful exist.
5. Native driver per the blueprint above, behind its own ADR review of the
   mock-server design.

## Consequences

### Easier

- A flow written once runs mocked in PR CI and live nightly — the mock/live
  decision is a one-line project option, not a second spec file.
- Page objects migrated to `AppDriver` are native-ready the day an Appium
  driver exists; specs won't change at all (they already speak verbs only).
- The hermetic isolation layer is a reusable function
  (`withApiIsolation`) rather than a fixture-locked side effect.

### Harder

- Two page-object base classes coexist during migration (`BasePage`,
  `BaseScreen`) — authors must pick (new objects: `BaseScreen`).
- The driver vocabulary is intentionally narrower than `Locator`; web-only
  interactions (CSS assertions, `dispatchEvent` workarounds, clipboard) stay
  in unmigrated objects until they have a portable expression.
- Dual-mode specs must satisfy BOTH backends' constraints: deterministic
  under mocks, tolerant of real-data variance live (assert on seeded/known
  handles from `TestData`, never on mock-specific incidentals).

### Now constrained

- New page objects take an `AppDriver` (`BaseScreen`), not a `Page`, unless
  they need web-only surfaces — in which case that need is documented in the
  object's doc comment.
- Specs in `src/tests/shared/` may not import `@playwright/test`'s `test`
  directly, may not call `page.route()`, and may not reference mock payloads
  — preconditions go through `TestData`.
- A capability-dependent test declares the capability
  (`test.skip(!driver.capabilities.X, …)`) instead of failing on the platform
  that lacks it.
