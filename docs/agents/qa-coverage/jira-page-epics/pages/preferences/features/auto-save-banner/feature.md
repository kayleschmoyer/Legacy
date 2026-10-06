# Feature: Auto-Save Confirmation Banner

**Jira:** LS-5610
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

A fixed-position banner confirms each auto-saved change for ~2 seconds. Web: `data-testid="prefs-save-banner"`, text `Saved` (or `Failed to save` when the save fails and is retried — `useSavedBanner`/`useRetryingSave`, LS-7082). Native: inline `Preferences saved` row that clears after 2000 ms.

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                                  | Status  |
| -------- | ---------- | ------------------------------------------------------------ | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/preferences.spec.ts`                 | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-autosave-banner.yaml` | pending |

## Existing coverage

### Unit tests

- `apps/web/src/pages/preferences/SavedBannerContext.spec.tsx` — shows then hides after the duration; failed-save flag; overlapping saves restart the timer
- `apps/web/src/pages/preferences/useRetryingSave.spec.ts`, `useCoalescedSave.spec.ts`, `savePrefs.spec.ts` — retry/backoff, coalescing, storage failure
- `apps/web/src/pages/preferences/PreferencesPage.spec.tsx` — `PreferencesPage notification save failure (LS-7082)`
- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/preferences.spec.tsx` — `saves updated preferences through AsyncStorage`

### E2E tests (hermetic)

- `preferences.spec.ts` — `should auto-save preference to localStorage when theme is changed` (banner appears), `should reset to defaults when localStorage is cleared and page is reloaded` (banner appears), signed-out `Appearance section is still usable when signed out`
- `user-preferences.spec.ts` — `clicking the Dark theme chip selects it and persists to localStorage` (banner within 5 s)

The **appears** half is covered via theme changes only; the **disappears after ~2 s** half, non-theme triggers, and the failure state are not asserted.

## Pending assertions

### web — `apps/web-e2e/src/tests/preferences.spec.ts` (3)

1. After the banner appears (theme change), `expectSaveBannerHidden()` within ~2–4 s (add the hidden-assertion to `PreferencesSurface`; use web-first `toBeHidden` with timeout, not fixed sleeps).
2. A non-theme change (Animations toggle, Default sport chip, Show season totals) also shows `Saved`.
3. Failure path: with a signed-in session and `updatenotificationpreferences` fulfilled with a GraphQL error, toggling a channel shows `Failed to save`; the next successful save flips it back to `Saved`.

### android — `maestro/flows/preferences/preferences-autosave-banner.yaml` (2)

1. Change any control (e.g. tap `Dark` chip or the animations toggle); `Preferences saved` becomes visible.
2. `extendedWaitUntil` / `assertNotVisible: "Preferences saved"` after ≈2–3 s.

## Known defects (existing tickets)

LS-7080, LS-7081, LS-7082, LS-7084 Done; LS-7083 Won't Do; LS-7663 (debounce guard gap) To Do.
