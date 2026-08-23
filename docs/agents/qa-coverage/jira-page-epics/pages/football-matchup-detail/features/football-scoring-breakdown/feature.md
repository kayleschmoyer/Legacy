# Feature: Scoring Breakdown / Box Score

**Jira:** LS-5431
**Page:** `football-matchup-detail` (Epic LS-5269)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Category-by-category fantasy scoring (passing yards, rushing TDs, etc.) or simplified
per-player fantasy points. Per the LS-5269 epic journey: "As a user, I want a per-player
scoring breakdown / box score so that I can see how each starter contributed."

## Implementation

**Page:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx` (route
`/football/league/:leagueId/matchups/:matchupId`, shared with baseball's
`/baseball/league/:leagueId/matchups/:matchupId`)

**Component:** `apps/web/src/features/matchup/MatchupRosterComparison.tsx`, rendered into
`MatchupDetailLayout`'s `rosterComparison` slot. This is the same component baseball uses
(see `pages/baseball-matchup-detail/features/roster-comparison/feature.md`); a `sport` prop
swaps baseball labels/position-grouping/click-routing for football-specific ones — "Starting
Lineup" (not "— Batters"/"— Pitchers"), "Team Total" (not "Hitters Total"), QB/skill/kicker/
defense badge grouping instead of catcher/infield/outfield/pitcher, and clicking a player name
or actual score opens `FootballPlayerDetailModal` instead of the baseball season/matchup-stat
modals.

**Fixed as part of LS-5431:** `MatchupDetailPage` never passed the `sport` prop to
`MatchupRosterComparison`, so the football matchup detail route silently rendered the baseball
presentation (wrong headings, baseball position grouping, and player clicks opening the
baseball modals instead of `FootballPlayerDetailModal`) even though the component's own football
behavior was already built and unit-tested (`MatchupRosterComparison.spec.tsx`, "MatchupRosterComparison
— football (LS-5418)"). Now wired via `sport={leagueSport}`.

## Platform coverage

| Platform | Harness    | Spec / Flow                                                         | Status  |
| -------- | ---------- | ------------------------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/football-matchup-scoring-breakdown.spec.ts` | covered |
| android  | Maestro    | `maestro/flows/football-matchup-detail/scoring-breakdown.yaml`      | pending |

## Test Coverage

### Unit tests

File: `apps/web/src/features/matchup/MatchupRosterComparison.spec.tsx`

`describe('MatchupRosterComparison — football (LS-5418)')` — pre-existing, unaffected by this
ticket:

- renders football position slot labels (QB, RB) instead of baseball ones
- opens the football player detail modal (not the baseball season modal) when a player name is
  clicked

File: `apps/web/src/pages/matchup/MatchupDetailPage.spec.tsx`

`describe('MatchupDetailPage – roster comparison sport wiring (LS-5431)')` — new, guards the
`sport` prop wiring fixed by this ticket:

- passes `sport="football"` for a football league
- passes `sport="baseball"` for a baseball league

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/football-matchup-scoring-breakdown.spec.ts`

`describe('Football Matchup Scoring Breakdown – structure @regression')`:

- shows the football "Starting Lineup" heading, not the baseball batters/pitchers split
- shows the football "Team Total" totals row label, not "Hitters Total"
- shows each starting player row for both teams
- shows football position slot labels (QB, RB)

`describe('Football Matchup Scoring Breakdown – player click @regression')`:

- clicking a player name opens the football player detail modal, not the baseball season-stats
  modal
- clicking a player's actual score also opens the football player detail modal

## Coverage gap — per-player fantasy points do not compute for football

The epic's full journey also requires: "assert each starting player row shows their fantasy
points and that the per-player totals sum to the team score shown in the header." This part is
**not covered**, because it does not currently work: `MatchupRosterComparison`'s scoring math
(`calculateGameScore` / `calculatePlayerProjection`, via `@legacy-sports/scoring`'s
`computeScoring` and `useLeagueScoringSettings`'s `BaseballScoringSettings`) only reads
`MatchupPlayer.games[].battingGame/pitchingGame/fieldingGame` — baseball-only GraphQL fields
resolved from baseball stat tables (`lambdas/db/src/schema/matchups/types.ts`). Football's real
per-game fantasy data instead lives in a completely separate shape
(`FootballMatchupPlayer.games[]` — passing/rushing/receiving/kicking/defense/idp, fetched via
the `matchupScores` query used by `MatchupAdditionalSections`'s "Key Players to Watch"). A
football `MatchupPlayer`'s `games[].battingGame/pitchingGame/fieldingGame` are therefore always
null in production, so every football player's actual/projected score renders as `—`/0 and the
totals row never reflects real fantasy points. This spec deliberately does not fabricate
`battingGame`-shaped mock data for football players to fake a passing assertion here — real
football matchups can never produce that shape, so a test doing so would assert a scenario
production cannot reach (see the file's own header comment).

Filed as a separate Bug ticket (linked via "Relates" per the qa-coverage-model.md gotcha — a
Bug/finding can't have a Story as its Jira `parent`) rather than fixed in this ticket: closing
the gap means giving `MatchupRosterComparison` a football-specific scoring path (or a parallel
component) sourced from `matchupScores`/`FootballMatchupPlayer.totalPoints`, which is
implementation work beyond this Feature Story's "prove the journey with an E2E test" scope.

## Related

- **Epic:** LS-5269 — QA — Page: Football Matchup Detail
- **Web component:** `apps/web/src/features/matchup/MatchupRosterComparison.tsx`
- **Modal:** `apps/web/src/components/FootballPlayerDetailModal.tsx`
- **Baseline (baseball) feature doc:** `pages/baseball-matchup-detail/features/roster-comparison/feature.md`
- **Bug ticket:** football fantasy-points computation gap (see Coverage gap above) — filed and
  linked to LS-5431 via "Relates"
