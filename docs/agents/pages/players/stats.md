# Player Statistics Page — Reference

**Route**: `/players/stats`  
**File**: `apps/web/src/pages/players/PlayerStatsPage.tsx`

---

## Layout

Thin wrapper that delegates to `SharedPlayerStatsPage` from `@legacy-sports/shared-components/players`.  
Clicking a player row opens `PlayerDetailModal` (full stat breakdown).

---

## View Modes

| Mode       | Description                      |
| ---------- | -------------------------------- |
| `combined` | Hitters and pitchers in one view |
| `hitters`  | Batting stats only               |
| `pitchers` | Pitching stats only              |

---

## Hitter Columns

`Player Name · Position · Team · G · PA · AB · H · HR · RBI · SB · R · 2B · 3B · BB · SO · AVG · OBP · SLG · oWAR`

## Pitcher Columns

`Player Name · Position · Team · G · GS · W · L · IP · ERA · SO · BB · WHIP · SHO · SV · K/9`

---

## Filters & Controls

| Control            | Description                                     |
| ------------------ | ----------------------------------------------- |
| Search box         | Player name (min 2 chars, debounced)            |
| Position dropdown  | Filter by position (e.g., SS)                   |
| Team dropdown      | Filter by MLB team                              |
| Player type        | hitter / pitcher / all                          |
| View mode tabs     | Combined / Hitters / Pitchers                   |
| Page size selector | 10 · 25 · 50 · 100 rows                         |
| Stat range sliders | Min/max for HR, RBI, AVG, ERA, Wins, Strikeouts |
| Column visibility  | Expand/collapse columns                         |
| Export button      | Download JSON with current filters              |
| Share button       | Copy URL or Web Share API                       |

---

## URL-Persisted State (Query Params)

| Param                             | Values                        |
| --------------------------------- | ----------------------------- |
| `view`                            | combined / hitters / pitchers |
| `pageSize`                        | 10 / 25 / 50 / 100            |
| `search`                          | free-text                     |
| `searchTerm`                      | search query                  |
| `position`                        | e.g., "SS"                    |
| `team`                            | e.g., "NYY"                   |
| `playerType`                      | hitter / pitcher / all        |
| `minHomeRuns` / `maxHomeRuns`     | HR range                      |
| `minRBI` / `maxRBI`               | RBI range                     |
| `minBattingAvg` / `maxBattingAvg` | AVG range                     |
| `minERA` / `maxERA`               | ERA range                     |
| `minWins` / `maxWins`             | Wins range                    |
| `minStrikeouts` / `maxStrikeouts` | SO range                      |

All numeric values clamped to `MAX_GRAPHQL_INT = 2,147,483,647`.

---

## Player Detail Modal

Opened when player row is clicked. See [player-detail.md](./player-detail.md) for full breakdown.

---

## Stats Format

User preference (`standard` / `expanded`) persisted in localStorage as `ls_user_preferences.statsFormat`. Re-read on page focus (user may change on `/preferences`).

---

## States

| State      | Display                                    |
| ---------- | ------------------------------------------ |
| Loading    | Spinner in table area                      |
| No results | "No players found" (from shared component) |
| Error      | Error banner + retry                       |
| Export     | Accessibility live region: "Link copied"   |
