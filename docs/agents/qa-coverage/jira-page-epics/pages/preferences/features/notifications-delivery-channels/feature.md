# Feature: Notifications — Delivery Channels

**Jira:** LS-5612
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Push and Email notification toggles (`pushEnabled`, `emailEnabled`) for authenticated users only, backed by the `UpdateNotificationPreferences` mutation. Signed-out users see a sign-in card instead. Turning Push ON on web checks OS permission first (`Notification.permission`; denied shows a blocked hint, LS-7089).

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                      | Status  |
| -------- | ---------- | ---------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences-notifications.spec.ts` (new) | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-notifications.yaml` (new) | pending |

## Existing coverage

### Unit tests

- `apps/web/src/pages/preferences/PreferencesPage.spec.tsx` — `PreferencesPage push toggle OS permission (LS-7089)` (denied, undecided→granted, dismissed, already granted, API unavailable, turn OFF while denied)

### E2E tests (hermetic)

Signed-out half only, in `preferences.spec.ts` → `Preferences Page — unauthenticated`: `shows the notifications sign-in card instead of toggles` (asserts push toggle absent), `Sign In CTA navigates to the home / auth gate`. No signed-in channel toggle is exercised.

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences-notifications.spec.ts` (4)

1. Signed in, seeded `pushEnabled: false, emailEnabled: true`: `Push notifications` switch unchecked, `Email notifications` checked.
2. Toggle `Email notifications` OFF → `UpdateNotificationPreferences` fired with `emailEnabled: false`, switch unchecked, `Saved` banner shown.
3. Toggle `Push notifications` ON with `Notification.permission` stubbed `granted` (`addInitScript`) → mutation with `pushEnabled: true`; with `denied` the switch stays off and the blocked hint is shown, no mutation sent.
4. Persistence: with the mock now returning the updated values, reload and both channel switches show the saved state.

### android — `maestro/flows/preferences/preferences-notifications.yaml` (2)

1. "Notification Preferences" panel shows `Push Notifications` and `Email Notifications` switches.
2. Tap `Email Notifications`; state flips and persists after leaving and re-entering the Notifications screen (restore at end).

## Known defects (existing tickets)

LS-7089 Done; LS-7090 (in-app channel missing), LS-7092 (no SMS) To Do; LS-7091 (server suppression) In Review — being worked elsewhere.
