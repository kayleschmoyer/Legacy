# Feature: Win Probability Panel (Premium)

**Jira:** LS-5358
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** premium

## Description

Premium-gated panel on the matchup detail page showing win probability %
(split bar), projected final scores for both teams, and a batting / pitching
/ fielding category breakdown, driven by a Monte Carlo simulation over each
team's projected total. Only shown for non-completed matchups with a
projectable score (hidden once a matchup is `completed`).

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`

## Implementation

**Web component:** `apps/web/src/features/matchup/MatchupWinProbabilityPanel.tsx`
**Mobile/Android component:** `apps/app/src/features/matchup/components/MatchupWinProbabilityPanel.tsx`

Both platforms implement the panel independently (not yet a shared
component). Each reads the same underlying data:

- `useGetMatchupPlayersQuery` / `useGetLeagueTeamsQuery` for roster + team
  names (already cached by the sibling `MatchupScoreboard`/`MatchupDetailScreen`
  — no extra network round-trip).
- Per-player actual scores (`computeScoring`) for games already played, plus
  a per-game projection (`calculateMatchupProjection`) for remaining games,
  summed into team batting/pitching/fielding totals.
- `calculateMatchupWinProbability` (`@legacy-sports/analytics`) runs a
  5,000-iteration Monte Carlo simulation (`varianceFactor: 0.15`) over the two
  teams' projected totals to produce win probabilities and projected final
  scores. This is genuinely random (`Math.random()`-backed), so consumers
  (tests included) must not assert exact win-probability percentages — only
  that the simulation ran and rendered.

**Gate:** the web panel is wrapped in `PremiumGate` on
`MatchupDetailPage` (`featureName="Matchup Projections"`), gated on
`useHasEntitlement(ENTITLEMENTS.matchup_projections)`. The mobile panel is
gated the same way via its own `PremiumGate`.

**Visibility:** the panel renders nothing when `matchup` is null/undefined,
the matchup status is `completed`, or there are no projection-eligible
players (both teams' projected totals are 0).

## Test Coverage

### Unit tests

File: `apps/app/src/features/matchup/components/MatchupWinProbabilityPanel.spec.tsx` (mobile/Android)

`describe('MatchupWinProbabilityPanel')`:

- Renders win probability, projected scores, and team names when projections are available
- Renders nothing for completed matchups
- Renders nothing when there are no projection-eligible players
- Renders nothing for a null matchup
- Logs and falls back to actual scores when projection calculation throws
- Gated behind `PremiumGate`: shows the upgrade overlay for free users / renders without it for premium users

File: `apps/web/src/features/matchup/MatchupWinProbabilityPanel.spec.tsx` (web)

`describe('MatchupWinProbabilityPanel')`:

- Renders win probability, projected scores, and team names when projections are available
- Renders the category breakdown and simulation footnote
- Renders nothing for completed matchups
- Renders nothing when there are no projection-eligible players
- Renders nothing for a null matchup
- Falls back to actual scores (no throw) when projection calculation throws

Premium-gate composition for the web panel is intentionally left to the E2E
suite below rather than duplicated here — see `matchup-week-navigation.spec.ts`.

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/matchup-week-navigation.spec.ts` (originally
filed under LS-1626; extended under LS-5358 with panel-detail coverage)

`describe('Matchup Week Navigation – win probability (premium) @regression')`:

- Win probability panel is visible for premium users
- Premium user does not see the upgrade prompt overlay
- Shows projected final scores for both teams
- Shows the batting/pitching/fielding category breakdown
- Shows the simulation-count footnote

`describe('Matchup Week Navigation – win probability (free user) @regression')`:

- Free user sees the premium gate overlay instead of win probability
- Free user sees the feature description in the gate overlay

`describe('Matchup Week Navigation – win probability hidden for completed matchups @regression')`:

- Does not render the win probability panel for a completed matchup

## Related

- **Epic:** LS-5260 — QA coverage for `baseball-matchup-detail`
- **Implementation ref:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`
