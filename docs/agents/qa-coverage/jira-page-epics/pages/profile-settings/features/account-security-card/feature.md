# Feature: Account & Security Card

**Jira:** LS-5636
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Displays sign-in method (e.g., Google OAuth) and active session indicator.

## Implementation

`apps/web/src/pages/profile/ProfileSettingsPage.tsx` (Account & Security card, `sessionStatus.ts`); native `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.tsx` (`sign-in-method-value`).

## Platform coverage

| Platform | Harness    | Spec / Flow                                                        | Status  |
| -------- | ---------- | ------------------------------------------------------------------ | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-account-security.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/account-security-card.yaml`        | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

`apps/web-e2e/src/tests/profile-settings.spec.ts`:

- should display Account & Security section (heading, "Sign-in Method", "Google OAuth")
- should display active session indicator ("Session" + "Active")

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.spec.tsx`: "derives the sign-in method from linked identities", "renders Active as the session status"

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-account-security.spec.ts` (2)

- [ ] Sign-in Method reflects linked identities for google-only, google+discord and discord-only `MyIdentities` mocks (blocked on LS-10618 — web hard-codes "Google OAuth"; update the existing `expectAccountSecuritySection` assertion in the same PR)
- [ ] Scope lock: the Account & Security card renders no password-change control (2FA lives in its own card, covered by `two-factor-auth.spec.ts`)

### android — `maestro/flows/profile-settings/account-security-card.yaml` (2)

- [ ] Open Profile Settings; assert the Sign-in Method row shows the provider label(s)
- [ ] Assert the Session row shows "Active"

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

Finding PSA-001 / LS-10618 filed for the hard-coded web label.

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
