# Feature: Matchups List Tab

**Jira:** LS-5419
**Page:** `football-league-detail` (Epic LS-5268)
**Platforms:** web
**Entitlement:** all

## Description

List of all matchups for the current/selected week within the football
league detail page's Matchup tab, with the viewer's own matchup pinned to
the top of the list, a status badge per matchup (Live / Final / Scheduled /
Cancelled), and tap-to-open detail view.

Baseball leagues are unaffected — the list only renders for football
(`league.sport === Sport.Football`), preserving baseball's existing
single-matchup flow.

Key behaviours:

- **List of matchups** — every matchup returned by `GetMatchupsByWeek` for
  the selected week renders as a card (team names, scores, status).
- **Pinned matchup** — the matchup containing the viewer's own team sorts
  to the top of the list regardless of API response order; falls back to
  server order for observers with no team in the league.
- **Status badge** — each card shows Live (in-progress), Final (completed),
  Scheduled, or Cancelled, sourced from `MatchupCard`'s status presentation.
- **Projected score (Premium)** — each team row shows "Proj <score>" beneath
  its actual score when the matchup has a server-computed projection
  (`Matchup.winProbability`, gated by `ENTITLEMENTS.matchup_projections`);
  hidden for completed matchups and non-entitled viewers, for whom the
  field resolves to `null` (LS-6323).
- **Tap to open detail** — tapping a card selects that matchup as the
  active "browse" matchup, rendering its scoreboard hero and roster
  comparison below the list (reusing the tab's existing browse mechanism).

## Implementation

**Shared component:** `MatchupCard` (`lib/shared-components/src/features/matchup/MatchupCard.tsx`)

**Web:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Matchup.tsx` wires
`MatchupGrid` (`apps/web/src/features/matchup/MatchupGrid.tsx`) into the
Matchup tab for football leagues only, sorting the viewer's matchup to the
front of the list before handing it to the grid.

| Component / hook   | File                                                            | Purpose                                                           |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `MatchupCard`      | `lib/shared-components/src/features/matchup/MatchupCard.tsx`    | Cross-platform card: teams, scores, status badge                  |
| `MatchupGrid`      | `apps/web/src/features/matchup/MatchupGrid.tsx`                 | Web grid wrapper: header, count badge, loading/error/empty states |
| `MatchupTab` (web) | `apps/web/src/pages/baseball/league-detail-v2/tabs/Matchup.tsx` | Wires the pinned matchup list in for football; tap-to-browse      |

**GraphQL query:** `useGetMatchupsByWeekQuery` (`lib/graphql/src/getMatchupsByWeek.query.graphql`)

## Test Coverage

### Unit tests

File: `apps/web/src/pages/baseball/league-detail-v2/tabs/Matchup.spec.tsx`

`describe('MatchupTab — Matchups List (LS-5419)')` — renders for football,
does not render for baseball or when there are no matchups, pins the
viewer's matchup to the top, leaves ordering unchanged for observers, and
browses to a tapped matchup's detail view.

File: `lib/shared-components/src/features/matchup/MatchupCard.spec.tsx`

Covers `MatchupCard`'s projected-score row (LS-6323): renders "Proj
<score>" for both teams when `matchup.winProbability` is present, omits it
when absent (completed matchup / non-entitled viewer).

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/football-matchups-list.spec.ts`

`describe('Football Matchups List — pinned ordering & status @regression')`
— renders a card per matchup, pins the viewer's matchup to the top even
when the API returns it second, shows Live/Scheduled status badges, shows
the projected score for a matchup with premium projections (LS-6323), and
opens a tapped matchup's detail view.

## Related

- **Epic:** LS-5268 — QA — Page: Football League Detail
