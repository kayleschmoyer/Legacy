# Feature: Standings Tab

**Jira:** LS-8659
**Page:** `baseball-league-detail` (Epic LS-5259)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The full league standings table (rank, team, W, L, and related columns), with the
current user's team highlighted and tagged with a "You" badge. Reached via the
league detail tab bar (scrolls to reveal Matchups / Trades / Waivers / Standings
on narrow viewports).

The tab lives at `/baseball/league/{leagueId}/standings`.

Key behaviours:

- **Ranked list** — rank badge (gold for 1st/3rd, silver for 2nd), team avatar +
  name, W/L (always visible); T/Win% (`$gtSm`+), PF/PA/Diff (`$gtMd`+), Waiver
  order (`$gtMd`+, only when `league.waiverEnabled`)
- **Current-user highlight** — the viewer's team row is tinted and tagged with a
  "You" chip; the team-name cell wraps to up to two lines instead of
  ellipsis-truncating, and the chip stays clear of the adjacent W/L columns even
  when it wraps (LS-8659 — QA finding from an Android emulator sweep)
- **Sortable columns** — clicking a header sorts by that column, toggling
  direction on repeat clicks; defaults to Win% descending
- **Division grouping** — when standings include a `divisionId`, teams render
  grouped under their division name with rank reset per group
- **Row press** — `onTeamPress`/`getTeamUrl` navigate to the team's page
- **States** — loading, error, and empty (no standings) states
- **Playoff bracket** — rendered below the table when `league.playoffEnabled`

## Source

Extracted from manual QA on Android emulator (2026-07-24).

## Implementation

**Shared component:** `lib/shared-components/src/features/matchup/StandingsTable.tsx`

**Web wrapper:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Standings.tsx`

Wired into `LeagueDetailPageV2` at the `standings` tab slot; the tab key is
defined in `apps/web/src/pages/baseball/league-detail-v2/tabConfig.ts`.

**Native:** `apps/app/src/app/(app)/baseball/league/[leagueId].tsx` renders the
same `StandingsTable`, fed by `apps/app/src/features/matchup/hooks/useStandings.ts`.

**GraphQL query:** `useGetLeagueStandingsQuery` (`lib/graphql/src/getLeagueStandings.query.graphql`)

| Component / hook        | File                                                              | Purpose                                                         |
| ----------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `StandingsTable`        | `lib/shared-components/src/features/matchup/StandingsTable.tsx`   | Cross-platform canonical table (rank/W/L/"You" tag/sorting)     |
| `PlayoffBracket`        | `lib/shared-components/src/features/matchup/PlayoffBracket.tsx`   | Rendered below the table when playoffs are enabled              |
| `StandingsTab` (web)    | `apps/web/src/pages/baseball/league-detail-v2/tabs/Standings.tsx` | Web wrapper; fetches standings + bracket, computes waiver order |
| `useStandings` (native) | `apps/app/src/features/matchup/hooks/useStandings.ts`             | Native data hook feeding the shared table                       |

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/matchup/StandingsTable.spec.tsx`

`describe('StandingsTable')` — table wiring, sort toggling, division grouping,
loading/error/empty states, "You" chip presence, and (LS-8659) rendering the
full team name alongside the "You" chip instead of ellipsis-truncating a long
name.

File: `apps/web/src/pages/baseball/league-detail-v2/tabs/Standings.spec.tsx`

Table wiring, subtitle text, fallback to unsorted list, playoff bracket
show/hide.

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/league-detail-tabs.spec.ts`

`describe('Standings Tab — navigation @smoke')` — tab-bar navigation smoke.

File: `apps/web-e2e/src/tests/standings.spec.ts`

Data rendering, error state, empty state.

File: `apps/web-e2e/src/tests/league-standings-tab.spec.ts`

`describe('Standings Tab — ranked list @regression')` — selecting the tab from
the tab bar shows the ranked team list with W/L columns and tags the current
user's team.

`describe('Standings Tab — "You" tag layout @regression')` — on a narrow
(375px) viewport, the "You" tag does not overlap the W/L columns when the
current user's team name wraps to two lines (LS-8659 AC).

## Related

- **Epic:** LS-5259 — QA — Page: Baseball League Detail
