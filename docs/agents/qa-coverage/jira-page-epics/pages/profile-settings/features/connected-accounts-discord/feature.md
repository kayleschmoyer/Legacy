# Feature: Connected Accounts (Discord)

**Jira:** LS-5639
**Page:** `profile-settings` (Epic LS-5293)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Conditional Discord OAuth connect/disconnect flow when auth.config.discordClientId exists; disconnect requires confirmation modal; handles connecting/error states.

## Implementation

Web: the "Linked Identities" card in `ProfileSettingsPage.tsx` (`handleConnectDiscord`, `handleUnlinkProvider`, `Disconnect {provider}?` Dialog). Callback landing: `apps/web/src/pages/auth/DiscordCallbackPage.tsx`. Native: `connected-accounts-card` in `profile-settings.tsx` (disconnect only; connect tracked by LS-10414).

## Platform coverage

| Platform | Harness    | Spec / Flow                                                          | Status  |
| -------- | ---------- | -------------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/profile-settings-connected-accounts.spec.ts` | pending |
| android  | Maestro    | `maestro/flows/profile-settings/connected-accounts-discord.yaml`     | pending |

`mobile-web` is exercised by the same web spec under the Mobile Chrome / Mobile Safari Playwright projects (`profile-settings` specs are not excluded from them), so it has no separate row.

## Existing coverage

`apps/web-e2e/src/tests/discord-callback.spec.ts`:

- "valid code links Discord and redirects to profile settings with the identity shown" (@critical)
- error states: missing code, missing state, already linked, generic link failure, session changed mid-flow, access_denied

`apps/web-e2e/src/tests/profile-settings.spec.ts`:

- Linked Identities (LS-7825): renders the section, canonical badge, "Set as primary", "Disconnect" button visibility, SetCanonicalEmail mutation

Unit / component coverage (supporting evidence only — does not make a row `covered`):

- `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.spec.tsx`: "connected accounts (LS-10410)" and "disconnect Discord (LS-10413)" describes

## Pending assertions

### web — `apps/web-e2e/src/tests/profile-settings-connected-accounts.spec.ts` (6)

- [ ] With `discordClientId` configured and no Discord identity, the "Connect Discord" row ("Not connected") renders; without it the row is absent
- [ ] Clicking "Connect Discord" navigates to `{oauthProxyUrl}/discord/authorize?link=1`; with no `oauthProxyUrl` the inline "Unable to start Discord connection" error shows
- [ ] Clicking Disconnect on the Discord row opens the "Disconnect Discord?" dialog and sends no request until confirmed
- [ ] "Keep connected" closes the dialog, sends no unlink request and keeps the Discord row
- [ ] Confirming sends the unlink request (mocked `AuthService.unlinkProvider` endpoint) then refetches identities; the row returns to "Not connected"
- [ ] An unlink failure (e.g. 409) shows the server message inline and keeps the row; the button shows a spinner while in flight

### android — `maestro/flows/profile-settings/connected-accounts-discord.yaml` (4)

- [ ] Open Profile Settings; assert the Connected Accounts card lists the linked Discord row
- [ ] Tap Disconnect; assert the "Disconnect Discord?" confirmation; "Keep connected" dismisses it with the row intact
- [ ] Confirm Disconnect; assert the row returns to "Not connected"
- [ ] Connect Discord via in-app browser return — blocked on LS-10414/LS-10412; coordinate with LS-10415 (already targets a Maestro flow for this card)

Maestro flows follow `maestro/flows/trade-center/trade-center.yaml` (`launch-authenticated` subflow, screenshots under `maestro/artifacts/profile-settings/`). They run against a real dev build with `EXPO_PUBLIC_BYPASS_AUTH=true`, so assertions must tolerate seeded data.

## Notes

The Jira description calls this card "Connected Accounts"; on web it is the Linked Identities card and also holds canonical-email management (covered by LS-7825 tests, no story of its own — see epic.md discovery notes).

## Related

- **Epic:** LS-5293 — QA — Page: Profile Settings
- **Implementation ref:** `docs/agents/pages/profile/settings.md`
- **Audit:** LS-10616
