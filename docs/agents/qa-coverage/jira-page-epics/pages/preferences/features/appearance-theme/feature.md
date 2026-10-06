# Feature: Appearance — Theme Selector

**Jira:** LS-5609
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

System / Light / Dark theme chip group (`role="radiogroup"` `aria-label="Theme"`, each chip `aria-label="<name> theme"`). The choice applies immediately and is owned by `ThemeContext`, persisted under `ls_theme_preference` (never written into the `ls_user_preferences` blob — LS-7078).

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                             | Status  |
| -------- | ---------- | ------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/dark-mode.spec.ts`              | covered |
| android  | Maestro    | `maestro/flows/preferences/preferences-appearance.yaml` | pending |

## Existing coverage

### Unit tests

- `apps/web/src/context/ThemeContext.spec.tsx` — follows live OS changes when `system`, ignores them when pinned, persists to its own key, migrates a legacy blob theme
- `apps/web/src/pages/preferences/PreferencesPage.spec.tsx` — `PreferencesPage theme ownership (LS-7078)`
- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/preferences.spec.tsx` — `renders all three theme chip options`; `calls setThemePreference with light/dark/system when … chip is pressed`

### E2E tests (hermetic)

`apps/web-e2e/src/tests/dark-mode.spec.ts`: `Preferences page – theme section renders` (heading, label, System/Light/Dark radios), `Theme preference – persistence to localStorage` (Dark/Light/System store the value), `Theme preference – survives page reload` (Dark and Light restored), `Dark mode` / `Light mode – component rendering` (`app-container` class + background colour), `Contrast check` (WCAG AA both modes), `Theme change takes effect immediately without reload`, `System theme default` (System chip `aria-checked` with nothing stored).

Supporting: `preferences.spec.ts` — `should display Theme selector with System, Light, Dark options`, `should auto-save preference to localStorage when theme is changed` (also asserts theme is not mirrored into the prefs blob), `should reset to defaults when localStorage is cleared and page is reloaded`, signed-out `Appearance section is still usable when signed out`; `user-preferences.spec.ts` — `shows Theme label and options`, `clicking the Dark theme chip selects it and persists to localStorage`.

Web journey (select non-default theme → document theme updates → survives reload) is fully asserted, so web is `covered`. Optional hardening only: System chip following an `emulateMedia({ colorScheme })` change without reload (currently unit-only, LS-7076).

## Pending assertions

### web — none (0)

### android — `maestro/flows/preferences/preferences-appearance.yaml` (3, shared with LS-5608)

1. Land on the Preferences screen and the `System`, `Light`, `Dark` chips are visible.
2. Tap `Dark`; the chip shows selected (needs chip `testID`/selected state) and the screen background changes (screenshot checkpoint for the visual judge).
3. Relaunch the app and the Dark selection persists; restore `System` at the end so the flow is re-runnable.

## Known defects (existing tickets)

LS-7075 (cross-device sync), LS-7076 (live OS change), LS-7077 (hard-coded swatch hex), LS-7078 (split-brain storage) — all Done; LS-7079 (premium themes) To Do.
