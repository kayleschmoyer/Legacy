# CLI Player Stats Commands

## Overview

The CLI includes three commands for querying player batting, pitching, and fielding statistics by player code (bref_id).

## Commands

### Get Player Batting Stats

Retrieve batting statistics for a player across all seasons.

```powershell
pnpm exec nx start cli -- get-player-batting --player <bref_id>
```

**Options:**

- `--player, -p` (required): Player Baseball Reference ID (e.g., "bondsba01")
- `--format, -f` (optional): Output format - "table" (default) or "json"
- `--limit, -l` (optional): Maximum number of seasons to return

**Example:**

```powershell
# View Barry Bonds' batting stats in table format
pnpm exec nx start cli -- get-player-batting --player bondsba01

# View last 5 seasons only
pnpm exec nx start cli -- get-player-batting --player bondsba01 --limit 5

# Output as JSON
pnpm exec nx start cli -- get-player-batting --player bondsba01 --format json
```

**Output includes:**

- Season, team, league
- Games (g), at bats (ab), runs (r), hits (h)
- Doubles, triples, home runs (hr), RBIs
- Stolen bases (sb), walks (bb), strikeouts (so)
- Batting average, on-base percentage, slugging percentage

---

### Get Player Pitching Stats

Retrieve pitching statistics for a player across all seasons.

```powershell
pnpm exec nx start cli -- get-player-pitching --player <bref_id>
```

**Options:**

- `--player, -p` (required): Player Baseball Reference ID (e.g., "ryanno01")
- `--format, -f` (optional): Output format - "table" (default) or "json"
- `--limit, -l` (optional): Maximum number of seasons to return

**Example:**

```powershell
# View Nolan Ryan's pitching stats
pnpm exec nx start cli -- get-player-pitching --player ryanno01

# Output as JSON
pnpm exec nx start cli -- get-player-pitching --player ryanno01 --format json
```

**Output includes:**

- Season, team, league
- Wins (w), losses (l), ERA
- Games (g), games started (gs), saves (sv)
- Innings pitched (ip), hits (h), earned runs (er)
- Home runs (hr), walks (bb), strikeouts (so)
- WHIP, hits per nine, strikeouts per nine

---

### Get Player Fielding Stats

Retrieve fielding statistics for a player across all seasons and positions.

```powershell
pnpm exec nx start cli -- get-player-fielding --player <bref_id>
```

**Options:**

- `--player, -p` (required): Player Baseball Reference ID (e.g., "jeterde01")
- `--format, -f` (optional): Output format - "table" (default) or "json"
- `--position` (optional): Filter by specific position (e.g., "SS", "1B", "OF")
- `--limit, -l` (optional): Maximum number of seasons to return

**Example:**

```powershell
# View Derek Jeter's fielding stats
pnpm exec nx start cli -- get-player-fielding --player jeterde01

# View only shortstop fielding stats
pnpm exec nx start cli -- get-player-fielding --player jeterde01 --position SS

# Output as JSON
pnpm exec nx start cli -- get-player-fielding --player jeterde01 --format json
```

**Output includes:**

- Season, team, league, position
- Games (g), games started (gs), innings defensively (inn_def)
- Putouts (po), assists (a), errors (e_def)
- Double plays (dp_def), fielding percentage
- Range factor per nine innings
- Catcher-specific stats (sb, cs, pickoffs) when applicable

---

## Finding Player Codes

Player codes (bref_id) are Baseball Reference IDs in the format: `lastnamefirstXX` where XX is a number.

Examples:

- Barry Bonds: `bondsba01`
- Derek Jeter: `jeterdo01`
- Babe Ruth: `ruthba01`
- Nolan Ryan: `ryanno01`

You can find player codes by:

1. Visiting Baseball Reference (baseball-reference.com)
2. Finding the player's page
3. Looking at the URL (e.g., `/players/b/bondsba01.shtml`)
4. Using the `list-players` CLI command to search the database

---

## Database Tables

These commands query the following database tables:

- `season_batting` - Individual season batting statistics
- `season_pitching` - Individual season pitching statistics
- `season_fielding` - Individual season fielding statistics (by position)

All stats are joined with the `players` table using the player_id.

---

## Troubleshooting

### "No stats found for this player"

This means the player has no records in the respective stats table. Possible reasons:

- Player has not had stats loaded yet
- Player only has stats in other categories (e.g., pitcher queried for batting)
- Player code (bref_id) is incorrect

### Connection errors

Ensure your database credentials are configured correctly:

```powershell
pnpm run sync-env  # Sync environment variables from AWS
```

### Finding players in the database

Use the `list-players` command to search for players:

```powershell
pnpm exec nx start cli -- list-players
```

---

## Related Commands

- `query-db` - Execute arbitrary SQL queries
- `list-players` - List all players in the database
- `load-single-player-stats` - Load stats for a specific player
- `check-stats-status` - Check the status of stats loading

---

## Technical Implementation

All three commands follow the same pattern:

1. Connect to PostgreSQL database using credentials from AWS Secrets Manager
2. Execute a parameterized SQL query joining the stats table with the players table
3. Format output as either a table or JSON
4. Support optional filtering (position for fielding, limit for all)

Source files:

- [`apps/cli/src/commands/getPlayerBatting.ts`](../../apps/cli/src/commands/getPlayerBatting.ts)
- [`apps/cli/src/commands/getPlayerPitching.ts`](../../apps/cli/src/commands/getPlayerPitching.ts)
- [`apps/cli/src/commands/getPlayerFielding.ts`](../../apps/cli/src/commands/getPlayerFielding.ts)
