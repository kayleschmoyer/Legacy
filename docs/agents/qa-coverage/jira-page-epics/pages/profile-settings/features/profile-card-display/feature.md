# Feature: Profile Card Display

**Jira:** LS-5642
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Renders user avatar (with initials fallback on image error), username, read-only email, access level badge (admin/user/none), and read-only user ID.

## Implementation

`ProfileSettingsPage.tsx` Profile card (`getAvatarInitial`, `useImageLoadError`, `getAccessLevelLabel`: Administrator / Member / Limited); native `profile-settings.tsx` profile section.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                    | Status  |
| -------- | ---------- | -------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-profile-card.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/profile-card-display.yaml`     | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

`apps/web-e2e/src/tests/profile-settings.spec.ts`:

- should load and display the Profile Settings heading
- should display the Profile section with user information
- should display username field
- should display email field
- should not expose the internal User ID
- should display Access Level field
- should display info banner about Google-managed profile
- should display page meta description

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `ProfileSettingsPage.spec.ts` (`getAvatarInitial`), `ProfileSettingsPage.render.spec.tsx` (LS-7232 photo attrs, initial fallback on image error)
- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.spec.tsx`: "initial rendering"

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-profile-card.spec.ts` (5)

- [ ] Rendered values, not just labels: username, email and `#<id>` from the mocked user
- [ ] No image: the card shows the username initial; with a picture URL it renders an `<img alt=username>`
- [ ] Image load error falls back to the initial
- [ ] Access level shows "Administrator" / "Member" / "Limited" for admin / user / none (badge and field row)
- [ ] Email row is read-only (no Edit control other than the username)

### android — `maestro/flows/profile-settings/profile-card-display.yaml` (3)

- [ ] Open Profile Settings; assert avatar/initial, username, email and `#<id>`
- [ ] Assert the access-level badge text
- [ ] Assert only the username row has an Edit control

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

Existing web tests assert labels only. `user.picture` comes from the auth context, so the spec must seed it through the auth fixture (check `apps/web-e2e/src/fixtures`).

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
