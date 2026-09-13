# 0018. AppiumNativeDriver: the native implementation of ADR-0016's platform seam

Date: 2026-07-26

## Status

Accepted

## Context

LS-8293 was opened as a scoping ticket: produce a plan/ADR for the native half
of ADR-0016's blueprint (`AppiumNativeDriver` + per-worker GraphQL mock
server) _before_ any implementation started, gated on an explicit
precondition — implementation must not begin until mobile e2e is a committed,
continuously watched suite.

By the time this ticket was picked up, four sibling tickets under the same
epic (LS-8444) had already landed the entire scope this ticket was meant to
plan: LS-8447 (`AppiumNativeDriver`), LS-8448 (per-worker GraphQL mock server,
with its own [ADR-0017](0017-native-graphql-mock-server.md)), LS-8449
(`platform` option fixture + native Playwright project), and LS-8450 (CI
emulator provisioning + the login → league-list proof job). All four are Done
and merged to `main`. Re-litigating a forward-looking plan for code that
already exists, runs in CI, and cites ADR-0016 in its own docblocks would
produce a document nobody would read against reality.

This ADR instead closes the loop the scoping ticket asked for: it is the
"own ADR review" for the `AppiumNativeDriver` half specifically (ADR-0017
already covers the mock-server half), written as an as-built record so a
future reader has one canonical place documenting what shipped and why,
rather than reconstructing it from four ticket numbers and a driver
docblock.

### Precondition check — was implementation gated correctly?

ADR-0016's blueprint required "mobile e2e is a committed, continuously
watched suite" before the Appium driver lands. Two things could satisfy that
phrase and they must not be conflated:

- **`apps/app-e2e`** — the pre-existing WebdriverIO/Mocha scaffold. Still not
  wired into any GitHub Actions workflow (`grep -rn "app-e2e"
.github/workflows/*.yml` returns no matches). Its one real spec
  (`app.e2e.js`) drives generic Android widget-class selectors, not the
  Tamagui `testID` vocabulary ADR-0016 requires; the other five specs only
  assert that config files exist. This scaffold never became the committed
  suite and remained orphaned scaffolding predating ADR-0016. **Update
  (LS-8697): `apps/app-e2e` has since been deleted** — the follow-up named
  under "Now constrained" below was carried out.
- **The shared Playwright suite driven through `AppiumNativeDriver`**
  (`apps/web-e2e`) — this is what actually became the committed, watched
  suite: `.github/workflows/e2e-native-android.yml` runs on
  `workflow_dispatch` and automatically after every "Build Android App" run
  on `main`, executing the login → league-list proof
  (`league-discovery-search.dual.spec.ts`) against a real emulator and
  reddening the check on failure.

The precondition was satisfied — just not by the artifact ADR-0016's text
implicitly pointed at (`apps/app-e2e`). `apps/app-e2e` is dead weight
duplicating a now-superseded scaffold; see "Now constrained" below.

## Decision

We record `AppiumNativeDriver`
(`apps/web-e2e/src/driver/appium-native.driver.ts`) as the accepted native
implementation of the `AppDriver` contract
(`apps/web-e2e/src/driver/types.ts`), matching ADR-0016's native rollout
blueprint step 1, along with the surrounding scaffolding that makes it usable
in CI.

- **Injected session, not owned.** `AppiumNativeDriver` receives an
  already-created wdio `Browser`; it never creates one. Session creation —
  capabilities, animation disabling, which APK — lives in
  `createAndroidSession()` (`appium-session.ts`), mirroring how
  `PlaywrightWebDriver` receives an injected Playwright `Page`. No
  device/build knowledge lives in the driver, and no platform branch leaks
  into page objects (ADR-0016 §4).
- **`open(path)` navigates via deep link.** expo-router routes are
  URL-shaped on native, so `open('/baseball/league/7/draft')` opens
  `legacysports://baseball/league/7/draft` through Appium's `mobile:
deepLink`, mirroring the web driver resolving the same path against
  `baseURL`.
- **Retrying assertions via wdio polling.** Every `expect*` on `UIElement`
  polls with wdio `waitUntil`/`waitForDisplayed`, re-resolving the selector
  each tick — the same "wait until" semantics Playwright's web-first
  assertions give on web (ADR-0015 §1), so a page object migrated to
  `AppDriver` keeps identical determinism levers on both platforms.
- **Selector vocabulary maps to the accessibility tree**
  (`native-selectors.ts`): `testID` → accessibility id, `byRole`/`byText`/
  `byPlaceholder`/`byLabel` → the Android a11y tree. Nothing outside
  ADR-0016's narrow vocabulary is supported.
- **Capabilities, honestly declared:** `{ networkMock: false, clock: false,
trace: false, hover: false, multiWindow: false }`, matching
  `DriverCapabilities` (`types.ts:30-41`). In-process network mocking is
  deliberately not one of them — that's delivered out-of-process by the mock
  server (ADR-0017), not the driver.
- **Test-build animation disabling.** `createAndroidSession()` sets
  `appium:disableWindowAnimation: true` on session capabilities
  (`appium-session.ts:63`) — the canonical native-flake fix, since
  mid-animation taps race UiAutomator2's event dispatch. This is a session
  capability, not a build-time Gradle/manifest change, so no separate "test
  build" APK variant is required.
- **Backend seam (native) — pointer, not a repeat.** The per-worker HTTP
  GraphQL mock server, its reuse of `apps/web-e2e/src/mocks/graphql/`
  factories, `operationName`-keyed dispatch, `adb reverse` port wiring, and
  per-worker isolation are the third implementation of the ADR-0016 backend
  seam and are fully specified in
  [ADR-0017](0017-native-graphql-mock-server.md) — this ADR does not
  re-describe them.
- **WebSocket / live-draft exception, confirmed enforced.** The mock server
  speaks HTTP only and rejects a `subscription` operation with a loud
  `SUBSCRIPTIONS_NOT_SUPPORTED` GraphQL error (`native-mock-server.ts`).
  WS-dependent shared specs gate via `realtimeUnavailable({ platform,
backend })` (`fixtures/native-mock.ts`) with `REALTIME_LIVE_ONLY_REASON` —
  an explicit, reasoned skip, never a silent one.
- **Reference flow and what "proven" means.** The single reference flow is
  login → league list
  (`league-discovery-search.dual.spec.ts`, `native-android` project). Real
  OAuth is not automatable on native (OAuth-only, LS-6656), so the proof job
  builds a bypass APK (`EXPO_PUBLIC_BYPASS_AUTH=true`, test-only session
  injection via `AuthHooks.ts`) that cold-launches pre-authenticated — that
  injection _is_ the login step; the flow then asserts the league-list
  surface renders. The bypass throws under `NODE_ENV=production`, so it
  cannot reach a shipped build. "Proven" means passing on
  `.github/workflows/e2e-native-android.yml`
  (`workflow_dispatch` + automatic run after "Build Android App" on `main`,
  schedule-free per LS-8487) — a failing run reddens the check, which is the
  "watched" mechanism. This mirrors the `test-suite` workflow_dispatch input
  pattern in `run-playwright-tests.yml:31-40` in spirit (an explicit, named
  dispatch entry point), though the native job is single-purpose enough that
  it did not need its own `test-suite` choice value.

## Consequences

### Easier

- Anyone extending native coverage now has one canonical design record (this
  ADR + ADR-0017) instead of reconstructing intent from four ticket numbers
  and driver docblocks.
- The precondition question ("is mobile e2e a watched suite yet?") has a
  documented, unambiguous answer: yes, via `e2e-native-android.yml` — and
  `apps/app-e2e` is explicitly not that suite.

### Harder

- Nothing new — this ADR changes no runtime behavior; it documents what four
  already-merged tickets built.

### Now constrained

- New native coverage goes through the shared-suite + `AppiumNativeDriver`
  path this ADR documents. Retiring `apps/app-e2e` was filed as a follow-up
  cleanup ticket rather than done here, since deleting a whole app directory
  is not a documentation change; **LS-8697 has since deleted it**, porting its
  only two uncovered assertions (the five-tab navigator and the `(app)` index
  redirect) into `apps/app` RTL specs and archiving its migration record to
  `docs/migration-history/e2e-testing-migration.md`. There is consequently no
  longer a second native test stack for anyone to mistake for this one.
- `playwright.native.config.ts`'s docblock, which said native execution "is
  not wired yet" (stale as of LS-8450 merging), is corrected in the same PR
  as this ADR to point here instead of asserting an already-false
  precondition.
