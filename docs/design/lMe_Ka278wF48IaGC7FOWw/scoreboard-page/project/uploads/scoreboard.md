# MLB Scoreboard — Reference

**Route**: `/scoreboard`  
**File**: `apps/web/src/components/scoreboard/Scoreboard.tsx`

---

## Layout (in order)

1. Page header — title + date navigation + metadata row + last-updated row
2. Loading state (conditional)
3. Error state (conditional)
4. No-data state (conditional)
5. Empty schedule state (conditional)
6. Game sections: Live Now · Upcoming · Final

---

## Header

| Element             | Detail                                                    |
| ------------------- | --------------------------------------------------------- |
| Title               | "MLB Scoreboard" (Big Shoulders Display, letter-spaced)   |
| Previous day button | "←" (44×44px, accessible)                                 |
| Date input          | `<input type="date">` — max = today                       |
| Next day button     | "→" (disabled when date ≥ today)                          |
| Formatted date      | e.g., "Friday, April 18, 2025"                            |
| Live count          | "{n} Live" (green) — only if live games exist             |
| Final count         | "{n} Final" (gray) — only if final games exist            |
| Upcoming count      | "{n} Upcoming" (blue) — only if upcoming exist            |
| Last updated        | "Updated {HH:MM AM/PM}" — shown if `lastUpdated` exists   |
| Auto-refresh note   | "Auto-refreshing every 15s" — shown when any game is live |

---

## Game Sections

Games are partitioned into three sections:

| Section  | Condition                                 |
| -------- | ----------------------------------------- |
| Live Now | `status === 'Live'`                       |
| Upcoming | `status !== 'Live' && status !== 'Final'` |
| Final    | `status === 'Final'`                      |

---

## Game Card Fields

### Status Badge (top-left)

- **Live**: "▶ {inningHalf} {inning}" (green, Big Shoulders Display)
- **Final**: "Final" (gray)
- **Upcoming**: "Scheduled" (blue)

### Outs Indicator (top-center, Live only)

- "{n} out" or "{n} outs"

### Start Time (top-right, Upcoming only)

- "HH:MM AM/PM"

### Score Section (both teams)

| Field             | Source                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Team abbreviation | `team.abbreviation` (large, Big Shoulders Display, bold)                                       |
| Team name         | `team.teamName` (smaller, Literata, gray, 1 line max)                                          |
| Score             | `team.runs` — tabular nums; green if leading, gray if trailing, white if tied, "–" if upcoming |

### Footer (Live and Final only)

| Element          | Format                                                   |
| ---------------- | -------------------------------------------------------- |
| Hits             | "H: {awayHits}/{homeHits}"                               |
| Errors           | "E: {awayErrors}/{homeErrors}"                           |
| Linescore toggle | "Linescore ▼" / "Hide ▲" (blue) — only if `hasLinescore` |

### Expandable Linescore

Shown when `expanded && hasLinescore`:

- Horizontally scrollable inning-by-inning grid
- Custom thin scrollbar

---

## GraphQL

**Query**: `useGetScoreboardQuery({ date })`  
Fetch policy: `cache-and-network`  
**Auto-polling**: 15-second interval while any game has `status === 'Live'` — stops when no live games.

Returns: `{ date, lastUpdated, games[] }`

Per game: `{ gamePk, status, startTime, inning, inningHalf, outs, homeTeam, awayTeam }`  
Per team: `{ teamName, abbreviation, runs, hits, errors, linescoreInnings[] }`

---

## Actions

| Action              | Behavior                                                     |
| ------------------- | ------------------------------------------------------------ |
| Previous day button | `onChange(offsetDate(date, -1))`                             |
| Date input          | `onChange(selectedDate)` (capped at today)                   |
| Next day button     | `onChange(offsetDate(date, 1))` (disabled when date ≥ today) |
| Game card tap       | Toggle `expanded` state (only if `hasLinescore`)             |

---

## States

| State       | Condition                   | Display                                                     |
| ----------- | --------------------------- | ----------------------------------------------------------- |
| Loading     | `loading && !data`          | Spinner + "Loading scoreboard…"                             |
| Error       | `error`                     | Red card — "Error loading scoreboard" + refresh instruction |
| No API data | `data?.scoreboard === null` | "Scoreboard data is not yet available"                      |
| No games    | `games.length === 0`        | "No games scheduled for {date}"                             |
