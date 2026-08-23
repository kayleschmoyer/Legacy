# Feature: Football Roster Display

**Jira:** LS-5446
**Page:** `football-team-detail` (Epic LS-5272)
**Platforms:** android
**Entitlement:** all

> The originating ticket listed platforms as "web, mobile-web, android." Only
> `android` (mobile native) has an implementation to test today — web and
> mobile-web have no Football Team Detail page at all
> ([LS-6438](https://bkrupa.atlassian.net/browse/LS-6438)). Revisit this
> Platforms line once LS-6438 ships.

## Description

The Football Team Detail page's Roster tab groups a team's roster into
football position slots (QB, RB, WR, TE, FLEX, K, DST — or DL/LB/DB in place
of DST for IDP leagues) with player name and position-badge labels per slot.

## Source

Extracted from: `docs/agents/pages/teams/football-team-detail.md`

## Implementation

**Component:** `apps/app/src/app/(app)/football/team/[teamId].tsx` renders
`FootballLeagueRosterScreen`
(`apps/app/src/screens/leagues/football/FootballLeagueRosterScreen.tsx`) under
the "Roster" tab. `getSlotOrder(defensiveFormat)`
(`FootballLeagueRosterScreen.tsx:89-93`) returns QB/RB/WR/TE/FLEX/K/DST/BN for
standard leagues, or QB/RB/WR/TE/FLEX/K/DL/LB/DB/BN for IDP leagues. Each
member is grouped by their assigned `positionId`, resolved to a slot via a
`positionId -> positionType` lookup built from the `rosterSlots` prop (the
league's roster slots, shared with the `Lineup` tab), falling back to Bench
(`BN`) when `positionId` is `null` or unresolved (fixed by
[LS-6433](https://bkrupa.atlassian.net/browse/LS-6433) — previously this
grouped by the first matching `player.eligiblePositions` entry instead,
disagreeing with the `Lineup` tab). Each slot section carries
`testID="<slot>-card"` (lowercase, e.g. `qb-card`, `bn-card`) for E2E
selection.

**Navigation entry point (LS-5446):** prior to this ticket, the page had no
reachable navigation path in the app — the only two links to it
(`LeagueStandings.tsx`, and a `LeagueTeamsTab` inside an orphaned generic
`league/[leagueId].tsx` route) were dead code and were deleted. The real entry
point is now the football league page's **Overview** tab
(`apps/app/src/app/(app)/football/league/[leagueId].tsx`) → Quick Standings
row (`apps/app/src/features/leagues/LeagueOverviewTab.tsx`,
`testID="overview-standings-row-<teamId>"`).

## Test Coverage

### Maestro flow (Android)

File: `maestro/flows/football-team-detail/roster-tab.yaml`

- Opens the first league, presses a Quick Standings row on Overview to reach
  Team Detail, and taps the "Roster" tab
- Asserts the `QB` slot section renders (`qb-card`)
- Scrolls to and asserts the `K` slot section renders (`k-card`)
- Asserts whichever defensive slot the league's format uses — `dst-card`
  (standard) or `dl-card`/`db-card` (IDP)
- Scrolls to and asserts the Bench slot section renders (`bn-card`)

### Unit tests

- `apps/app/src/screens/leagues/football/FootballLeagueRosterScreen.component.spec.tsx`
  — slot labels per defensive format, player name rendering, the
  `positionId`-based grouping (LS-6433), and the `<slot>-card` testIDs
- `apps/app/src/features/leagues/LeagueOverviewTab.spec.tsx` — Quick Standings
  row `onTeamPress` wiring (LS-5446)
- `apps/app/src/app/(app)/football/league/[leagueId].spec.tsx` — Overview tab
  Quick Standings row navigates to `/football/team/[teamId]` (LS-5446)

### Known gaps (out of scope for LS-5446)

- No Playwright/web coverage — no web implementation exists to test
  ([LS-6438](https://bkrupa.atlassian.net/browse/LS-6438))

## Related

- **Epic:** LS-5272 — QA: Football Team Detail
- **Implementation ref:** `docs/agents/pages/teams/football-team-detail.md`
