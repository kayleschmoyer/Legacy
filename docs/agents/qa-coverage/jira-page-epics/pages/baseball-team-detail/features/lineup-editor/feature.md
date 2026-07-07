# Feature: Lineup Editor

**Jira:** LS-5360
**Page:** `baseball-team-detail` (Epic LS-5261)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Touch and click-friendly lineup editor with position slot management for
batters/pitchers on the web Team Detail page
(`/baseball/teams/:teamId`). The team's GM can select a player (a starter
or a bench player) and then tap an eligible lineup slot to assign or swap
them in, or tap "Move ... to bench" to bench a starter.

Prior to this ticket, the web Team Detail page only rendered a static,
read-only roster list with no way to edit a lineup (tracked as LS-6032).
This feature wires the same lineup board already used on the League
Detail "Roster" tab into the Team Detail page so GMs have a working
lineup editor here too.

## Source

Extracted from: `docs/agents/pages/teams/baseball-team-detail.md`

## Implementation

**Component:** `lib/shared-components/src/features/roster/RosterBoard.tsx`
(`@legacy-sports/shared-components/roster`), reused as-is from the League
Detail Roster tab (`apps/web/src/pages/baseball/league-detail-v2/tabs/Roster.tsx`).

**Page:** `apps/web/src/pages/baseball/TeamDetailPage.tsx` renders
`RosterBoard` in place of the former static roster list, passing the
team's `leaguePositions` and `teamMembers`, and wiring:

| Interaction                                  | Mutation                                        |
| -------------------------------------------- | ----------------------------------------------- |
| Assign a bench player to an open lineup slot | `updateTeamMemberPosition`                      |
| Move a starter back to the bench             | `updateTeamMemberPosition` (`positionId: null`) |
| Swap two starters' slots                     | `swapTeamMemberPositions`                       |

`RosterBoard` is rendered `readOnly` for anyone who is not the team's GM
(visitors and other league members can still view the lineup).

## Test Coverage

### Unit tests

File: `apps/web/src/pages/baseball/TeamDetailPage.spec.tsx`

`describe('TeamDetailPage – lineup editor (LS-5360)')`:

- Renders the lineup board as editable for the team's GM
- Renders the lineup board as read-only for a visitor

(`RosterBoard`'s own interaction logic — select/assign/swap/bench — is
covered by `lib/shared-components/src/features/roster/RosterBoard.spec.tsx`.)

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/lineup-editor.spec.ts`

`describe('Lineup Editor — GM assigns and benches a player @regression')`:

- Moving a bench player into an open lineup slot fires
  `updateTeamMemberPosition` and the player now shows in that slot
- Moving a starter back to the bench fires `updateTeamMemberPosition`
  and the player now shows on the bench

`describe('Lineup Editor — visitor sees a read-only board @regression')`:

- A visitor cannot select a player to edit the lineup

## Related

- **Epic:** LS-5261 — QA — Page: Baseball Team Detail
- **Implementation ref:** `docs/agents/pages/teams/baseball-team-detail.md`
- **Absorbed finding:** LS-6032 — Lineup edit not exposed on web
  TeamDetailPage (this ticket builds the missing UI the finding called out)
