# Feature: Username Edit Flow

**Jira:** LS-5644
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Edit button toggles text input with Save/Cancel; validates 3-50 chars, alphanumeric + allowed specials, calls useUpdateUsernameMutation; shows Saving and error states.

## Implementation

`ProfileSettingsPage.tsx` (`handleUsernameEdit/Cancel/Save`, `validateUsername` from `@legacy-sports/utils`); native `profile-settings.tsx`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                     | Status  |
| -------- | ---------- | --------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-username-edit.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/username-edit.yaml`             | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

`apps/web-e2e/src/tests/profile-league-branding.spec.ts`:

- Username Edit: Edit button visible; Edit shows input with Save and Cancel; Cancel restores original; too-short error; invalid-characters error; "saving a valid username triggers the UpdateUsername mutation" (variables `{ username: "newuser123" }`)

`apps/web-e2e/src/tests/profile-settings.spec.ts`:

- "should reject a 2-character username without calling the API"
- "should reject a username with emoji and show the character-set error"

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.spec.tsx`: "username editing" describe (validation, mutation, server error)
- `ProfileSettingsPage.render.spec.tsx` (LS-7237 in-flight beforeunload)

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-username-edit.spec.ts` (5)

- [ ] Success: after `UpdateUsername` resolves edit mode exits and the field and profile card heading show the new username (mock the `GetUserById` refetch)
- [ ] Server error: a rejected mutation shows the message inline and keeps edit mode
- [ ] In flight: Save shows "..." and Save / Cancel are disabled (delay the mocked response)
- [ ] Keyboard: Enter submits, Escape cancels
- [ ] Saving an unchanged or whitespace-padded value exits edit mode without calling the API / sends the trimmed value

### android — `maestro/flows/profile-settings/username-edit.yaml` (4)

- [ ] Tap Edit; assert input with Save / Cancel
- [ ] Enter a too-short username; assert the validation error
- [ ] Enter a valid username and Save; assert the new username shows
- [ ] Cancel restores the original

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

Existing tests use fragile text/value locators (`input[value="testuser"]`); the new spec should add Edit / Save / Cancel helpers to `ProfileSurface` in `apps/web-e2e/src/pages/settings.page.ts` (ADR-0015).

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
