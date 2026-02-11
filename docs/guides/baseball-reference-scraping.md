# Baseball-Reference Scraping Guide

## Overview

The Legacy Sports application scrapes game statistics from [Baseball-Reference.com](https://www.baseball-reference.com) using the `bref-client` library. This guide documents the current HTML structure, common issues, and troubleshooting steps.

## Current HTML Structure (Feb 2026)

### Game Log Pages

**URL Pattern**: `https://www.baseball-reference.com/players/gl.fcgi?id={bref_id}&t={type}&year={season}`

Where:

- `{bref_id}`: Player's Baseball-Reference ID (e.g., `hannija01`)
- `{type}`: Stat type (`b` = batting, `p` = pitching, `f` = fielding)
- `{season}`: Year (e.g., `1907`)

### Game Row Structure

Each game row in the stats table contains cells with `data-stat` attributes:

```html
<tr id="batting_gamelogs.1907-04-20">
  <td data-stat="ranker">1</td>
  <td data-stat="date" csk="1907.04.20">
    <a href="/boxes/BSN/BSN190704200.shtml">Apr 20</a>
  </td>
  <!-- more stats cells -->
</tr>
```

### Critical Attributes

**Game Identifier Cell** (used to extract unique game ID):

- **Current attribute**: `data-stat="date"` ✅
- **OLD attribute** (pre-2026): `data-stat="date_game"` ❌ No longer used
- **Contains**: Link to boxscore with game identifier in href

**Game Identifier Extraction**:

```typescript
// From href: /boxes/BSN/BSN190704200.shtml
// Extract: BSN190704200
const GAME_IDENTIFIER_REGEX =
  /^\/boxes\/\w{3}\/(?<gameIdentifier>\w{12}).shtml$/;
```

## Bref-Client Parser Location

**File**: `lib/bref-client/src/lib/CareerStats.ts`

**Functions that extract game identifiers** (6 total):

1. `getAllGameBattingStats` (line ~688)
2. `getGamePitchingStats` (line ~754)
3. `getAllGameFieldingStats` (line ~606)
4. `getGameFieldingStats` (line ~482)
5. `getAllGamePitchingStats` (line ~865)
6. Second `getGameFieldingStats` (line ~1035)

**Current code pattern** (as of Feb 2026):

```typescript
const identifierCell = cells.find(
  (cell) => cell.getAttribute('data-stat') === 'date',
);
```

**WRONG pattern** (causes empty game_identifier):

```typescript
// ❌ Don't use - Baseball-Reference no longer uses this attribute
const identifierCell = cells.find(
  (cell) => cell.getAttribute('data-stat') === 'date_game',
);
```

## Known HTML Changes

### February 2026: date_game → date

**Change**: Baseball-Reference changed the attribute name for the game date/identifier cell.

**Impact**: All game records had empty `game_identifier` values, causing game selection to fail.

**Fix**: Updated all 6 parser functions to look for `data-stat="date"` instead of `data-stat="date_game"`.

**Lesson**: Don't add backwards compatibility fallbacks unless you have confirmed both formats are actively used. Fallbacks can cause confusion and make future debugging harder.

## Troubleshooting Workflow

### Issue: Game identifiers are empty

**Symptoms**:

- Database query shows `game_identifier IS NULL` or empty string
- Game selection fails (no games display for matchup players)
- Stats load successfully but `game_identifier` column is empty

**Diagnosis steps**:

1. **Check if issue is systemic**:

   ```powershell
   .\scripts\db-query.ps1 -Query "SELECT COUNT(*) as total,
     COUNT(game_identifier) as with_id,
     COUNT(*) - COUNT(game_identifier) as missing
     FROM public.game_batting"
   ```

2. **Download fresh HTML sample**:

   ```powershell
   # Replace with player ID, stat type, and season you're testing
   Invoke-WebRequest "https://www.baseball-reference.com/players/gl.fcgi?id=hannija01&t=b&year=1907" `
     -OutFile "tmp/test-bref.html"
   ```

3. **Verify current HTML structure**:

   ```python
   # Create scripts/check-bref-format.py
   from html.parser import HTMLParser

   class BRefParser(HTMLParser):
       def __init__(self):
           super().__init__()
           self.date_count = 0
           self.date_game_count = 0

       def handle_starttag(self, tag, attrs):
           attrs_dict = dict(attrs)
           if attrs_dict.get('data-stat') == 'date':
               self.date_count += 1
           if attrs_dict.get('data-stat') == 'date_game':
               self.date_game_count += 1

   parser = BRefParser()
   with open('tmp/test-bref.html', 'r', encoding='utf-8') as f:
       parser.feed(f.read())

   print(f"data-stat='date': {parser.date_count}")
   print(f"data-stat='date_game': {parser.date_game_count}")
   ```

4. **Update parser if HTML changed**:
   - Open `lib/bref-client/src/lib/CareerStats.ts`
   - Search for `getAttribute('data-stat')`
   - Update attribute name in all 6 functions
   - Test with CLI: `pnpm run cli load-game-stats --player-id 8698 --season 1907`

5. **Verify fix**:

   ```powershell
   # Clear old data
   .\scripts\db-query.ps1 -Query "DELETE FROM public.game_batting WHERE player_id = 8698 AND season = 1907"

   # Reload with fixed parser
   pnpm run cli load-game-stats --player-id 8698 --season 1907

   # Check game_identifier is populated
   .\scripts\db-query.ps1 -Query "SELECT COUNT(*), MIN(game_identifier), MAX(game_identifier)
     FROM public.game_batting WHERE player_id = 8698 AND season = 1907"
   ```

## Parser Behavior

### Columns Processed

The parser extracts the following column types:

- **Raw game statistics**: `b_at_bats`, `b_hits`, `b_runs`, etc.
- **Game metadata**: Game identifier (from boxscore href)
- **Required for game selection**: `game_identifier` must be non-empty

### Columns Intentionally Skipped (15 types)

These columns are skipped because they're metadata, cumulative, or derivable:

**Metadata/Context** (8):

- `ranker` - Row number
- `player_game_num_career` - Career game count
- `team_game_num_season` - Team's seasonal game count
- `date` - Already extracted as game_identifier
- `game_location` - Home/Away (derivable from other data)
- `opp_name_abbr` - Opponent abbreviation
- `game_result` - W/L (derivable from score)
- `b_player_game_span` - Doubleheader indicator

**Cumulative Statistics** (4):

- `b_batting_avg_cume` - Season batting average to date
- `b_onbase_perc_cume` - Season OBP to date
- `b_slugging_perc_cume` - Season SLG to date
- `b_onbase_plus_slugging_cume` - Season OPS to date

**Advanced/Derived** (2):

- `b_roe` - Reached on error
- `b_batting_avg_bip` - Balls in play average

**Positional Information** (2):

- `b_lineup_position` - Batting order position
- `pos_game` - Defensive positions played

## Testing Strategy

### Manual Testing

1. **Test with known players**:
   - Jack Hannifin (`hannija01`, player_id: 8698, season: 1907) - 56 batting games
   - Charlie Graham (`grahach01`, player_id: 8056, season: 1906) - 31 batting games

2. **Verify game identifiers**:

   ```powershell
   .\scripts\db-query.ps1 -Query "SELECT game_identifier
     FROM public.game_batting
     WHERE player_id = 8698 AND season = 1907
     LIMIT 5"
   # Should see: BSN190704200, NY1190705040, NY1190705230, etc.
   ```

3. **Test game selection**:

   ```powershell
   # After stats loaded, trigger game selection
   pnpm run cli trigger-game-selection --matchup-id 71

   # Verify games populated
   .\scripts\db-query.ps1 -Query "SELECT game_number, game_date
     FROM public.matchup_player_games
     WHERE matchup_player_id = 123
     ORDER BY game_number"
   ```

### Automated Testing

The bref-client library includes Jest tests:

```powershell
pnpm exec nx test bref-client
```

## Debugging with Database Timestamps

When investigating why game selection isn't working:

1. **Find when stats were loaded**:

   ```powershell
   .\scripts\db-query.ps1 -Query "SELECT id, last_updated
     FROM app_internal.game_stats
     WHERE game_id = 123
     ORDER BY last_updated DESC LIMIT 1"
   # Result: 2026-02-08 14:35:42
   ```

2. **Convert to epoch time** (use https://www.epochconverter.com/):
   - `2026-02-08 14:35:42` → `1707405342`
   - Add ±5 minutes buffer: `1707405000` to `1707405600`

3. **View CloudWatch logs from exact time**:

   ```powershell
   # Epoch times must be in milliseconds
   $startTime = 1707405000000  # Add 000 for milliseconds
   $endTime = 1707405600000

   aws logs filter-log-events `
     --log-group-name "/aws/lambda/legacy-sports-dev-stats" `
     --start-time $startTime `
     --end-time $endTime `
     --no-cli-pager
   ```

See: [Debugging with Database Timestamps](debugging-with-database-timestamps.md)

## Future Maintenance

### When Baseball-Reference Changes HTML

**Indicators**:

- Sudden spike in empty `game_identifier` values
- CLI command succeeds but database shows NULL identifiers
- Game selection fails for all new matchups

**Response protocol**:

1. Download fresh HTML sample from Baseball-Reference
2. Create Python script to parse and identify attribute changes
3. Update all 6 functions in `CareerStats.ts`
4. Test with multiple players across different eras
5. Document change in this file
6. Update `docs/agents/common-pitfalls.csv`

### Monitoring

**Database health check**:

```sql
-- Run daily to detect scraping issues early
SELECT
  COUNT(*) as total_games,
  COUNT(game_identifier) as with_identifier,
  COUNT(*) - COUNT(game_identifier) as missing_identifier,
  MAX(created_at) as last_loaded
FROM public.game_batting
WHERE created_at > NOW() - INTERVAL '7 days';
```

**Expected results**:

- `missing_identifier` should be 0 or very low
- `last_loaded` should be recent if actively loading stats

## Related Documentation

- [Database Query Guide](../agents/database-query-guide.md) - SQL patterns for investigating data issues
- [Debugging with Database Timestamps](debugging-with-database-timestamps.md) - Correlating logs with DB events
- [Common Pitfalls CSV](../agents/common-pitfalls.csv) - Scraing mistakes to avoid
- [Troubleshooting Guide](troubleshooting.md) - General troubleshooting workflows

## Quick Reference

```powershell
# Download HTML sample
Invoke-WebRequest "https://www.baseball-reference.com/players/gl.fcgi?id={bref_id}&t=b&year={year}" -OutFile test.html

# Check database for empty identifiers
.\scripts\db-query.ps1 -Query "SELECT COUNT(*) FROM public.game_batting WHERE game_identifier IS NULL OR game_identifier = ''"

# Load stats with CLI
pnpm run cli load-game-stats --player-id {id} --season {year}

# Parser location
# lib/bref-client/src/lib/CareerStats.ts
# Search for: getAttribute('data-stat') === 'date'

# Test parser changes
pnpm exec nx test bref-client
```
