# Feature: Sports — Default Sport

**Jira:** LS-5615
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Baseball / Football default-sport chip group (`role="radiogroup"`), persisted as `defaultSport` (`baseball` | `football`) in `ls_user_preferences`. Consumed by the web home page (`readDefaultSport()` in `HomePage.tsx`) and native `useDefaultSport` (corrupt/unknown values fall back to `baseball`).

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                     | Status  |
| -------- | ---------- | --------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` (new) | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-sports-stats.yaml` (new) | pending |

## Existing coverage

### Unit tests

- `apps/app/src/common/utilities/useDefaultSport.spec.ts` — defaults, stored football, unrecognized value, corrupt JSON, storage throws, resolve on focus
- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/preferences.spec.tsx` — `renders both default sport chip options`

### E2E tests (hermetic)

- `preferences.spec.ts` — `should display Default sport selector with Baseball and Football`; `should persist preferences across page reload` (selects Football, reloads, asserts `ls_user_preferences.defaultSport === 'football'` in storage — **never asserts the chip is selected after reload**)

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` (3)

1. Selecting `Football` marks the Football radio `aria-checked` and Baseball unchecked (add `expectSportSelected` to `PreferencesSurface`).
2. After reload the Football radio is still checked; switching back to `Baseball` and reloading shows Baseball checked and `defaultSport: 'baseball'` stored.
3. Consumer: with `defaultSport: 'football'` seeded, `/` (home) opens on the football view — verify the observable behavior of `HomePage`'s `defaultSport` prop before writing the assertion.

### android — `maestro/flows/preferences/preferences-sports-stats.yaml` (3, shared with LS-5616 / LS-5617)

1. Preferences screen → Sports & Stats card shows `Baseball` and `Football` chips.
2. Tap `Football`; chip shows selected.
3. Leave the screen and return (focus re-read): `Football` is still selected; restore `Baseball` at the end.

## Known defects (existing tickets)

LS-7099 (consumed by home route) Done; LS-7100 (no "both" option) To Do.
