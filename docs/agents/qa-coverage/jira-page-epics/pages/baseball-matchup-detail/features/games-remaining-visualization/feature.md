# Feature: Games Remaining Visualization

**Jira:** LS-5351
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Progress visualization for a baseball matchup's games on the matchup detail page
(`/baseball/league/:leagueId/matchups/:matchupId`). Rendered as a "Games Progress"
card with three parts:

1. **Per-game dots** — one dot per game, colored by state: completed
   (checkmark), in progress (hourglass), and pending (circle).
2. **Progress bar** — fills proportionally to completed games; turns green once
   every game is complete.
3. **Status badge** — shows `{n} left` while games remain and `Complete` when
   none do.

`gamesRemaining` is derived as `gamesPerMatchup - selectedGamesCount` (clamped to
`[0, gamesPerMatchup]`), so the same component covers the in-progress, complete,
and not-yet-started (scheduled) states.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/matchups/detail.md`
(§ "Games Remaining").

## Implementation

**Shared component:** `lib/shared-components/src/features/matchup/GamesRemaining.tsx`

Rendered by `lib/shared-components/src/features/matchup/MatchupDetailLayout.tsx`
(section 5) only when `matchup.gamesPerMatchup > 0`. The web matchup detail page
(`apps/web/src/pages/matchup/MatchupDetailPage.tsx`) supplies the matchup via
`MatchupDetailLayout`, which computes `gamesRemaining` and `totalGames` and passes
them to `GamesRemaining`.

| Prop             | Source                                 |
| ---------------- | -------------------------------------- |
| `totalGames`     | `matchup.gamesPerMatchup`              |
| `gamesRemaining` | `gamesPerMatchup − selectedGamesCount` |

Dot state per index `i` (with `gamesCompleted = totalGames − gamesRemaining`):

| Condition                              | Dot icon                   |
| -------------------------------------- | -------------------------- |
| `i < gamesCompleted`                   | `CheckCircle2` (completed) |
| `i === gamesCompleted && !allComplete` | `Hourglass` (in progress)  |
| otherwise                              | `Circle` (pending)         |

A `compact` variant (used elsewhere, e.g. the league-detail matchup tab) renders a
single colored dot plus a `Complete` / `{n} games left` label.

## Test Coverage

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/games-remaining-visualization.spec.ts`

All GraphQL operations are mocked with `route.fulfill` (no live backend). Each
`describe` varies `gamesPerMatchup` / `selectedGamesCount` to exercise one state:

`describe('Games Remaining – partial progress @regression')` — 4 of 7 games done:

- renders the "Games Progress" card
- shows the "3 left" remaining-games badge (and not "Complete")
- shows "4 completed" and "7 total" counts
- renders one dot per game (7 dot icons)

`describe('Games Remaining – complete @regression')` — all 7 games done:

- shows the "Complete" badge instead of a remaining count
- shows "7 completed" / "7 total"
- still renders one dot per game (7 dot icons)

`describe('Games Remaining – zero progress @regression')` — scheduled, 0 of 7:

- shows the "7 left" badge (and not "Complete")
- shows "0 completed" / "7 total"
- renders one dot per game (7 dot icons)

## Related

- **Epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **Implementation ref:** `docs/agents/pages/baseball/league/detail/matchups/detail.md`
- **Sibling page coverage:** `apps/web-e2e/src/tests/matchup-detail.spec.ts`
  (scoreboard, roster comparison, loading/error/not-found states).
