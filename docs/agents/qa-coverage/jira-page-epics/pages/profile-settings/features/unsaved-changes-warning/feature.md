# Feature: Unsaved Changes Warning

**Jira:** LS-5643
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Warns user about unsaved edits when navigating away; success/error toasts on save.

## Implementation

`apps/web/src/hooks/useUnsavedChangesGuard.ts` (window `beforeunload` + capture-phase click on `[role=tab]` / `a[href]`, uses `window.confirm`); `ProfileSettingsPage.tsx` guards a dirty username and an in-flight avatar save; native back handler in `profile-settings.tsx`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                       | Status  |
| -------- | ---------- | ----------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-unsaved-changes.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/unsaved-changes-warning.yaml`     | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

No existing hermetic E2E coverage.

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `apps/web/src/hooks/useUnsavedChangesGuard.spec.ts`
- `ProfileSettingsPage.avatarSave.spec.tsx` (LS-7236) and `ProfileSettingsPage.render.spec.tsx` (LS-7237 beforeunload while saving)
- `apps/app/src/app/(app)/profile-settings.spec.tsx`: "unsaved-changes guard (LS-7235)"

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-unsaved-changes.spec.ts` (4)

- [ ] Dirty username + in-app nav link click raises a confirm dialog ("Discard unsaved changes?"); dismissing keeps the page and typed value
- [ ] Accepting the dialog navigates away and abandons the edit
- [ ] No prompt when the input is unchanged, after Cancel, or after a successful save
- [ ] While `UpdateUserAvatar` is in flight a nav click prompts "Your avatar is still saving. Leave anyway?"

### android — `maestro/flows/profile-settings/unsaved-changes-warning.yaml` (3)

- [ ] Edit the username, press back; assert Keep editing / Discard dialog
- [ ] Keep editing: still on the screen with the typed value
- [ ] Discard: navigates back

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

Playwright handles `window.confirm` via `page.on("dialog")`. The description says "success/error toasts on save": web shows a success toast only for avatar saves ("Avatar updated"/"Avatar removed"); a username save shows the updated value and inline errors with no toast. That is a description mismatch rather than a user-facing defect, so it is covered by the Username Edit assertions and not filed. The browser back button is deliberately not intercepted (see the hook docstring).

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
