# League Detail — Matchup Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `matchup`  
**Visibility**: All users

---

## Layout (in order)

1. `MatchupNavigationControls` — week/matchup selector + navigation
2. `MatchupScoreboard` — score display
3. `GamesRemaining` — progress visualization
4. `MatchupRosterComparison` — side-by-side rosters
5. Matchup Schedule Card — timestamps

---

## Matchup Navigation Controls

**Component**: `MatchupNavigationControls`

- Week/matchup selector dropdown
- Previous / Next buttons
- Current league week context

**Queries**: `useMatchupsForLeague()`, `useCurrentWeek()`

---

## Matchup Scoreboard

**Component**: `MatchupScoreboard`

| Field                  | Detail                                     |
| ---------------------- | ------------------------------------------ |
| Team 1 name            | Clickable → `handleViewTeamRoster(teamId)` |
| Team 1 actual score    | Large display                              |
| Team 1 projected score | Secondary                                  |
| Team 2 name            | Clickable                                  |
| Team 2 actual score    |                                            |
| Team 2 projected score |                                            |
| Games remaining        | Count                                      |
| Matchup status         | LIVE · FINAL · SCHEDULED                   |

**Query**: `useGetMatchupPlayersQuery`

---

## Games Remaining

**Component**: `GamesRemaining`

- Progress bar
- Percentage + absolute game count
- "X games left" or "Complete" badge

---

## Roster Comparison

**Component**: `MatchupRosterComparison`

Side-by-side player rosters with per-position matchup scoring.  
Click player → opens `PlayerMatchupStatsModal`

**Query**: `useGetMatchupPlayersQuery`

---

## Matchup Schedule Card

- Start date/time (localized to user timezone)
- End date/time (localized to user timezone)

---

## GraphQL

| Hook                        | Data                             |
| --------------------------- | -------------------------------- |
| `useMatchupById()`          | Specific matchup details         |
| `useMatchupsForLeague()`    | All matchups for week navigation |
| `useGetMatchupPlayersQuery` | Player data + matchup scoring    |

---

## Empty States

| State             | Condition                   | Display                                              |
| ----------------- | --------------------------- | ---------------------------------------------------- |
| Loading           | Fetching matchup            | Full-page spinner + "Loading matchup…"               |
| Error             | Query error                 | Red error card                                       |
| No Active Matchup | No matchup for current week | Card explaining why; commissioner link if applicable |

---

## Commissioner Note

When no matchup exists, commissioners see a "Go to Commissioner tab" button to create matchups.
