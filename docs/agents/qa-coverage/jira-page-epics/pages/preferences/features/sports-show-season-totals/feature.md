# Feature: Sports — Show Season Totals Toggle

**Jira:** LS-5616
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

ON/OFF switch labelled `Show season totals`, persisted as `showSeasonTotals` in `ls_user_preferences`.

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                     | Status  |
| -------- | ---------- | --------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` (new) | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-sports-stats.yaml` (new) | pending |

## Existing coverage

### Unit tests

- `apps/app/src/app/(app)/preferences.spec.tsx` — `renders the Show season totals toggle label`

### E2E tests (hermetic)

- `preferences.spec.ts` — `should display Show season totals toggle` (visibility only)

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` (3)

1. Toggling the `Show season totals` switch flips its `aria-checked` and shows the `Saved` banner (add toggle/checked helpers to `PreferencesSurface`).
2. The value is written to `ls_user_preferences.showSeasonTotals`.
3. After reload the switch keeps the toggled state.

Do **not** assert a downstream effect: the preference is not read by any stats/box-score component yet (LS-7101, open). When that ticket lands, its author should add the consumer assertion here.

### android — `maestro/flows/preferences/preferences-sports-stats.yaml` (2)

1. `Show season totals` toggle visible in the Sports & Stats card; tap flips its state.
2. State survives leaving and re-entering the screen (restore at the end).

## Known defects (existing tickets)

LS-7101 (never read downstream) To Do.
