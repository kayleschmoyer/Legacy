# Feature: Football Roster Comparison

**Jira:** LS-5429
**Page:** `football-matchup-detail` (Epic LS-5269)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Side-by-side roster comparison on the standalone Football Matchup Detail page
(`/football/league/:leagueId/matchups/:matchupId`, rendered by
`apps/web/src/pages/matchup/MatchupDetailPage.tsx`). Rows are built per
football position slot (QB, RB, WR, TE, FLEX, K, DST) via the shared
`POSITION_SLOT_ORDER` map (`lib/shared-components/src/features/roster/rosterUtils.ts:18-46`),
so empty slots stay visible. Each starter row shows the player's NFL
team-eligible position badge, name, projected points, and actual points,
computed the same way as baseball (`calculateGameScore` /
`calculatePlayerProjection` in `apps/web/src/features/matchup/MatchupRosterComparison.tsx:304-393`).
A bench toggle reveals additional rostered players. Clicking a player name or
an actual-score cell opens the football-specific `FootballPlayerDetailModal`
instead of the baseball season/matchup-breakdown modals.

Matchup-level game status (scheduled/in-progress/final) is surfaced by the
surrounding page (`MatchupScoreboard`), not as a per-slot label. No explicit
per-player "bye week" indicator exists in the current implementation on any
platform.

## Source

Extracted from: `pages/football-matchup-detail/features/football-roster-comparison/feature.md`

## Implementation

### Web

**File:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx`

Renders `<MatchupRosterComparison matchup={matchup} userTeamId={userTeamId} sport={leagueSport} />`
(line 290-294) inside `MatchupDetailLayout`'s `rosterComparison` slot.
`leagueSport` is computed at line 69 (`leagueData?.league?.sport ?? Sport.Baseball`).

**`apps/web/src/features/matchup/MatchupRosterComparison.tsx`**

The same component baseball uses, made sport-aware via the `sport` prop
(`isFootball = sport === Sport.Football`, line 188):

- Groups rows by football position slot (QB/RB/WR/TE/FLEX/K/DST) instead of
  baseball's batter/pitcher slots when `isFootball` (`getPositionGroup`,
  line 87).
- Clicking a player name or an already-scored actual value calls
  `openFootballPlayerDetail` (line 854), which opens `FootballPlayerDetailModal`
  (line 1262) instead of baseball's `PlayerSeasonStatsModal`/
  `PlayerMatchupStatsModal` (routing branches at lines 947-948 and 976-977).
- Section headings and totals rows adapt their labels for football
  (`'Starting Lineup'` vs `'Starting Lineup — Batters'`, line 1144).

**`apps/web/src/components/FootballPlayerDetailModal.tsx`** — football
player-detail modal opened on player-name/actual-score click.

> **Fixed alongside LS-5429:** `MatchupDetailPage.tsx` previously rendered
> `MatchupRosterComparison` without a `sport` prop even though `leagueSport`
> was already computed, so football leagues on this specific page silently
> fell back to baseball-style modal routing and badge colors. The League
> Detail "Matchup" tab (`apps/web/src/pages/baseball/league-detail-v2/tabs/Matchup.tsx:555`)
> already passed `sport` correctly; this page did not.

### Cross-platform (mobile-web)

Reuses the same `apps/web/src/features/matchup/MatchupRosterComparison.tsx`
web component (mobile-web renders the web app in a mobile viewport).

### Android

**`apps/app/src/screens/leagues/football/FootballMatchupScreen.tsx`** — a
separate, bespoke implementation (`RosterSection`/`getPositionOrder`), not
the shared cross-platform `MatchupRosterComparison` component baseball uses
on Android.

### Shared utilities

**`lib/shared-components/src/features/roster/rosterUtils.ts`**

- `POSITION_SLOT_ORDER` (lines 18-46) — canonical slot sort order, includes
  QB/RB/WR/TE/FLEX/K/DST/DL/LB/DB alongside the baseball slots.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                    | Status  |
| -------- | ---------- | -------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/football-roster-comparison.spec.ts`    | covered |
| android  | Maestro    | `maestro/flows/football-matchup-detail/roster-comparison.yaml` | pending |

## Test Coverage

### Unit tests

`apps/web/src/features/matchup/MatchupRosterComparison.spec.tsx` — describe
block "MatchupRosterComparison - football (LS-5418)" covers slot labels and
modal routing.

Android: `FootballMatchupScreen.spec.ts` and
`FootballMatchupScreen.component.spec.tsx` have solid Jest coverage of the
bespoke roster section, but no automated E2E (Maestro) coverage exists yet.

### E2E tests (hermetic — `apps/web-e2e/src/tests/`)

**`apps/web-e2e/src/tests/football-roster-comparison.spec.ts`** — covers the
standalone Matchup Detail page:

- all seven football position slot labels (QB/RB/WR/TE/FLEX/K/DST) render
  for both teams' starting lineups
- a projected and an actual point value render for a starter
- clicking a player name, and clicking an actual-score cell, both open
  `FootballPlayerDetailModal`
- the bench toggle reveals/hides additional rostered players

**`apps/web-e2e/src/tests/football-matchup-tab.spec.ts`** — covers the
_different_ League Detail "Matchup" tab route
(`/football/league/:leagueId/matchup`), not this standalone page.

> **Coverage gap (follow-up, not in scope for LS-5429):** no Maestro flow
> exists yet for football matchup detail roster comparison on Android — only
> `maestro/flows/baseball-matchup-detail/matchups-tab.yaml` exists today. A
> target flow path of `maestro/flows/football-matchup-detail/roster-comparison.yaml`
> is suggested for a follow-up story.

## Related

- **Epic:** LS-5269 — QA — Page: Football Matchup Detail
- **Web page:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx`
- **Web component:** `apps/web/src/features/matchup/MatchupRosterComparison.tsx`
- **Modal:** `apps/web/src/components/FootballPlayerDetailModal.tsx`
- **Android screen:** `apps/app/src/screens/leagues/football/FootballMatchupScreen.tsx`
- **Utilities:** `lib/shared-components/src/features/roster/rosterUtils.ts`
- **Baseball analog:** `docs/agents/qa-coverage/jira-page-epics/pages/baseball-matchup-detail/features/roster-comparison/feature.md`
