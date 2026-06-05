# Feature: about-mobile-expo-constants

**Jira:** LS-7740
**Page:** `about` (Epic LS-5254)
**Platform:** Native App (Android / iOS)
**File:** `apps/app/src/screens/AboutScreen.tsx`

## Description

The native `AboutScreen` renders several fields that have no equivalent on the web About page.
These fields are sourced from `expo-constants` and the `__DEV__` global, which are only available
in the Expo / React Native runtime:

| Row          | Source                                                                   | Web equivalent                 |
| ------------ | ------------------------------------------------------------------------ | ------------------------------ |
| Expo SDK     | `Constants.expoConfig?.sdkVersion`                                       | None                           |
| Native Build | `Constants.nativeBuildVersion` → `Constants.manifest?.version` → `'N/A'` | None                           |
| Platform     | `Constants.platform?.ios` / `Constants.platform?.android`                | None                           |
| Environment  | `__DEV__ ? 'development' : 'production'`                                 | `env.isDev` (different source) |

The existing About Feature Stories (`build-information-card`, `application-info-card`, etc.) are
web-only and do not enumerate these native fields. This Feature Story provides QA coverage for the
mobile-specific rendering logic.

## Acceptance Criteria

1. **Expo SDK row** — renders `Constants.expoConfig?.sdkVersion`; shows `'unknown'` when the value
   is `undefined` or empty.
2. **Native Build row** — renders `Constants.nativeBuildVersion`; falls back to
   `Constants.manifest?.version` on older SDK builds; final fallback is `'N/A'`.
3. **Platform row** — shows `'iOS'` when `Constants.platform?.ios` is truthy; shows `'Android'`
   when `Constants.platform?.android` is truthy; shows `'Unknown'` when neither is set.
4. **Environment / `__DEV__` row** — shows `'development'` in development builds
   (`__DEV__ === true`); shows `'production'` in release builds (`__DEV__ === false`).

## What Needs to Be Tested

- Open the iOS simulator build — confirm **Platform = iOS**, **Expo SDK** and **Native Build**
  show real values (not `'unknown'` / `'N/A'`), and **Environment = development**.
- Open the Android emulator build — confirm **Platform = Android**.
- Verify a production / release build sets **Environment = production**.
- Verify graceful fallbacks: if `Constants.expoConfig` is `null`, Expo SDK row shows `'unknown'`.

## Related

- **Gap source:** LS-7618 — [GAP-003] Missed feature: Mobile About screen (apps/app) is wholly
  absent from inventory
- **Parent epic:** LS-5254 — QA: About Page
