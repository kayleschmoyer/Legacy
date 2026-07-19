# Native emulator CI — the watched login → league-list job (LS-8450)

ADR-0016 §"Native rollout blueprint" step 4: _"Emulator provisioning in CI is
the real cost center; prove one flow (login → league list) on a scheduled,
watched job before generalizing."_ This is that job — the piece that finally
**executes** the native scaffold the sibling tickets landed.

## What runs where

| Piece                                   | Owner       | Where                                                                                                                                                    |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppiumNativeDriver` (wdio adapter)     | LS-8447     | `appium-native.driver.ts`                                                                                                                                |
| `createAndroidSession()` (wdio session) | LS-8447     | `appium-session.ts`                                                                                                                                      |
| `platform: 'native'` fixture seam       | LS-8449     | `../fixtures/dual.ts`, `playwright.native.config.ts`                                                                                                     |
| **Per-worker hermetic mock server**     | LS-8448     | `../mocks/graphql/server/native-mock-server.ts`, `../fixtures/native-mock.ts`, ADR [0017](../../../../docs/decisions/0017-native-graphql-mock-server.md) |
| **Emulator provisioning + wiring**      | **LS-8450** | `.github/workflows/e2e-native-android.yml`, `scripts/ci/native-e2e-run.sh`, the real-session branch of the `driver` fixture in `../fixtures/dual.ts`     |

Before this ticket the `driver` fixture resolved the throwing placeholder
(`pending-native.driver.ts`) for `platform: 'native'`. LS-8450 wires it to the
real `createAndroidSession()` **when an emulator harness is configured**
(`E2E_NATIVE_APP` set — `appium-env.ts` `isNativeEmulatorConfigured()`), loading
the `webdriverio` runtime via a dynamic import so the hermetic web PR-CI
collection of the shared specs never pulls in wdio.

## Auth strategy (AC3) — why there is no real login

**Real OAuth is not automatable on native.** The mobile app is OAuth-only
(LS-6656): there is no username/password form to drive, and a Google handshake
in an emulator is not reliably scriptable.

So the CI job builds a release APK with **`EXPO_PUBLIC_BYPASS_AUTH=true`** —
test-only session injection (`apps/app/src/common/auth/AuthHooks.ts`). With the
bypass on, the app cold-launches already authenticated as `LOCAL_USER` and never
shows the login screen. **That injection _is_ the "login" step of the proof
flow.** The flow then drives the shared `LeaguePage` to the league-discovery /
list surface (`league-discovery-search.dual.spec.ts`), proving the app reaches
the league list.

The bypass throws when `NODE_ENV === 'production'`, so it can never leak into a
shipped build; the shipped `build-android-app.yml` release APK deliberately
leaves the flag unset. Appium installs and launches the bypass APK itself via
the `appium:app` capability that `createAndroidSession()` derives from
`E2E_NATIVE_APP`.

> The unauthenticated login _surface_ is covered separately by the Maestro
> visual sweep (`maestro/flows/login/login-screen.yaml`, built WITHOUT the
> bypass) and its RTL unit tests (`apps/app/src/app/login.spec.tsx`). The two
> auth modes cannot coexist in one APK, so a single automated login →
> league-list flow necessarily uses the bypass build.

## Trigger + artifacts (AC2)

Schedule-free (LS-8487): `workflow_dispatch` + `workflow_run` after "Build
Android App" on `main`. A failing job reddens the run (the "watched" red check).
Screenshots/logs, the Appium log, and the Playwright report upload as artifacts.

## Hermetic backend (LS-8448 / ADR-0017)

The native project runs `backend: 'mock'`: the `nativeMockServer` worker fixture
(`../fixtures/native-mock.ts`) boots a per-worker HTTP GraphQL mock server that
serves the same operation-name-keyed factory payloads the web mocks serve, and
runs `adb reverse tcp:$E2E_NATIVE_GRAPHQL_PORT tcp:<hostPort>` so the emulator
reaches it. The bypass APK must be built with
`EXPO_PUBLIC_GRAPHQL_HOST=http://localhost:$E2E_NATIVE_GRAPHQL_PORT/graphql`
(default device port `8083`). WebSocket-driven flows (live draft) stay live-only
on native — the HTTP server rejects subscriptions loudly; specs gate via
`realtimeUnavailable` (AC4).

## Run it locally

Requires a booted Android emulator + Appium (UiAutomator2) on `127.0.0.1:4723`
and a bypass APK built with the mock-server host baked in (see above). Export the
harness env, then run the native project:

```bash
export E2E_NATIVE_APP=/abs/path/to/bypass-app-release.apk
export E2E_NATIVE_GRAPHQL_PORT=8083   # must match the APK's baked EXPO_PUBLIC_GRAPHQL_HOST
pnpm exec playwright test --config=apps/web-e2e/playwright.native.config.ts \
  --project=native-android league-discovery-search.dual.spec.ts
```

Without `E2E_NATIVE_APP`, the fixture injects the placeholder driver and the
native project's specs skip (or fail loudly on an ungated interaction) — never a
silent pass.
