# Database Query Guide for AI Agents

**Purpose**: Prevent common database query errors by clearly documenting schemas, tables, and columns.

## 🚨 Critical: Two Database Schemas

Legacy Sports uses **TWO separate PostgreSQL schemas**:

1. **`public` schema** - Fantasy league data, matchups, statistics
2. **`app_internal` schema** - Authentication and internal tables

**❌ COMMON MISTAKE**: Querying wrong schema or omitting schema prefix

```sql
-- ❌ WRONG - Missing schema, defaults to public but users is in app_internal
SELECT * FROM users WHERE id = 123;

-- ✅ CORRECT - Always use schema prefix
SELECT * FROM app_internal.users WHERE id = 123;

-- ✅ CORRECT - Public schema (can omit prefix for public, but explicit is better)
SELECT * FROM public.leagues WHERE id = 16;
```

---

## Schema Quick Reference

### 🔐 app_internal Schema (Authentication & Internal)

| Table        | Purpose                | Common Columns                                        |
| ------------ | ---------------------- | ----------------------------------------------------- |
| `users`      | User accounts          | `id`, `email`, `username`, `created_at`, `updated_at` |
| `game_stats` | Cached game statistics | `id`, `game_id`, `last_updated`                       |
| `events`     | System events          | `id`, `occurred_at`, `event_type`                     |

**Key Point**: Authentication and system tables use `app_internal.` prefix

### 🏈 public Schema (Fantasy League Data)

| Category              | Tables                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Players & Stats**   | `players`, `season_batting`, `season_pitching`, `season_fielding`, `game_batting`, `game_pitching`, `game_fielding`  |
| **Career Views**      | `career_batting`, `career_pitching`, `career_fielding`, `career_fielding_by_position`, `player_eligible_positions`   |
| **League Management** | `leagues`, `teams`, `league_members`, `team_members`, `league_positions`, `roster_lock_rules`                        |
| **Matchups**          | `matchups`, `matchup_players`, `matchup_player_games`, `league_week_player_seasons`                                  |
| **Drafts**            | `drafts`, `draft_teams`                                                                                              |
| **Scoring**           | `scoring_stat_definitions`, `league_scoring_profiles`, `league_scoring_profile_entries`, `league_scoring_change_log` |
| **Playoffs**          | `playoff_brackets`, `playoff_matchups`, `playoff_seeds`, `champion_trophies`                                         |
| **Messages**          | `league_messages`                                                                                                    |
| **Notifications**     | `notification_preferences`, `device_tokens`, `notification_history`                                                  |

---

## Common Query Patterns

### ✅ User Queries (app_internal schema)

```sql
-- Get user by ID
SELECT id, email, username, created_at
FROM app_internal.users
WHERE id = 123;

-- Get user by email
SELECT id, email, username
FROM app_internal.users
WHERE email = 'user@example.com';

-- Check if user exists
SELECT EXISTS(
  SELECT 1 FROM app_internal.users WHERE id = 123
) AS user_exists;
```

### ✅ League Queries (public schema)

```sql
-- Get league details
SELECT id, name, draft_status, current_matchup, created_at
FROM public.leagues
WHERE id = 16;

-- Get league with owner info (JOIN across schemas)
SELECT l.id, l.name, l.draft_status, u.username AS owner_name
FROM public.leagues l
JOIN app_internal.users u ON l.owner = u.id
WHERE l.id = 16;

-- Get all teams in a league
SELECT t.id, t.name, u.username AS owner_name
FROM public.teams t
JOIN public.league_members lm ON t.id = lm.team_id
JOIN app_internal.users u ON lm.user_id = u.id
WHERE t.league_id = 16;
```

### ✅ Matchup Queries (public schema)

```sql
-- Get matchup details
SELECT
  m.id,
  m.week_number,
  m.status,
  m.stats_loading_status,
  m.team1_score,
  m.team2_score,
  m.start_time,
  m.end_time
FROM public.matchups m
WHERE m.id = 69;

-- Get matchup with team names
SELECT
  m.id,
  m.week_number,
  t1.name AS team1_name,
  t2.name AS team2_name,
  m.team1_score,
  m.team2_score
FROM public.matchups m
JOIN public.teams t1 ON m.team1_id = t1.id
JOIN public.teams t2 ON m.team2_id = t2.id
WHERE m.league_id = 16 AND m.week_number = 1;

-- Get all matchups for a league
SELECT id, week_number, status, team1_score, team2_score
FROM public.matchups
WHERE league_id = 16
ORDER BY week_number;
```

### ✅ Player Statistics Queries (public schema)

```sql
-- Get player career batting stats (using VIEW)
SELECT
  p.first_name,
  p.last_name,
  cb.h AS career_hits,
  cb.hr AS career_home_runs,
  cb.rbi AS career_rbi
FROM public.players p
JOIN public.career_batting cb ON p.id = cb.player_id
WHERE p.id = 456;

-- Get player season batting stats (using TABLE)
SELECT
  p.first_name,
  p.last_name,
  sb.season,
  sb.team,
  sb.h AS hits,
  sb.hr AS home_runs,
  sb.rbi
FROM public.players p
JOIN public.season_batting sb ON p.id = sb.player_id
WHERE p.id = 456
ORDER BY sb.season DESC;

-- Get player eligible positions (using VIEW)
SELECT pos
FROM public.player_eligible_positions
WHERE player_id = 456;
```

### ✅ Team Roster Queries (public schema)

```sql
-- Get all players on a team
SELECT
  p.id,
  p.first_name,
  p.last_name,
  lp.position_type,
  tm.position_id
FROM public.team_members tm
JOIN public.players p ON tm.player_id = p.id
JOIN public.league_positions lp ON tm.position_id = lp.id
WHERE tm.team_id = 5 AND tm.league_id = 16;

-- Count players by position on a team
SELECT lp.position_type, COUNT(*) AS count
FROM public.team_members tm
JOIN public.league_positions lp ON tm.position_id = lp.id
WHERE tm.team_id = 5
GROUP BY lp.position_type;
```

---

## ❌ Common Mistakes to Avoid

### 1. Missing Schema Prefix

```sql
-- ❌ WRONG - Will fail if users table doesn't exist in public schema
SELECT * FROM users WHERE id = 123;

-- ✅ CORRECT - Explicit schema
SELECT * FROM app_internal.users WHERE id = 123;
```

### 2. Using Wrong Schema

```sql
-- ❌ WRONG - leagues is in public, not app_internal
SELECT * FROM app_internal.leagues WHERE id = 16;

-- ✅ CORRECT
SELECT * FROM public.leagues WHERE id = 16;
```

### 3. Querying Non-Existent Columns

```sql
-- ❌ WRONG - matchups doesn't have selected_season column anymore
SELECT id, week_number, selected_season FROM public.matchups WHERE id = 69;

-- ✅ CORRECT - Use league_week_player_seasons table instead
SELECT
  lwps.player_id,
  lwps.season AS selected_season
FROM public.league_week_player_seasons lwps
WHERE lwps.league_id = 16 AND lwps.week_number = 1;
```

### 4. Confusing Tables vs Views

```sql
-- ❌ POTENTIALLY WRONG - career_batting is a VIEW (read-only)
UPDATE career_batting SET hr = 500 WHERE player_id = 456;

-- ✅ CORRECT - Update source table instead
UPDATE public.season_batting
SET hr = 50
WHERE player_id = 456 AND season = 2025;
-- (Note: career_batting view will automatically recalculate)
```

### 5. Using Wrong Column Names

```sql
-- ❌ WRONG - Column is named 'draft_status' not 'status'
SELECT id, name, status FROM public.leagues WHERE id = 16;

-- ✅ CORRECT
SELECT id, name, draft_status FROM public.leagues WHERE id = 16;

-- ❌ WRONG - Column is 'stats_loading_status' not 'loading_status'
SELECT id, loading_status FROM public.matchups WHERE id = 69;

-- ✅ CORRECT
SELECT id, stats_loading_status FROM public.matchups WHERE id = 69;
```

### 6. Forgetting Timestamps

```sql
-- ❌ INCOMPLETE - Missing timestamp columns that could help debugging
SELECT id, name FROM public.leagues WHERE id = 16;

-- ✅ BETTER - Include timestamps for debugging
SELECT id, name, created_at, updated_at, draft_status
FROM public.leagues
WHERE id = 16;
```

---

## Table-Specific Column Lists

### public.leagues

**Common Columns**:

- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR)
- `owner` (INTEGER - references app_internal.users.id)
- `draft_status` (ENUM: 'not-started', 'in-progress', 'completed')
- `current_matchup` (INTEGER)
- `max_roster_size` (INTEGER, default: 25)
- `min_games_per_season` (INTEGER, default: 10)
- `games_per_matchup` (INTEGER, default: 5)
- `trade_deadline_week` (INTEGER)
- `roster_lock_timing` (ENUM)
- `scheduling_strategy` (ENUM)
- `week_advance_status` (ENUM: 'idle', 'queued', 'processing', 'success', 'failed')
- `invite_code` (VARCHAR(8) UNIQUE)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### public.matchups

**Common Columns**:

- `id` (SERIAL PRIMARY KEY)
- `league_id` (INTEGER - references public.leagues.id)
- `week_number` (INTEGER)
- `team1_id` (INTEGER - references public.teams.id)
- `team2_id` (INTEGER - references public.teams.id)
- `team1_score` (NUMERIC(10, 2))
- `team2_score` (NUMERIC(10, 2))
- `status` (ENUM: 'scheduled', 'in_progress', 'completed', 'cancelled')
- `stats_loading_status` (ENUM: 'not_started', 'queued', 'loading', 'completed', 'failed')
- `games_per_matchup` (INTEGER)
- `start_time` (TIMESTAMP)
- `end_time` (TIMESTAMP)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**❌ REMOVED COLUMNS** (no longer exist):

- ~~`selected_season`~~ - Use `league_week_player_seasons` table instead

### public.players

**Common Columns**:

- `id` (SERIAL PRIMARY KEY)
- `first_name` (TEXT)
- `last_name` (TEXT)
- `bref_id` (VARCHAR(10) UNIQUE)
- `stats_last_fetched_at` (TIMESTAMP)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### app_internal.users

**Common Columns**:

- `id` (SERIAL PRIMARY KEY)
- `username` (VARCHAR(50) UNIQUE)
- `email` (VARCHAR(100) UNIQUE)
- `password_hash` (CHAR(128))
- `access_level` (ENUM: 'none', 'admin')
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

### public.team_members

**Common Columns**:

- `id` (SERIAL PRIMARY KEY)
- `team_id` (INTEGER - references public.teams.id)
- `league_id` (INTEGER - references public.leagues.id)
- `player_id` (INTEGER - references public.players.id)
- `position_id` (INTEGER - references public.league_positions.id)

### public.league_week_player_seasons

**Purpose**: Tracks which season is selected for each player in each week of a league

**Common Columns**:

- `id` (SERIAL PRIMARY KEY)
- `league_id` (INTEGER - references public.leagues.id)
- `week_number` (INTEGER)
- `player_id` (INTEGER - references public.players.id)
- `season` (INTEGER - year like 2025, 2024)
- `created_at` (TIMESTAMP)

**Unique Constraint**: `(league_id, week_number, player_id)`

---

## Debugging Timestamps

When debugging Lambda issues or data staleness, **ALWAYS check timestamps**:

```sql
-- Check when a record was last updated
SELECT id, name, updated_at, created_at
FROM public.leagues
WHERE id = 16;

-- Check when stats were last fetched for a player
SELECT id, first_name, last_name, stats_last_fetched_at
FROM public.players
WHERE id = 456;

-- Check when matchup was last modified
SELECT id, week_number, status, stats_loading_status, updated_at
FROM public.matchups
WHERE id = 69;

-- Find recently updated records
SELECT id, name, updated_at
FROM public.leagues
WHERE updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;
```

**See Also**: [Debugging with Database Timestamps](../guides/debugging-with-database-timestamps.md)

---

## Views vs Tables

### 🔍 Views (Read-Only - Automatically Computed)

These are **computed from underlying tables** and **cannot be directly updated**:

- `public.career_batting` - Sum of season_batting (AL/NL only)
- `public.career_pitching` - Sum of season_pitching (AL/NL only)
- `public.career_fielding` - Sum of season_fielding (AL/NL only)
- `public.career_fielding_by_position` - Grouped by position
- `public.player_eligible_positions` - Computed eligibility rules

**To update a view**: Update the underlying source table (e.g., `season_batting`)

### 📊 Tables (Read-Write)

All other tables are actual database tables that can be queried and modified.

---

## Enum Values Reference

### draft_status

- `'not-started'`
- `'in-progress'`
- `'completed'`

### matchup_status

- `'scheduled'`
- `'in_progress'`
- `'completed'`
- `'cancelled'`

### stats_loading_status

- `'not_started'`
- `'queued'`
- `'loading'`
- `'completed'`
- `'failed'`

### week_advance_status

- `'idle'`
- `'queued'`
- `'processing'`
- `'success'`
- `'failed'`

### position_slot

- `'SP'` - Starting Pitcher
- `'RP'` - Relief Pitcher
- `'C'` - Catcher
- `'1B'`, `'2B'`, `'3B'`, `'SS'` - Infield positions
- `'RF'`, `'LF'`, `'CF'` - Outfield positions
- `'DH'` - Designated Hitter
- `'XDH'` - Extra DH slot
- `'OF'` - Any outfield position
- `'IF'` - Any infield position

---

## Using PowerShell db-query Script

```powershell
# Basic query
.\scripts\db-query.ps1 -Query "SELECT * FROM public.leagues WHERE id = 16"

# Query with JSON output
.\scripts\db-query.ps1 -Query "SELECT * FROM public.teams WHERE league_id = 16" -Format json

# Cross-schema query
.\scripts\db-query.ps1 -Query "SELECT l.name, u.username FROM public.leagues l JOIN app_internal.users u ON l.owner = u.id WHERE l.id = 16"

# Check if table exists
.\scripts\db-query.ps1 -Query "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matchups'"
```

---

## Summary Checklist

Before writing a database query, verify:

- [ ] **Schema prefix**: Using `app_internal.` for users, `public.` for league data?
- [ ] **Table exists**: Is this a real table or a view?
- [ ] **Column names**: Are column names spelled correctly? (e.g., `draft_status` not `status`)
- [ ] **Timestamps**: Including `created_at`/`updated_at` for debugging?
- [ ] **Enum values**: Using correct enum string values?
- [ ] **Removed columns**: Checking this guide for columns that no longer exist?
- [ ] **Join syntax**: Using correct foreign key relationships?

---

## Quick Reference Cheat Sheet

### Schema Prefixes

```sql
-- Users and authentication
app_internal.users

-- Everything else (league data)
public.leagues
public.teams
public.matchups
public.players
public.season_batting
public.season_pitching
public.career_batting  -- VIEW
```

### Most Common Tables by Use Case

**User Operations**: `app_internal.users`
**League Setup**: `public.leagues`, `public.teams`, `public.league_members`
**Rosters**: `public.team_members`, `public.league_positions`
**Competition**: `public.matchups`, `public.matchup_players`, `public.matchup_player_games`
**Season Selection**: `public.league_week_player_seasons`
**Statistics**: `public.season_batting`, `public.season_pitching`, `public.career_batting` (VIEW)
**Player Info**: `public.players`, `public.player_eligible_positions` (VIEW)

### Column Name Gotchas

| ❌ Common Mistake          | ✅ Actual Column Name                                 |
| -------------------------- | ----------------------------------------------------- |
| `matchups.status`          | `matchups.status` ✅ (correct)                        |
| `matchups.loading_status`  | `matchups.stats_loading_status`                       |
| `leagues.status`           | `leagues.draft_status`                                |
| `players.name`             | `players.first_name`, `players.last_name`             |
| `matchups.selected_season` | **REMOVED** - use `league_week_player_seasons.season` |

### Essential Foreign Keys

```
leagues.owner → app_internal.users.id
teams.league_id → leagues.id
team_members.team_id → teams.id
team_members.player_id → players.id
matchups.league_id → leagues.id
matchups.team1_id → teams.id
matchups.team2_id → teams.id
matchup_players.matchup_id → matchups.id
matchup_players.player_id → players.id
```

---

## Related Documentation

- **[Database Schema](../architecture/database-schema.md)** - Complete schema documentation
- **[Debugging with Database Timestamps](../guides/debugging-with-database-timestamps.md)** - Correlating logs with DB events
- **[Automatic Timestamps](../database/automatic-timestamps.md)** - How timestamps work
