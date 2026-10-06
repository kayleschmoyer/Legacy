# Feature: Notifications Load & Error States

**Jira:** LS-5613
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

While `GetUserNotificationPreferences` is loading the Notifications section shows a `Loading…` spinner; on failure it shows an error card with a `Retry` button (disabled/busy with a spinner while refetching, LS-7095). The error card stays expanded even if the section was persisted as collapsed (LS-7093).

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                      | Status  |
| -------- | ---------- | ---------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences-notifications.spec.ts` (new) | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-notifications.yaml` (new) | pending |

## Existing coverage

### Unit tests

- `apps/web/src/pages/preferences/PreferencesPage.error-collapse.spec.tsx` — keeps error card expanded when persisted collapsed, ignores header presses in error, honours collapsed again after recovery
- `apps/web/src/pages/preferences/PreferencesPage.spec.tsx` — `PreferencesPage notifications Retry (LS-7095)` (enabled when idle, disabled/busy during refetch)

### E2E tests

None.

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences-notifications.spec.ts` (3)

1. Loading: delay the `getusernotificationpreferences` response (`route.fulfill` after a gate) → `Loading…` visible and no channel switches yet; release → switches render and the spinner is gone.
2. Error: fulfill `getusernotificationpreferences` with a GraphQL `errors` payload → the error card and `Retry` are visible and no toggles render.
3. Retry: second request fulfilled successfully → clicking `Retry` shows the loaded toggles; also assert the error card remains visible with `ls_prefs_sections_collapsed` seeded `{"notifications":true}`.

### android — `maestro/flows/preferences/preferences-notifications.yaml` (1)

Maestro runs against the live backend, so the error state cannot be forced; the error/loading paths stay covered by the hermetic web spec and unit tests.

1. After opening the Notifications screen the "Notification Preferences" panel renders its loaded switches (no error text / retry control visible).

## Known defects (existing tickets)

LS-7093, LS-7094, LS-7095 — all Done.
