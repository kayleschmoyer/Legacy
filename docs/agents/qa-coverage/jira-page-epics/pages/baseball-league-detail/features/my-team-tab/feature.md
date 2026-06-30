# Feature: My Team Tab

**Jira:** LS-5344
**Page:** `baseball-league-detail` (Epic LS-5259)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Member-only tab (`tab key: team-settings`, also accessible via the `/my-team`
URL alias) that lets league members rename their team and update team branding —
avatar logo (URL or `AvatarPicker` preset) plus primary and secondary hex brand
colors. Non-members see a gated empty state instead.

### Non-Member Empty State

Condition: `!userTeamId && !loading`

- Card with icon, title "No team yet", sub-text "Join this league to manage your team profile."

### Team Name Editor

- Displays the current team name in a text input (pre-seeded from `useGetTeamByIdQuery`).
- "Save Name" button is disabled until the trimmed value differs from the persisted name.
- Pressing Enter in the input triggers the same save flow as clicking "Save Name".
- Clicking "Save Name" (or pressing Enter) opens a confirmation dialog (`role="alertdialog"`) — the rename mutation is **not** fired until the dialog is confirmed.
- Confirming calls `useRenameTeamMutation` with `teamId`, `leagueId`, and the trimmed new name.
- Cancelling the dialog closes it without firing the mutation.
- On success: transient "Saved" flash on the button (1.5 s), `onSaved('name')` callback.
- On error: error banner (`role="alert"`, `aria-live="assertive"`) above the section.

### Team Branding Card

**Logo section**

- Live avatar preview (colored circle with initials) reflects the current primary color and team name.
- Logo URL text input; empty string is stored as `null` on save.

**Colors section**

- Primary Color: row of preset color swatches (`aria-label="Pick primary color #RRGGBB"`).
- Secondary Color: row of the same preset swatches.
- "Save Branding" button saves `primaryColor`, `secondaryColor`, and `logoUrl` via `useUpdateTeamBrandingMutation`.
- On success: transient "Saved" flash on the button, `onSaved('branding')` callback.
- On error: same error banner as the name flow.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/tabs/my-team.md`

## Implementation

**Web tab:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Team.tsx`

The tab is wired into the league-detail V2 router under the `team-settings` key
(with `/my-team` as a URL alias — LS-2940). It renders its own editorial markup
and delegates all save wiring to `useTeamBranding`.

**Shared save hook:** `lib/shared-components/src/features/teams/useTeamBranding.ts`

Owns form state, dirty tracking, the rename and branding mutations, and the
transient "Saved" flash. Used by both the web tab and the native
`TeamBrandingControl` component.

**Native (cross-platform) component:** `lib/shared-components/src/features/teams/TeamBrandingControl.tsx`

Tamagui-based presentation layer wrapping `useTeamBranding`; used on mobile-web
and Android.

**GraphQL:**

| Hook / Mutation                 | Purpose                           |
| ------------------------------- | --------------------------------- |
| `useGetTeamByIdQuery`           | Seeds name, colors, logo on mount |
| `useRenameTeamMutation`         | Persists team name change         |
| `useUpdateTeamBrandingMutation` | Persists colors + logo            |

**Preset colors:** `TEAM_BRANDING_PRESET_COLORS` (8 values) in `useTeamBranding.ts`.
Default primary: `#1B3A5C`, default secondary: `#C5A55A`.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/teams/TeamBrandingControl.spec.tsx`

`describe('TeamBrandingControl (LS-7809)')`:

- Disables Save Name until the name is changed
- Renames the team with the trimmed new name
- Saves colors and logo via the branding mutation
- Hides save buttons when `canEdit` is false

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/league-detail-tabs.spec.ts`

`describe('my-team URL alias — LS-2940 regression @regression')`:

- `/my-team` URL stays on `/my-team`, mounts the team-settings panel, and shows no error

`describe('Team rename confirmation — LS-4018 @regression')`:

- Clicking Save Name opens a confirmation dialog and does not call the rename mutation directly
- Cancel closes the dialog without renaming
- Confirming the dialog submits the rename mutation with the new name
- Pressing Enter in the input opens the confirmation dialog instead of submitting directly

### Coverage gaps

- Non-member empty state is not covered by E2E (only renders when `userTeamId` is falsy; existing mocks always supply `teamId: 1`).
- Branding save (colors + logo URL) has no dedicated E2E test; covered by unit tests only.
- "Saved" flash duration and error-banner rendering are not E2E-verified.

## Related

- LS-5259 — Epic: QA — Page: Baseball League Detail
- LS-7809 — `useTeamBranding` shared hook + `TeamBrandingControl` native component
- LS-2940 — `/my-team` URL alias regression
- LS-4018 — Team rename confirmation dialog + QR code skeleton
