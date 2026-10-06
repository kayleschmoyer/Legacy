# Feature: Sports — Stats Format

**Jira:** LS-5617
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Standard / Expanded stats-format chip group. Persisted in `ls_user_preferences.statsFormat`; for authenticated web users it is also saved server-side (`UpdateUserPreferences` mutation, hydrated from `GetUserPreferences`, LS-7138). Consumed by the web player-stats table and native `useStatsFormat` (unknown/corrupt values → `standard`).

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                     | Status  |
| -------- | ---------- | --------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` (new) | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-sports-stats.yaml` (new) | pending |

## Existing coverage

### Unit tests

- `apps/app/src/common/utilities/useStatsFormat.spec.ts` — `readStatsFormat` defaults/expanded/standard/unrecognized/absent/corrupt; hook resolves on focus
- `apps/app/src/app/(app)/preferences.spec.tsx` — `renders both stats format chip options`

### E2E tests (hermetic)

- `preferences.spec.ts` — `should display Stats format selector with Standard and Expanded` (visibility only; the selector is never clicked)
- Consumer side, `apps/web-e2e/src/tests/player-stats-format-preference.spec.ts` (`Player Stats — Stats Format Preference`): `standard-default`, `standard-explicit`, `expanded-explicit` (shows PA), `on-focus-refresh`, `corrupt-fallback`, `statsVisibleColumns overrides statsFormat…`

The consumer journey is covered by seeding storage; the **setter** journey on `/preferences` is not.

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` (4)

1. Default state: `Standard` radio checked (`expectStatsFormatSelected` helper on `PreferencesSurface`).
2. Selecting `Expanded` checks it, writes `statsFormat: 'expanded'` to `ls_user_preferences`, shows `Saved`, and (signed in) sends `UpdateUserPreferences` with `input.statsFormat = 'expanded'`.
3. After reload `Expanded` is still checked.
4. Server hydration: `getuserpreferences` fulfilled with `statsFormat: 'expanded'` while local storage says `standard` → `Expanded` is shown.

Optional follow-up for the chip: one end-to-end hop — pick `Expanded` here, then open `/players` and assert the PA column appears (reuses the selectors in `player-stats-format-preference.spec.ts`).

### android — `maestro/flows/preferences/preferences-sports-stats.yaml` (3)

1. Sports & Stats card shows `Standard` and `Expanded` chips with `Standard` selected by default.
2. Tap `Expanded`; chip shows selected.
3. Leave and return; `Expanded` persists (restore `Standard` at the end).

## Known defects (existing tickets)

LS-7102 (`expanded` never consumed) To Do — appears stale given `player-stats-format-preference.spec.ts`, owner to re-triage; LS-7103 Done; LS-7104 (premium sabermetrics gate) To Do.
