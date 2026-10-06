# Feature: Android Keyboard Input Handling

**Jira:** LS-5637
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** android
**Entitlement:** all

## Description

Form inputs handle Android keyboard correctly with no overlap and proper focus.

## Implementation

`apps/app/src/app/(app)/profile-settings.tsx`: `KeyboardAvoidingView` (`behavior="height"` on Android) wrapping a `ScrollView` with `keyboardShouldPersistTaps="handled"`; username input in the editing row.

## Platform coverage

| Platform | Harness    | Spec / Flow                                          | Status  |
| -------- | ---------- | ---------------------------------------------------- | ------- |
| web      | Playwright | —                                                    | n/a     |
| android  | Maestro    | `maestro/flows/profile-settings/keyboard-input.yaml` | pending |

## Existing coverage

No existing hermetic E2E coverage.

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- none

## Pending assertions

### android — `maestro/flows/profile-settings/keyboard-input.yaml` (4)

- [ ] Tap Edit on the username row; assert the input is focused and the keyboard opens
- [ ] With the keyboard open, assert the input and its Save / Cancel buttons are still visible (not hidden behind the keyboard)
- [ ] Type a valid username and tap Save with the keyboard open (single tap — `keyboardShouldPersistTaps`); assert edit mode exits
- [ ] Re-enter edit mode, dismiss the keyboard (back); assert the typed value is retained or the editor exits cleanly with no overlap

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

No coverage exists at any layer (no unit, no Maestro). Per `.agents/skills/testing/SKILL.md`, Maestro is positioned as a visual/AI-judging sweep and functional native coverage as the shared Playwright suite through the native `AppDriver` (epic LS-8444); keyboard overlap is inherently native, so the Maestro flow is the target here, with screenshots for `/mobile-qa` judging.

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
