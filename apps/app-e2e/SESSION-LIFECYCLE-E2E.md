# Native session-lifecycle E2E (LS-8454)

Coverage for native auth's session lifecycle: secure-store JWT persistence,
logout, and the biometric gate. This document records **what is automated today**
and **what is deferred, why, and how** — per the phased approach the sibling
ticket LS-8453 established (unit coverage now; driver/emulator specs after the
`AppiumNativeDriver` lands in LS-8447).

## Background

Native auth is a secure-store JWT (`expo-secure-store`), not a web-style
`AuthProvider` session:

- On every cold start the `(app)` route group (`apps/app/src/app/(app)/_layout.tsx`)
  calls `useCurrentUserInfo()` → `getJwt()` → `SecureStorageProvider.getItem(INTERNAL_JWT)`
  and renders `<Redirect href="/login" />` when nothing is stored.
- The biometric unlock (`apps/app/src/common/auth/BiometricAuth.ts`) gates a
  _persisted_ session: the `biometric-login-button` (`apps/app/src/app/login.tsx`)
  only renders when the device has enrolled biometrics **and** a non-expired JWT
  is already in secure storage.
- `EXPO_PUBLIC_BYPASS_AUTH` short-circuits `useCurrentUserInfo()` to a fake
  `LOCAL_USER` and never touches secure storage or `getJwt`, so it cannot be used
  to exercise any of the above. Real coverage needs a build path where auth is
  real.

## What is automated now (unit layer)

| Concern                                                                                                             | File                                                            | ACs         |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------- |
| Biometric gate + JWT validity (hardware / enrollment / stored-token, prompt, store)                                 | `apps/app/src/common/auth/BiometricAuth.spec.ts`                | AC3 (logic) |
| Session persistence → guard: stored session relaunches authenticated; logout/cleared session relaunches to `/login` | `apps/app/src/app/(app)/sessionLifecycle.spec.tsx`              | AC1, AC2    |
| The session-injection harness itself (incl. its production guard)                                                   | `apps/app/src/common/auth/testHarness/sessionInjection.spec.ts` | AC4         |
| Biometric button visibility bound to `hasStoredToken` (pre-existing)                                                | `apps/app/src/app/login.spec.tsx`                               | AC3 (UI)    |

`sessionLifecycle.spec.tsx` drives the **real** `useCurrentUserInfo` → `getJwt`
chain and the real `(app)` guard against a persistent secure-store double seeded
via the injection harness — a fresh `render(<Layout />)` models a cold launch and
the module-scoped store models the Keychain/Keystore persisting across process
restarts. This is the "auth is real" path AC4 requires, expressed hermetically.

## The session-injection harness (AC4)

`apps/app/src/common/auth/testHarness/sessionInjection.ts` is the reusable seam
that puts the app into an authenticated state without a full OAuth round-trip:

- `buildTestJwt(claims, { expiresInMs })` — a decodable (unsigned) JWT. On-device
  auth deliberately does not verify JWT signatures (the server re-validates every
  API call), so a decode-only token faithfully models a persisted session.
- `injectTestSession(jwt)` — writes `INTERNAL_JWT` through the real
  `SecureStorageProvider` (the completed-login equivalent).
- `clearTestSession()` — clears the secrets (the storage half of logout).

Every entry point throws when `NODE_ENV === 'production'`, mirroring the
`EXPO_PUBLIC_BYPASS_AUTH` guard, and nothing in the app runtime imports the
module, so it is never bundled into a shipped build.

### Extending the harness to the emulator build path (deferred → LS-8447 / LS-8450)

The unit specs call the harness in-process. The emulator-driven specs will call
the **same** functions over a dev-only build seam once the driver exists:

1. `AppiumNativeDriver` (LS-8447) `open()`s the app, then reaches an authenticated
   state by invoking `injectTestSession` through a dev-menu action or a
   `legacysports-dev://inject-session?jwt=…` deep link that is compiled **only**
   into non-production builds (guarded by the same `NODE_ENV`/build-flag check).
2. The scheduled emulator job (LS-8450) — whose open AC is exactly "auth strategy:
   bypass build vs. test session injection" — owns wiring that dev seam into CI.
   This ticket implements the injection primitive and its unit exercise; it does
   **not** add the dev-build route/menu, to stay inside scope and avoid
   duplicating LS-8450.

## Emulator biometric simulation (AC3) — deferred with rationale

AC3 asks to assert the `biometric-login-button` appears on an emulator with an
enrolled fingerprint, **or** to record why that is out of scope. The button's
visibility logic is fully covered at the unit layer (`BiometricAuth.spec.ts` +
`login.spec.tsx`). The _emulator_ assertion is **deferred**, because:

- There is no functional native test runner yet — the `AppiumNativeDriver`
  (LS-8447) is the gate, and `apps/app-e2e` is still a skeletal WDIO/Appium
  scaffold. An emulator biometric spec written now would be dead weight (per
  ADR-0016's "an unexercised second driver is dead weight").
- The mechanics are settled and ready to wire once the driver lands. On an
  Android emulator with a registered fingerprint:

  ```bash
  # Enrol a fingerprint (Settings ▸ Security ▸ Fingerprint) once, then simulate a
  # touch when the prompt is showing:
  adb -e emu finger touch 1
  ```

  The driver flow will be: `injectTestSession(validJwt)` → relaunch → assert
  `biometric-login-button` visible → tap it → `adb emu finger touch 1` → assert
  the app lands authenticated. This rides the LS-8450 scheduled emulator job
  rather than PR CI (biometric/emulator runs are too slow and flaky for per-PR
  gating).

## Related

- Epic: LS-8444 (E2E coverage gaps — native & web)
- ADR-0015 (semantic page objects), ADR-0016 (test dependency injection)
- Precedent: LS-8453 (deep-link routing — unit tests now, driver specs after LS-8447)
