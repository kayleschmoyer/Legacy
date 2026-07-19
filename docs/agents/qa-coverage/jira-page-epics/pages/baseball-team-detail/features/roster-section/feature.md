# Feature: Roster Section

**Jira:** LS-5361
**Page:** `baseball-team-detail` (Epic LS-5261)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The Roster section on the Team Detail page is the cross-platform `RosterBoard`
lineup editor (LS-5360): assigned players occupy starting hitter/pitcher
slots showing their position label (e.g. C, SS), and unassigned players
appear in a Bench section showing their eligible positions, or
"Unclassified" when they have none.

## Source

Extracted from: `docs/agents/pages/baseball/teams/detail.md`

## Implementation

**Component:** `apps/web/src/pages/baseball/TeamDetailPage.tsx` renders
`RosterBoard` (`lib/shared-components/src/features/roster/RosterBoard.tsx`)
under the "Roster" heading, passing `leaguePositions` and `teamMembers`.
Players with a non-null `positionId` render as an occupied lineup slot
(position badge + player name); players with `positionId == null` render as
a Bench row showing their `eligiblePositions` joined by " · ", or
"Unclassified" when that list is empty.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/roster-section.spec.ts`

`describe('Roster Section @regression')`:

- "Roster" heading is visible on the team detail page
- Each rostered player's name renders (lineup slot or bench row)
- Assigned players show their position label in the lineup slot (e.g. "C", "SS")
- A bench player with no eligible positions shows the "Unclassified" fallback

## Related

- **Epic:** LS-5261 — QA: Baseball Team Detail
- **Implementation ref:** `docs/agents/pages/baseball/teams/detail.md`
