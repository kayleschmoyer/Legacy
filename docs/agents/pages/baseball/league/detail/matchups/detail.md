# Matchup Detail Page — Reference

**Route**: `/baseball/league/:leagueId/matchups/:matchupId`  
**File**: `apps/web/src/pages/matchup/MatchupDetailPage.tsx`

---

## Layout (in order)

1. Page Meta (dynamic title + description)
2. Header — "Matchup Details" + "Back to League" button
3. `MatchupNavigationControls` — week selector + team navigation
4. `MatchupScoreboard` — broadcast-style score display
5. `MatchupWinProbabilityPanel` _(premium-gated, live matchups only)_
6. `GamesRemaining` — game progress visualization
7. Matchup Information section — start/end timestamps
8. `MatchupRosterEditor` _(conditional — user's team + non-completed matchup)_
9. `MatchupRecapPanel` _(premium-gated, completed matchups only)_
10. `MatchupRosterComparison` — side-by-side roster + player stats

---

## Matchup Scoreboard

| Field                        | Detail                               |
| ---------------------------- | ------------------------------------ |
| Week badge                   | "Week {n}"                           |
| Games ratio                  | "3/5 games" (completed/total)        |
| Matchup status chip          | LIVE · FINAL · SCHEDULED (with icon) |
| Games remaining              | Count (orange text)                  |
| Team 1 name                  | Clickable                            |
| Team 1 score                 | Large; gold if leading               |
| Team 1 projected final       | When games remain                    |
| "Tied" / "Leading" indicator |                                      |
| Team 2 name                  | Clickable                            |
| Team 2 score                 |                                      |
| Team 2 projected final       |                                      |
| Progress bar                 | % and absolute game count            |

---

## Win Probability Panel _(premium)_

| Field                  | Detail                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| Win probability %      | Large format, both teams                                          |
| Split probability bar  | Visual                                                            |
| Projected final scores | Side-by-side                                                      |
| Category breakdown     | Batting / Pitching / Fielding — each team's sub-score + split bar |
| Simulation footnote    | "Based on 10,000 simulations"                                     |

**Render condition**: `isPremium && !isCompleted && gamesRemaining > 0`

---

## Games Remaining

- One dot per game, colored by state: checkmark (completed) · hourglass (in progress) · circle (pending)
- Progress bar
- "Complete" or "X games left" status badge

---

## Roster Comparison

Two roster cards side-by-side. Per position slot (C, 1B, 2B, 3B, SS, LF, CF, RF, U, DH, P, SP, RP, Bench):

| Field              | Detail                         |
| ------------------ | ------------------------------ |
| Player name        |                                |
| Eligible positions | Secondary label                |
| Actual score       | Highlighted if best in matchup |
| Projected score    | Secondary                      |

Totals row: batting total · pitching total · fielding total per team  
Bench section: collapsible toggle  
Click player → opens `PlayerMatchupStatsModal`

---

## Roster Editor _(user's team + non-completed matchup)_

- Position selector dropdowns
- Swap button between two lineup slots
- Lock state for in-progress players

**Render condition**: `userTeamId exists && matchupStatus === Scheduled OR InProgress && user is team1 or team2`

---

## Matchup Recap _(premium, completed matchups only)_

- AI narrative recap of completed matchup
- **Render condition**: `matchupStatus === Completed && isPremium`

---

## Navigation Controls

- Week/matchup selector dropdown
- Previous / Next week buttons

---

## Premium Gates

| Feature               | Gate Name             |
| --------------------- | --------------------- |
| Win Probability panel | "Matchup Projections" |
| AI Matchup Recap      | "AI Matchup Recap"    |

---

## GraphQL

| Hook                             | Data                                    |
| -------------------------------- | --------------------------------------- |
| `useGetUserTeamIdQuery`          | Current user's team in league           |
| `useMatchupById`                 | Matchup details and status              |
| `useMatchupsForLeague`           | All league matchups for week navigation |
| `useCurrentWeek`                 | Current week number                     |
| `useGetMatchupPlayersQuery`      | Players + scoring in matchup            |
| `useGetLeagueTeamsQuery`         | Team names                              |
| `useGetPositionsForLeagueQuery`  | Available positions                     |
| `useUpdateMatchupPlayerPosition` | Mutation: change player position        |
| `useSwapMatchupPlayerPositions`  | Mutation: swap two players              |

---

## States

| State             | Display                                         |
| ----------------- | ----------------------------------------------- |
| Loading           | Spinner + "Loading matchup details…"            |
| Error             | Error message + "Back to League" button         |
| Not found         | "Matchup not found" + fallback button           |
| Completed matchup | Hides Win Probability, shows Recap (if premium) |
| Scheduled matchup | Hides games progress; shows projected info      |
