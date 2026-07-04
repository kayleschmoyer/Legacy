# Feature: Side-by-Side Roster Comparison

**Jira:** LS-5357
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Two roster cards, one per team, laid out side by side for a single matchup. Rows are built
per league position slot (C, 1B, 2B, 3B, SS, LF, CF, RF, U, DH, P, SP, RP) so empty slots stay
visible, followed by a collapsible bench section. Each row shows the player's actual and
projected score, with the higher (best-in-matchup) actual score highlighted. A totals row sums
batting/pitching scores per team. Clicking a player name opens `PlayerSeasonStatsModal`;
clicking an already-scored actual value opens `PlayerMatchupStatsModal` with the game-by-game
breakdown.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md` (§ Roster
Comparison) and `docs/agents/pages/baseball/league/detail/tabs/matchup.md` (§ Roster Comparison).

## Implementation

### Web

**File:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx`

Renders `<MatchupRosterComparison matchup={matchup} userTeamId={userTeamId} />` inside
`MatchupDetailLayout`'s `rosterComparison` slot. The same web component is reused by the
embedded matchup widget at `apps/web/src/pages/baseball/league-detail-v2/tabs/Matchup.tsx`
(League Detail's "Matchup" tab).

**`apps/web/src/features/matchup/MatchupRosterComparison.tsx`**

The web-only, feature-complete implementation:

- Always shows the current user's team in the left column (`userIsTeam2` swap on `team2Id`
  match), so slots line up with the roster editor.
- `useGetMatchupPlayersQuery` + `useGetPositionsForLeagueQuery` + `useGetLeagueTeamsQuery` fetch
  matchup players, league position slots, and team names.
- `useLeagueScoringSettings` supplies scoring weights; `calculateGameScore` /
  `calculatePlayerProjection` (using `@legacy-sports/scoring`'s `computeScoring` /
  `calculateMatchupProjection`) compute each player's actual and projected score.
- Builds one row per league position slot (`batterSlotRows`, `pitcherSlotRows`) so unfilled
  slots render as `"Empty"`; bench is split into `Bullpen` (pitcher-eligible) and
  `BenchFielders` via `isPitcherPositionType`/`isBenchFielder`.
- Renders separate BATTERS and PITCHERS section tables, each with a totals row
  (`team1BatterTotals`, `team1PitcherTotals`, etc.) summing actual/projected scores.
- Single `showBench` toggle ("Show Bench" / "Hide Bench") reveals the bullpen + bench-fielder
  rows for both teams.
- Actual-score color coding: green if a player's score is at/above their pace-adjusted
  projection, red otherwise (`team1ScoreColor`/`team2ScoreColor`).
- Clicking a player's name opens `PlayerSeasonStatsModal` (season stat line); clicking an
  already-played actual score opens `PlayerMatchupStatsModal` (per-game breakdown for this
  matchup).
- Skeleton loading state (`SkeletonLoading`) mirrors the real column/section layout; a banner
  is shown while `isStatsLoading(matchup.statsLoadingStatus)` is true.

**Modals:**

- `apps/web/src/features/matchup/PlayerSeasonStatsModal.tsx` — season-long stat line for a
  clicked player.
- `apps/web/src/features/matchup/PlayerMatchupStatsModal.tsx` — per-game score breakdown
  (batting/pitching/fielding, mapped via `mapBattingStats`/`mapPitchingStats`/`mapFieldingStats`)
  for a clicked actual score.

> **Note:** `apps/web/src/components/matchup/MatchupRosterComparison.tsx` is an older,
> unreferenced duplicate of this component (debug `LOGGER.info` calls throughout, no
> `userTeamId` prop, local `getPositionColors` instead of the shared util). It is not exported
> from `apps/web/src/components/matchup/index.ts` and has no import sites in app code.

### Cross-platform (mobile-web / android)

**`lib/shared-components/src/features/roster/MatchupRosterComparison.tsx`**

Used by `apps/app/src/features/matchup/screens/MatchupDetailScreen.tsx`. A lighter,
cross-platform summary view — no scores or projections, just each team's starters (ordered by
`POSITION_SLOT_ORDER`) with a position badge and player name, plus a per-team collapsible bench
toggle. Fetches `useGetMatchupPlayersQuery`, `useGetPositionsForLeagueQuery`, and
`useGetLeagueTeamsQuery` directly (self-contained, no props beyond `matchup`/`userTeamId`).

### Shared utilities

**`lib/shared-components/src/features/roster/rosterUtils.ts`**

- `POSITION_SLOT_ORDER` — canonical batter-then-pitcher slot sort order
- `isPitcherPositionType()` — classifies a slot/position string as pitching (SP/RP)
- `isEligibleForSlot()` — position-eligibility check (shared with the roster editor)
- `isStatsLoading()` — true while matchup stats are `loading`/`queued`/`retry`
- `getPositionColors()` — Tamagui color tokens for a position badge

## Test Coverage

### Unit tests

No dedicated unit spec exists for either `MatchupRosterComparison` implementation (web or
shared-components) — current coverage is E2E-only (see below).

### E2E tests (hermetic — `apps/web-e2e/src/tests/`)

**`apps/web-e2e/src/tests/player-detail-deeplink.spec.ts`** — `describe('Matchup origin @critical')`:

- desktop/mobile: clicking a player name in the roster comparison opens the season-stats dialog
  (`Gerrit Cole` → `div[role="dialog"]`)
- desktop/mobile: closing the dialog keeps the URL on the matchup route

`apps/web-e2e/src/tests/matchup-detail.spec.ts` covers the surrounding page (loading/error/
not-found/main content area) but does not assert roster-comparison-specific content.

### Integration tests (live-backend, not run in CI on PRs)

**`apps/web-e2e/src/integration/tests/matchup-detail-ui.integration.spec.ts`**

`Phase 9: Roster comparison panel shows BATTERS and PITCHERS`:

- BATTERS section header is present
- PITCHERS section header is present
- "Actual" column header confirms the lineup is populated

**`apps/web-e2e/src/integration/tests/matchup-roster-recap-ui.integration.spec.ts`**

`Phase 1: Roster comparison panel renders correctly`:

- "Player Matchups" card heading renders
- BATTERS / PITCHERS section headers
- "Actual" / "Proj" / "Pos" column headers
- At least one numeric score value (`\d+\.\d{2}`) renders

`Phase 2: Bench toggle expands and collapses the bench section`:

- "Show Bench" is visible; clicking toggles to "Hide Bench" and back

`Phase 4: Manager identity can view the same roster comparison` — repeats Phase 1's checks
under a non-commissioner manager session.

> **Coverage gap**: the epic's own "team owner compares rosters side by side" journey (two
> columns aligned by position slot, with projected/actual points) is only asserted in the
> integration suite, which does not run in CI on PRs. The hermetic suite's only
> roster-comparison-specific coverage is the click-to-modal interaction in
> `player-detail-deeplink.spec.ts`.

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Page doc:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`
- **Tab doc:** `docs/agents/pages/baseball/league/detail/tabs/matchup.md`
- **Web component:** `apps/web/src/features/matchup/MatchupRosterComparison.tsx`
- **Cross-platform component:** `lib/shared-components/src/features/roster/MatchupRosterComparison.tsx`
- **Modals:** `PlayerSeasonStatsModal.tsx`, `PlayerMatchupStatsModal.tsx`
- **Utilities:** `lib/shared-components/src/features/roster/rosterUtils.ts`
- **Feature discovery gaps:** LS-7595 bucket epic already tracks numerous `BMD-###` findings
  against this page, including several specific to this component (e.g. BMD-033, BMD-034,
  BMD-035, BMD-036)
