# Feature: Danger Zone Sign Out

**Jira:** LS-5640
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Destructive Sign Out button in Danger Zone card that clears session.

## Implementation

`ProfileSettingsPage.tsx` (Session card; "Sign out?" Dialog; `signOut.ts` calls `auth.logout`); native sign-out confirmation in `profile-settings.tsx`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                | Status  |
| -------- | ---------- | ---------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-sign-out.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/danger-zone-sign-out.yaml` | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

`apps/web-e2e/src/tests/profile-settings.spec.ts`:

- should display Sign Out button
- should display sign out description text

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `apps/web/src/pages/profile/ProfileSettingsPage.render.spec.tsx` (LS-7221): asks for confirmation, signs out on confirm, stays signed in on cancel
- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.spec.tsx`: "sign out" describe incl. hardware back (LS-7223)

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-sign-out.spec.ts` (4)

- [ ] Clicking Sign Out opens the "Sign out?" dialog without signing out
- [ ] "Stay signed in" closes the dialog; the page and session remain (no logout request)
- [ ] Confirming "Sign out" clears the session and the app shows the login surface in place at `/profile/settings` (EnhancedAuthGuard — "Continue with Google" visible, Profile Settings heading hidden)
- [ ] Keyboard: Enter / Space on the focused Sign Out control opens the dialog

### android — `maestro/flows/profile-settings/danger-zone-sign-out.yaml` (3)

- [ ] Scroll to Sign Out and tap it; assert the confirmation dialog
- [ ] Tap cancel; assert still on Profile Settings
- [ ] Confirm; assert the login screen renders

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
