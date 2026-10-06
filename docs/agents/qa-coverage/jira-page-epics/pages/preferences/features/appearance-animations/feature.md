# Feature: Appearance — Enable Animations Toggle

**Jira:** LS-5608
**Page:** `preferences` (Epic LS-5290)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

ON/OFF toggle for animations persisted to localStorage (`ls_user_preferences.enableAnimations`). Web renders an ARIA switch labelled `Animations`; native renders `Enable animations`. The default is OFF when the OS requests reduced motion (`getDefaultEnableAnimations`), otherwise ON; `useReducedMotion` (shared-components) consumes the stored value.

## Source

Extracted from: `docs/agents/pages/preferences.md`

## Platform coverage

| Platform | Harness    | Spec / Flow                                             | Status  |
| -------- | ---------- | ------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/user-preferences.spec.ts`       | pending |
| android  | Maestro    | `maestro/flows/preferences/preferences-appearance.yaml` | pending |

## Existing coverage

### Unit tests

- `apps/web/src/pages/preferences/defaultEnableAnimations.spec.ts` — defaults OFF under reduced motion, ON otherwise, ON without `matchMedia`
- `lib/shared-components/src/hooks/useReducedMotion.spec.ts` — true when OS requests reduced motion or `enableAnimations` is stored false; reacts to same-tab changes
- `apps/app/src/app/(app)/preferences.spec.tsx` — `renders the Enable animations toggle label`

### E2E tests (hermetic)

- `apps/web-e2e/src/tests/preferences.spec.ts` — `should display Animations toggle`
- `apps/web-e2e/src/tests/user-preferences.spec.ts` — `shows Animations toggle`; `Animations toggle is interactive` (flips the switch and asserts the new `checked` state — **no persistence assertion**)

## Pending assertions

### web — `apps/web-e2e/src/tests/user-preferences.spec.ts` (4)

1. Fresh storage with no OS reduced-motion request (Playwright default): switch is checked (ON).
2. Toggling OFF writes `enableAnimations: false` into `ls_user_preferences`.
3. After `page.reload()` the switch is still unchecked (`animationsChecked()` false); toggling back ON and reloading shows checked.
4. With `emulateMedia({ reducedMotion: 'reduce' })` and no stored preference the switch defaults to unchecked.

### android — `maestro/flows/preferences/preferences-appearance.yaml` (3, shared with LS-5609)

1. Land on the Preferences screen (`you-preferences` → `preferences-page` anchor) and the `Enable animations` toggle is visible.
2. Tap the toggle; its state flips (assert via a toggle `testID`/checked state, not text).
3. `stopApp` + relaunch (or leave and re-enter) and the toggle keeps the flipped state.

## Known defects (existing tickets)

LS-7072 (reduced-motion default, Done), LS-7073 (preference consumed app-wide, Done), LS-7074 (premium motion profiles, To Do).
