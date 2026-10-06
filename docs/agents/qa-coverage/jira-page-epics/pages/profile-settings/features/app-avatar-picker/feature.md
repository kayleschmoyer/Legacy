# Feature: App Avatar Picker

**Jira:** LS-5638
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

AvatarPicker selects from preset avatars and persists via useUpdateUserAvatarMutation; shows loading indicator during update.

## Implementation

`lib/shared-components/src/components/AvatarPicker.tsx` (`variant="user"`), consumed by `ProfileSettingsPage.tsx` (`handleAvatarSelect`, toast "Avatar updated" / "Avatar removed") and native `profile-settings.tsx` (Edit avatar disclosure).

## Platform coverage

| Platform | Harness    | Spec / Flow                                              | Status  |
| -------- | ---------- | -------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-avatar.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/app-avatar-picker.yaml`  | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

`apps/web-e2e/src/tests/profile-settings.spec.ts`:

- App Avatar picker (LS-7212): "saving a preset sends its page-origin-resolved URL"
- App Avatar picker (LS-7212): "Clear resets the preview and sends a null avatar"
- should display App Avatar section

`apps/web-e2e/src/tests/profile-league-branding.spec.ts`:

- "should render the avatar preset grid with PRESETS label"
- "should display the avatar preview section"
- "should not render a custom URL input for user avatars" (LS-10443)
- "should render Save and Clear action buttons"
- "clicking Save triggers the UpdateUserAvatar mutation"

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `lib/shared-components/src/components/AvatarPicker.spec.tsx` and `AvatarPicker.emit.spec.tsx`
- `apps/web/src/pages/profile/ProfileSettingsPage.avatarSave.spec.tsx` (LS-7236: toast after save, no toast on error)
- `apps/app/src/app/(app)/profile-settings.spec.tsx`: "avatar" describe

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-avatar.spec.ts` (4)

- [ ] After a successful preset save the "Avatar updated" toast shows and the profile card avatar `<img src>` updates to the saved preset (mock `GetUserById` refetch returns the new `avatarUrl`)
- [ ] After Clear the "Avatar removed" toast shows and the profile card falls back to the initial
- [ ] While `UpdateUserAvatar` is in flight the Save button shows "Saving..." and is disabled (delay the mocked response)
- [ ] A failed `UpdateUserAvatar` (GraphQL error) shows no success toast and leaves the previous avatar in place

### android — `maestro/flows/profile-settings/app-avatar-picker.yaml` (3)

- [ ] Open Profile Settings, tap "Edit avatar"; assert the preset grid and Save / Clear render
- [ ] Select a preset and tap Save; assert the avatar on the card changes
- [ ] Tap Clear; assert the avatar falls back to initials

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

LS-6882 (custom-URL validation) is Done; LS-10443 then removed the custom-URL field for the user variant, so the user picker is presets-only — absence is pinned by the PLB test above and no MIME/size/EXIF journey applies. The team-logo variant (residual URL validation) is tracked by LS-10613 and is out of scope for this page. Preset keyboard/AT accessibility is an open bug, LS-10523; do not add a keyboard assertion until it is fixed.

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
