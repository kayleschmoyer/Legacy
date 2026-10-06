# Page Epic: QA — Page: Profile Settings

**Jira:** LS-5293
**Page slug:** `profile-settings`
**Route:** `/profile/settings` (web), `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/profile-settings.tsx` (native)

The Profile Settings page is where a signed-in user manages their account: profile card, username edit, preset avatar, Account & Security, linked identities (Discord), subscription status (native), and sign-out. Coverage here means a passing hermetic automated E2E flow per declared platform — see [`../../README.md`](../../README.md).

## Feature stories

- [Account & Security Card](features/account-security-card/feature.md) — LS-5636
- [Android Keyboard Input Handling](features/android-keyboard-input-handling/feature.md) — LS-5637
- [App Avatar Picker](features/app-avatar-picker/feature.md) — LS-5638
- [Connected Accounts (Discord)](features/connected-accounts-discord/feature.md) — LS-5639
- [Danger Zone Sign Out](features/danger-zone-sign-out/feature.md) — LS-5640
- [Premium Status Display](features/premium-status-display/feature.md) — LS-5641
- [Profile Card Display](features/profile-card-display/feature.md) — LS-5642
- [Unsaved Changes Warning](features/unsaved-changes-warning/feature.md) — LS-5643
- [Username Edit Flow](features/username-edit/feature.md) — LS-5644

## Coverage summary (LS-10616 audit)

| Feature story                           | Web     | Android | Target web spec                                                      | Target Maestro flow                                              | Pending (web / android / total) |
| --------------------------------------- | ------- | ------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------- |
| LS-5636 Account & Security Card         | pending | pending | `apps/web-e2e/src/tests/profile-settings-account-security.spec.ts`   | `maestro/flows/profile-settings/account-security-card.yaml`      | 2 / 2 / 4                       |
| LS-5637 Android Keyboard Input Handling | n/a     | pending | `n/a (android only)`                                                 | `maestro/flows/profile-settings/keyboard-input.yaml`             | 0 / 4 / 4                       |
| LS-5638 App Avatar Picker               | pending | pending | `apps/web-e2e/src/tests/profile-settings-avatar.spec.ts`             | `maestro/flows/profile-settings/app-avatar-picker.yaml`          | 4 / 3 / 7                       |
| LS-5639 Connected Accounts (Discord)    | pending | pending | `apps/web-e2e/src/tests/profile-settings-connected-accounts.spec.ts` | `maestro/flows/profile-settings/connected-accounts-discord.yaml` | 6 / 4 / 10                      |
| LS-5640 Danger Zone Sign Out            | pending | pending | `apps/web-e2e/src/tests/profile-settings-sign-out.spec.ts`           | `maestro/flows/profile-settings/danger-zone-sign-out.yaml`       | 4 / 3 / 7                       |
| LS-5641 Premium Status Display          | pending | pending | `apps/web-e2e/src/tests/profile-settings-premium-status.spec.ts`     | `maestro/flows/profile-settings/premium-status-display.yaml`     | 4 / 3 / 7                       |
| LS-5642 Profile Card Display            | pending | pending | `apps/web-e2e/src/tests/profile-settings-profile-card.spec.ts`       | `maestro/flows/profile-settings/profile-card-display.yaml`       | 5 / 3 / 8                       |
| LS-5643 Unsaved Changes Warning         | pending | pending | `apps/web-e2e/src/tests/profile-settings-unsaved-changes.spec.ts`    | `maestro/flows/profile-settings/unsaved-changes-warning.yaml`    | 4 / 3 / 7                       |
| LS-5644 Username Edit Flow              | pending | pending | `apps/web-e2e/src/tests/profile-settings-username-edit.spec.ts`      | `maestro/flows/profile-settings/username-edit.yaml`              | 5 / 4 / 9                       |

Android is `pending` everywhere: `maestro/flows/profile-settings/` does not exist yet. Note `.agents/skills/testing/SKILL.md` positions Maestro as a visual QA sweep and functional native coverage as the shared Playwright suite via the native `AppDriver` (epic LS-8444); the android targets above follow `qa-coverage-model.md`, which names Maestro. Reconcile when the first android feature chip is dispatched.

## Findings and related tickets

- LS-10618 (PSA-001) — web hard-codes "Google OAuth" as Sign-in Method (new, filed by this audit).
- Premium status on web: LS-7226, LS-7230, LS-7234 (existing, To Do).
- LS-10523 — preset avatars not keyboard accessible (existing). LS-10613 — team logo URL validation residual (existing, team variant).
- LS-10415 / LS-10414 / LS-10412 — native Discord connect + parity tests + Maestro flow (existing, To Do).
- LS-7611 — Feature Discovery Gaps bucket for this page.

## Discovery notes (no Feature Story exists)

- **Two-Factor Authentication card** — covered by `apps/web-e2e/src/tests/two-factor-auth.spec.ts` (enroll, wrong code, disable).
- **Linked Identities canonical email ("Set as primary")** — covered by the LS-7825 describe in `profile-settings.spec.ts`.
- **Unauthenticated guard and a11y landmarks** — `profile-settings.spec.ts` (LS-3506, LS-3507).
- The epic text says the route is `/profile`; the real route is `/profile/settings`.
