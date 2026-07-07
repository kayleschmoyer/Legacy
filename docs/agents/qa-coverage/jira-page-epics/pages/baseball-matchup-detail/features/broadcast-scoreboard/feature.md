# Feature: Broadcast-Style Scoreboard

**Jira:** LS-5350
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The broadcast-style scoreboard is the hero of the Matchup Detail page. It presents
the head-to-head score for a single weekly matchup in a split-panel, TV-broadcast
layout with a centered "VS" badge. From top to bottom it shows:

- **Week badge** — `"Week {n}"` with a swords icon
- **Games ratio** — `"{completed}/{total} games"` (games played vs. `gamesPerMatchup`)
- **Status chip** — `LIVE` (in-progress, activity icon), `FINAL` (completed, trophy
  icon), or `SCHEDULED` (clock icon)
- **Games remaining** — `"{n} remaining"` shown in orange, only while the matchup is
  `LIVE` and games are left
- **Per-team name** — clickable when an `onTeamClick` handler is provided; the leading
  team's name renders in brand gold
- **Actual scores** — large tabular-figure display, formatted to two decimals; the
  leading team's score is highlighted in gold, the trailing team is muted
- **Projected final scores** — `"Proj: {n}"` per team, shown only when games remain and
  the matchup is not completed
- **Leading / Winner / Tied indicator** — a green "Leading" dot on the higher-scoring
  team while live, "Winner" once `FINAL`, and an orange "Tied" label on both panels when
  scores are equal
- **Progress bar** — `"{completed} of {total} games completed"` with a percentage (or
  `"Complete"` at 0 remaining) and an animated fill bar

A **stale-data warning** banner (`"Live stats unavailable — showing last saved
scores."`) is surfaced when the live player-stats query errors and the widget falls back
to the matchup's server-stored scores (LS-4038 / LS-2937). When there is no active
matchup the view renders a `"No active matchup"` empty state.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`

## Implementation

### Shared presentational component

**File:** `lib/shared-components/src/features/matchup/MatchupScoreboardView.tsx`

`MatchupScoreboardView` is a pure presentational component — it receives already-computed
scores, projections, and team names and performs no data-fetching, so web and mobile
render identically (LS-7715). Key behaviour:

- Derives `team1Leading` / `team2Leading` / `isTied` from the two scores
- Maps `status` to a `LIVE` / `FINAL` / `SCHEDULED` chip config (background, border, icon,
  label)
- Computes `gamesCompleted = gamesPerMatchup - gamesRemaining` for the ratio and progress
  bar
- Gates projections on `!isCompleted && gamesRemaining > 0 && team1Projected !== null`
- Renders team names as pressable (with hover underline) only when both `onTeamClick` and a
  team id are present
- Exposes the card via `role="region"` with
  `aria-label="Week {n} scoreboard: {team1} vs {team2}"`, and the stale-data banner via
  `role="status" aria-live="polite"`

Exported from `lib/shared-components/src/features/matchup/index.ts`.

### Web data-fetching wrapper

**File:** `apps/web/src/features/matchup/MatchupScoreboard.tsx`

Owns the GraphQL query layer and score computation, then hands computed values to
`MatchupScoreboardView`:

- `useGetMatchupPlayersQuery` — player stats for actual/projected score computation
- `useLeagueScoringSettings` — league scoring rules
- `useGetLeagueTeamsQuery` — resolves `team1Name` / `team2Name`
- `computeMatchupScores(...)` — pure exported helper that sums per-player, per-game scores
  onto each team and computes projections; on a players-query error (or missing inputs) it
  falls back to the matchup's server-stored `team1Score` / `team2Score` instead of
  collapsing to `0.00` (LS-2937)
- Passes `hasPlayersError` through so the view can raise the stale-data banner

Mounted by the page at `apps/web/src/pages/matchup/MatchupDetailPage.tsx` (the `scoreboard`
slot of `MatchupDetailLayout`), with `gamesRemaining = gamesPerMatchup - selectedGamesCount`.

### Mobile (android / mobile-web) wrapper

**File:** `apps/app/src/features/matchup/components/MatchupScoreboard.tsx`

Native data-fetching wrapper that mirrors the web wrapper and renders the same shared
`MatchupScoreboardView`. Score computation lives in
`apps/app/src/features/matchup/computeMatchupScores.ts`. Mounted by
`apps/app/src/features/matchup/screens/MatchupDetailScreen.tsx`.

## Test Coverage

### Unit tests — shared presentational view

**File:** `lib/shared-components/src/features/matchup/MatchupScoreboardView.spec.tsx`

`describe('MatchupScoreboardView')`:

- Renders the `"No active matchup"` empty state when `hasMatchup` is false (and no team
  data leaks through)
- Renders both team names and both scores (`"87.50"`, `"138.00"`)
- Renders the `VS` badge and the `"Week {n}"` label
- Falls back to `"0.00"` when a score is null
- Shows the `LIVE` status chip for in-progress matchups
- Shows the `FINAL` chip and `"Winner"` label for completed matchups
- Shows the `SCHEDULED` chip for scheduled matchups
- Surfaces the stale-data warning when `hasPlayersError` is true, and hides it otherwise
- Shows `"Proj: {n}"` per team when games remain and projections are provided
- Hides projections once the matchup is completed
- Renders team names on the interactive (`onTeamClick`) branch without error

### Unit tests — web score computation

**File:** `apps/web/src/features/matchup/MatchupScoreboard.spec.tsx`

`describe('computeMatchupScores')` — regression coverage for LS-2937 (scoreboard rendered
`"0.00 vs 0.00 Tied"` when the `getMatchupPlayers` query errored):

- Uses `matchup.team1Score` / `team2Score` when the players query errored
- Uses server-stored scores even when partial player data is available (nested `games`
  resolver returned null)
- Falls back when players data is missing (query still loading)
- Falls back when scoring settings are missing
- Returns `0` (not `NaN`) when the matchup has no stored scores and the query errored
- Returns `0-0` with null projections when the matchup is null
- Happy path: sums per-player, per-game scores onto the correct team
- Skips players with a null `positionId`

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/matchup-detail.spec.ts`

All GraphQL responses are mocked (`route.fulfill`), so no live backend is required.

`describe('Matchup Detail – page structure @smoke')`:

- Loads the matchup detail page without an application error
- Shows the `"Matchup Details"` heading
- Shows the `"Back to League"` button, and clicking it navigates back to the league

`describe('Matchup Detail – scoreboard @regression')`:

- Does not show the loading spinner after data loads
- Does not show the not-found state
- Renders the main matchup content area (`[role="main"][aria-label="Matchup details"]`)

`describe('Matchup Detail – loading state @regression')`:

- Shows the `"Loading matchup details..."` spinner while the matchup query is gated

`describe('Matchup Detail – error state @regression')`:

- Shows the error / not-found state when the matchup query returns a GraphQL error

`describe('Matchup Detail – stale-scores warning @regression')` (LS-4038):

- Shows the `"Live stats unavailable — showing last saved scores."` banner when the
  `GetMatchupPlayers` query errors and the scoreboard falls back to stored scores

### Integration tests (live backend)

**File:** `apps/web-e2e/src/integration/tests/matchup-detail-ui.integration.spec.ts`

End-to-end journey against a real backend (create league → join → draft → open matchup):

- `Phase 5: Scoreboard renders correctly` — asserts the scoreboard renders on the matchup
  detail page after navigating to a real Week 1 matchup

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Page doc:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`
- **Page component:** `apps/web/src/pages/matchup/MatchupDetailPage.tsx`
- **Shared view:** `lib/shared-components/src/features/matchup/MatchupScoreboardView.tsx`
- **Web wrapper:** `apps/web/src/features/matchup/MatchupScoreboard.tsx`
- **Mobile wrapper:** `apps/app/src/features/matchup/components/MatchupScoreboard.tsx`
