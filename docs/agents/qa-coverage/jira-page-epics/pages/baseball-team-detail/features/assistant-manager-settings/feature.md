# Feature: Assistant Manager Settings

**Jira:** LS-5359
**Page:** `baseball-team-detail` (Epic LS-5261)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Card shown in the team detail page allowing a team's General Manager to manage assistant
managers — trusted users granted the `assistant_manager` permission level to help manage the
team's roster and lineup. Displays the existing assistant managers with per-row Remove buttons,
a username input + Invite button to add a new one, and empty-state messaging when there are none.

Rendered as item 6 in the team detail page layout, below the Team Settings section
(GM/Commissioner only).

## Source

Extracted from: `docs/agents/pages/baseball/teams/detail.md`

## Implementation

### Web component

**File:** `apps/web/src/features/baseball/TeamAssistantManagerSettings.tsx`

Mounted at the bottom of `TeamDetailPage` (`apps/web/src/pages/baseball/TeamDetailPage.tsx`),
passed `teamId` and `leagueId`.

Key responsibilities:

- `useGetTeamLeagueMembersQuery({ teamId })` — fetches league members for the team, filtered
  client-side to `permissionLevel === 'assistant_manager'`
- `useInviteAssistantManagerMutation({ teamId, username })` — invites a user by username,
  refetches members and clears the input on success
- `useRemoveAssistantManagerMutation({ teamId, userId })` — removes an assistant manager,
  refetches members on success
- Empty state text: **"No assistant managers yet."**
- Per-row: username (falls back to `User #{userId}`) + Remove button
  (`aria-label="Remove assistant manager {username}"`)
- Invite form: username `Input` (`aria-label="Username to invite as assistant manager"`) +
  Invite `Button` (`aria-label="Send assistant manager invitation"`), disabled while inviting or
  when the input is blank
- Inline error/success messaging for both invite and remove actions; loading spinner while
  members are loading; error text on query failure

### Data model

`assistant_manager` is a modeled permission level, not UI-only:

- **Migration:** `lib/db-client/migrations/20260226_150000_add_assistant_manager_permission.ts`
- **Enum:** `lib/db-client/src/drizzle/public/models/Enums.ts`
- Referenced in permission checks across `lambdas/db/src/schema/{leagues,teams,trades,matchups}`
  and `lambdas/db/src/schema/authorization.ts`

## Test Coverage

### Unit tests

**`apps/web/src/pages/baseball/TeamDetailPage.spec.tsx`**

Mocks `TeamAssistantManagerSettings` as a stub (`data-testid="assistant-manager-settings"`) —
covers that the page renders the component, not its internal behavior.

> No dedicated `TeamAssistantManagerSettings.spec.tsx` exists yet for the component's own
> behavior (invite/remove/empty-state). Follow-up coverage should be added under
> `apps/web/src/features/baseball/`.

### E2E tests (hermetic)

**`apps/web-e2e/src/tests/team-detail.spec.ts`** and
**`apps/web-e2e/src/tests/team-detail-info-roster-branding.spec.ts`**

Both mock the `getTeamAssistantSettings` / `teamAssistant` GraphQL operations with a fallback
`route.fulfill()` response (`{ teamAssistantSettings: null }`) so the team detail page renders
without erroring — no dedicated assertions on the assistant manager list/invite/remove flow
exist in these specs today.

## Related

- **Epic:** LS-5261 — QA — Page: Baseball Team Detail
- **Page doc:** `docs/agents/pages/baseball/teams/detail.md`
- **Component:** `apps/web/src/features/baseball/TeamAssistantManagerSettings.tsx`
- **Mounted in:** `apps/web/src/pages/baseball/TeamDetailPage.tsx`
- **Migration:** `lib/db-client/migrations/20260226_150000_add_assistant_manager_permission.ts`
