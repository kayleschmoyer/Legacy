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

| Control            | Description                                        |
| ------------------ | -------------------------------------------------- |
| Search box         | Player name (min 2 chars, debounced)               |
| Position dropdown  | Filter by position (e.g., SS)                      |
| Team dropdown      | Filter by MLB team                                 |
| Player type        | hitter / pitcher / all                             |
| View mode tabs     | Combined / Hitters / Pitchers                      |
| Page size selector | 10 · 25 · 50 · 100 rows                            |
| Stat range sliders | Min/max for HR, RBI, AVG, ERA, Wins, Strikeouts    |
| Column visibility  | Expand/collapse columns                            |
| Export button      | Download JSON of the visible rows + active filters |
| Share button       | Copy URL or Web Share API                          |

---

## URL-Persisted State (Query Params)

| Param                             | Values                        |
| --------------------------------- | ----------------------------- |
| `v`                               | URL schema version (e.g. `1`) |
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

## URL Schema Versioning & Deprecation Policy

Every URL the page writes carries a `v` flag (`URL_SCHEMA_VERSION`, currently `1`)
identifying the param schema it was minted under. On read, `migrateStatsSearchParams`
upgrades the incoming params to the current schema **before** any filter key is
parsed, so a bookmark created under an older schema resolves to the equivalent
filters instead of being silently misinterpreted (PST-101).

- **Unversioned URLs** (no `v`) are treated as the pre-versioning schema and
  migrated to v1 (which renames nothing — v1 is the original key set).
- **Garbage `v` values** are treated as legacy.
- **Newer `v` than this client understands** is left untouched (forward-compatible).

**Deprecation policy — when changing the param contract:**

1. Bump `URL_SCHEMA_VERSION` in `PlayerStatsPage.tsx`.
2. Append a rename map to `SCHEMA_MIGRATIONS` for the version step — index = the
   _source_ version (e.g. a v1 → v2 rename goes at `SCHEMA_MIGRATIONS[1]`).
   Example: renaming `minHomeRuns` → `minHR` adds `{ minHomeRuns: 'minHR' }`.
3. **Never edit an existing migration entry or repurpose an old key in place** —
   old bookmarks depend on it staying stable.

Splits (e.g. `maxERA` → season vs career) are handled by extending the migration
step beyond a plain rename; keep the transform in `SCHEMA_MIGRATIONS` so the
upgrade path stays declarative and testable.

---

## Player Detail Modal

Opened when player row is clicked. See [player-detail.md](./player-detail.md) for full breakdown.

---

## Stats Format

User preference (`standard` / `expanded`). Persisted server-side per user via the `getUserPreferences` / `updateUserPreferences` GraphQL operations (`user_preferences` table) and hydrated into the Apollo cache on load, so it syncs across devices (LS-7138). localStorage (`ls_user_preferences.statsFormat`) is kept only as a synchronous cold-load fallback. Also re-read on page focus (user may change on `/preferences`).

---

## States

| State      | Display                                    |
| ---------- | ------------------------------------------ |
| Loading    | Spinner in table area                      |
| No results | "No players found" (from shared component) |
| Error      | Error banner + retry                       |
| Export     | Accessibility live region: "Link copied"   |
