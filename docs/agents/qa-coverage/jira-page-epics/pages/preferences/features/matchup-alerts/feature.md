# Feature: Matchup Alerts Preferences

**Jira:** LS-5611
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Toggles for Matchup started (`matchupStartedEnabled`), Matchup ended (`matchupEndedEnabled`), Close game alerts (`matchupCloseGameEnabled`), Matchup reminders (`matchupReminderEnabled`) and — present in code but not in the story/page doc — Touchdown alerts (`touchdownAlertEnabled`, default off), plus the `closeGameThreshold` stepper (±1 / ±10, floor 5 via `clampCloseGame`). Signed-in users only; saved through the `UpdateNotificationPreferences` mutation.

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                      | Status  |
| -------- | ---------- | ---------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences-notifications.spec.ts` (new) | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-notifications.yaml` (new) | pending |

## Existing coverage

### Unit tests

- `apps/web/src/pages/preferences/closeGameThreshold.spec.ts` — floor at 5, ceiling, rounding/NaN fallback
- `apps/web/src/pages/preferences/PreferencesPage.spec.tsx` — save failure/retry with kept toggle (LS-7082)

### E2E tests

None. `notifications-hub.spec.ts` mocks `getusernotificationpreferences` only for the notifications list page; the shared mock returns `null`, so the signed-in Notifications section is never exercised on `/preferences`.

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences-notifications.spec.ts` (5)

1. Signed in with `getusernotificationpreferences` seeded (e.g. started on, ended off, close-game on, reminders off, touchdown off): each switch (`Matchup started`, `Matchup ended`, `Close game alerts`, `Matchup reminders`, `Touchdown alerts`) reflects the seeded state.
2. Toggling `Matchup started` sends `UpdateNotificationPreferences` with `matchupStartedEnabled` flipped (assert the intercepted variables) and the switch shows the new state.
3. Close-game stepper: `Increase by 1` / `Increase by 10` / `Decrease by 10` change the displayed threshold and the mutation's `closeGameThreshold`; `Decrease by 1` at the floor (5) does not go lower.
4. Persistence: after the mock returns the updated preferences and the page is reloaded (or navigated away and back), the toggles show the saved values.
5. `Touchdown alerts` toggle exists and defaults off (documents the extra control the story omits).

### android — `maestro/flows/preferences/preferences-notifications.yaml` (3)

Reached via You → `you-notifications` → `notifications-page` → "Notification Preferences" panel (`NotificationSettings`).

1. Panel shows `Matchup Started`, `Matchup Completed`, `Close Game Alerts`, `Touchdown Alerts`, `Matchup Reminders`.
2. Tap `Matchup Started`; the switch state flips.
3. Leave and re-enter the screen; the flipped state persists (server-backed). Restore the original state at the end.

## Known defects (existing tickets)

LS-7085 (no per-league granularity) To Do, LS-7086 (1pt threshold) Done, LS-7087 (opt-in defaults) In Progress — being worked elsewhere, assert seeded values rather than defaults — LS-7088 (premium alerts) To Do.
