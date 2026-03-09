# Season Selection Architecture

> This doc is accurate for the season-selection subsystem. For the full end-to-end league lifecycle, see [`docs/guides/league-flow-complete-guide.md`](../guides/league-flow-complete-guide.md).

## Overview

The Legacy Sports system uses **per-player season selection** rather than a single season per matchup. This allows different players in the same matchup to play games from their different career years.

## Current Design (As of 2026-02-10)

### Season Assignment Location

**Lambda:** `db` (GraphQL Lambda)  
**File:** `lambdas/db/src/schema/matchups.ts`  
**Function:** `advanceLeagueWeek` mutation (lines 486-820)

### Process Flow

1. **Matchup Creation** (lines 600-618)
   - Creates matchups with NULL `selected_season` field
   - Sets basic matchup properties (teams, week, status, games_per_matchup)
   - `selected_season` on matchups table is **NOT used** (legacy field to be removed)

2. **Player Assignment** (lines 621-673)
   - Auto-populates `matchup_players` for each matchup
   - Fetches all players from both teams in each matchup

3. **Season Selection** (lines 675-783)
   - **This is the only place where player seasons are assigned**
   - Queries all available seasons for each player from:
     - `season_batting`
     - `season_pitching`
     - `season_fielding`
   - Filters out Negro League seasons (`isNegroLeague()`)
   - Calls `selectSeasonsForPlayers()` service to assign random seasons
   - Inserts selections into **`league_week_player_seasons`** table

4. **Storage**
   - Player season assignments stored in: `league_week_player_seasons`
   - Schema:
     ```sql
     league_week_player_seasons (
       id SERIAL PRIMARY KEY,
       league_id INTEGER NOT NULL,
       week_number INTEGER NOT NULL,
       player_id INTEGER NOT NULL,
       selected_season INTEGER NOT NULL,
       UNIQUE(league_id, week_number, player_id)
     )
     ```

## Game Selection Process

**Lambda:** `game-selection` Lambda  
**File:** `lambdas/game-selection/src/index.ts`

1. Receives matchup ID
2. Looks up player season assignments from `league_week_player_seasons`
3. Selects random games from each player's assigned season
4. Stores selected games in `matchup_player_games`

## Stats Loading Process

**Lambda:** `stats` Lambda

1. Receives player ID and game identifiers from `matchup_player_games`
2. Loads game stats from Baseball-Reference
3. Stores in `game_batting`, `game_pitching`, `game_fielding` tables
4. Updates `matchup_player_games.stats_loading_status` to 'completed'

## Key Tables

| Table                            | Purpose                   | Set By                       |
| -------------------------------- | ------------------------- | ---------------------------- |
| `matchups`                       | Matchup metadata          | `advanceLeagueWeek` mutation |
| `matchups.selected_season`       | **UNUSED** - legacy field | Never (always NULL)          |
| `league_week_player_seasons`     | Player season assignments | `advanceLeagueWeek` mutation |
| `matchup_players`                | Players in each matchup   | `advanceLeagueWeek` mutation |
| `matchup_player_games`           | Selected games per player | `game-selection` Lambda      |
| `game_batting/pitching/fielding` | Actual game stats         | `stats` Lambda               |

## Important Notes

1. **Single Source of Truth**: Season selection happens **ONLY** in the `advanceLeagueWeek` mutation
2. **Per-Player Seasons**: Each player can have a different season, even in the same matchup
3. **Minimum Games Filter**: Only seasons with at least `2 × gamesPerMatchup` games are considered
4. **Legacy Field**: `matchups.selected_season` should be removed (migration 0050 exists but not yet applied)

## Migration Status

**Migration 0050** (`remove_selected_season`):

- **Status**: Created but NOT yet applied to database
- **Purpose**: Remove unused `selected_season` column from matchups table
- **Reason**: Column was never populated and is architecturally incorrect
- **Related**: LS-27 game selection fixes

## Known Issues

### Issue: Players with Failed Stats Loading Due to Baseball-Reference Timeouts

**Symptom**: Some players show `stats_loading_status = 'failed'` with NULL `game_identifier`

**Root Cause**: The stats Lambda successfully completes game selection and queues stats loading, but **Baseball-Reference requests timeout** when scraping game data. Common HTTP error codes:

- **504 Gateway Timeout**: CloudFlare/proxy timeout (10-30 seconds)
- **524 A Timeout Occurred**: CloudFlare-specific timeout (origin server too slow)

**Investigation from League 41, Week 1, Matchup 90**:

All 4 failing players had:

- ✅ Seasons correctly assigned by `advanceLeagueWeek`
- ✅ Game numbers selected by game-selection Lambda
- ❌ Stats loading failed due to Baseball-Reference timeouts

| Player            | Season | Game Numbers Assigned     | BRef Error        | Timestamp |
| ----------------- | ------ | ------------------------- | ----------------- | --------- |
| **Todd Helton**   | 2002   | batting #32, fielding #69 | HTTP 504          | 06:52:58  |
| **Iván Herrera**  | 2024   | batting #17, fielding #19 | HTTP 524 (likely) | ~06:53:00 |
| **Bill Higdon**   | 1949   | batting #5, fielding #6   | HTTP 524          | 06:55:28  |
| **Teddy Higuera** | 1987   | pitching #15              | HTTP 524 (likely) | ~06:55:30 |

**Why Timeouts Occur**:

1. **Concurrent Scraping**: Stats Lambda processes 8 players in parallel per batch
2. **No Game Data Cached**: First request for a player/season loads ALL games from Baseball-Reference
3. **Rate Limiting**: Baseball-Reference likely throttles or times out heavy scraping
4. **Page Complexity**: Some player seasons have complex HTML that takes longer to parse

**Impact**: Game selection completes successfully, but stats remain unloaded. The `game_identifier` stays NULL because `selectAndAssignGameIdentifiers()` is only called after successful scraping.

## Recommendations

1. **Apply Migration 0050**: Remove unused `selected_season` column to avoid confusion
2. **Implement Retry Logic**: Add exponential backoff retry for Baseball-Reference timeouts
3. **Request Throttling**: Limit concurrent Baseball-Reference requests (currently 8 parallel)
4. **Caching Strategy**: Pre-load common player seasons during off-peak hours
5. **Timeout Handling**: Increase Lambda timeout for stats loading (currently may be too short)
6. **Graceful Degradation**: Allow matchups to proceed with partial stats, retry failed players later
7. **Enhanced Logging**: Add more detailed logging when Baseball-Reference requests fail
8. **UI Feedback**: Show users when players have stats loading in progress vs permanently failed

## Code References

- **Season Selection Service**: `lib/scheduling/src/lib/season-selector.ts`
- **GraphQL Mutation**: `lambdas/db/src/schema/matchups.ts:486-820`
- **Game Selection**: `lambdas/game-selection/src/index.ts`
- **Stats Loading**: `lambdas/stats-lambda/src/index.ts`
