# Skill: Database Schema Reference

## Overview

Schema reference for writing correct SQL queries in Legacy Sports. Load this before writing any database queries to avoid common mistakes.

## Critical: Two Schemas

Legacy Sports uses **two separate PostgreSQL schemas**:

| Schema         | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `public`       | Fantasy league data, matchups, players, statistics             |
| `app_internal` | Authentication and internal tables (users, game_stats, events) |

**Always use the schema prefix** in queries:

```sql
-- WRONG -- defaults to public, but users is in app_internal
SELECT * FROM users WHERE id = 123;

-- CORRECT
SELECT * FROM app_internal.users WHERE id = 123;
SELECT * FROM public.leagues WHERE id = 16;
```

---

## app_internal Schema

### `app_internal.users`

| Column          | Type                | Notes               |
| --------------- | ------------------- | ------------------- |
| `id`            | SERIAL PK           |                     |
| `username`      | VARCHAR(50) UNIQUE  |                     |
| `email`         | VARCHAR(100) UNIQUE |                     |
| `password_hash` | CHAR(128)           |                     |
| `access_level`  | ENUM                | `'none'`, `'admin'` |
| `created_at`    | TIMESTAMPTZ         |                     |
| `updated_at`    | TIMESTAMPTZ         |                     |

### `app_internal.game_stats`

| Column         | Type      | Notes                       |
| -------------- | --------- | --------------------------- |
| `id`           | SERIAL PK |                             |
| `game_id`      | ...       |                             |
| `last_updated` | TIMESTAMP | Use for debugging staleness |

---

## public Schema -- Key Tables

### `public.leagues`

| Column                      | Type              | Notes                                                         |
| --------------------------- | ----------------- | ------------------------------------------------------------- |
| `id`                        | SERIAL PK         |                                                               |
| `name`                      | VARCHAR           |                                                               |
| `owner`                     | INTEGER           | -> `app_internal.users.id`                                    |
| `draft_status`              | ENUM              | `'not-started'`, `'in-progress'`, `'completed'`               |
| `current_matchup`           | INTEGER           |                                                               |
| `week_advance_status`       | ENUM              | `'idle'`, `'queued'`, `'processing'`, `'success'`, `'failed'` |
| `invite_code`               | VARCHAR(8) UNIQUE |                                                               |
| `created_at` / `updated_at` | TIMESTAMP         |                                                               |

> Column is `draft_status`, NOT `status`

### `public.matchups`

| Column                        | Type          | Notes                                                               |
| ----------------------------- | ------------- | ------------------------------------------------------------------- |
| `id`                          | SERIAL PK     |                                                                     |
| `league_id`                   | INTEGER       | -> `public.leagues.id`                                              |
| `week_number`                 | INTEGER       |                                                                     |
| `team1_id` / `team2_id`       | INTEGER       | -> `public.teams.id`                                                |
| `team1_score` / `team2_score` | NUMERIC(10,2) |                                                                     |
| `status`                      | ENUM          | `'scheduled'`, `'in_progress'`, `'completed'`, `'cancelled'`        |
| `stats_loading_status`        | ENUM          | `'not_started'`, `'queued'`, `'loading'`, `'completed'`, `'failed'` |
| `start_time` / `end_time`     | TIMESTAMP     |                                                                     |
| `created_at` / `updated_at`   | TIMESTAMP     |                                                                     |

> Column is `stats_loading_status`, NOT `loading_status`
> `selected_season` column was removed -- use `league_week_player_seasons` instead

### `public.players`

| Column                      | Type               | Notes                 |
| --------------------------- | ------------------ | --------------------- |
| `id`                        | SERIAL PK          |                       |
| `first_name` / `last_name`  | TEXT               |                       |
| `bref_id`                   | VARCHAR(10) UNIQUE | Baseball-Reference ID |
| `stats_last_fetched_at`     | TIMESTAMP          |                       |
| `created_at` / `updated_at` | TIMESTAMP          |                       |

### Stats Tables

| Table                         | Type     | Notes                            |
| ----------------------------- | -------- | -------------------------------- |
| `season_batting`              | TABLE    | Source data per season           |
| `season_pitching`             | TABLE    | Source data per season           |
| `season_fielding`             | TABLE    | Source data per season           |
| `career_batting`              | **VIEW** | Read-only aggregate (AL/NL only) |
| `career_pitching`             | **VIEW** | Read-only aggregate              |
| `career_fielding`             | **VIEW** | Read-only aggregate              |
| `career_fielding_by_position` | **VIEW** | Read-only aggregate              |
| `player_eligible_positions`   | **VIEW** | Read-only                        |

> **Do not UPDATE/INSERT into views** -- write to `season_*` source tables; views auto-recalculate

### League Structure

| Table                        | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `teams`                      | Fantasy teams                      |
| `league_members`             | Users in a league                  |
| `team_members`               | Players on a roster                |
| `league_positions`           | Position slots (SP, RP, 1B, etc.)  |
| `league_week_player_seasons` | Per-week player season assignments |
| `drafts`, `draft_teams`      | Draft state                        |

> **Every league MUST have a `drafts` record.** Use `LeagueService.createLeague()` (in `lib/db-client/src/lib/services/LeagueService.ts`) which creates the draft record automatically. Never insert into `leagues` without also inserting into `drafts`. Missing draft records cause `startDraft` to use wrong defaults.

### Scoring

| Table                            | Purpose                      |
| -------------------------------- | ---------------------------- |
| `scoring_stat_definitions`       | Stat definitions             |
| `league_scoring_profiles`        | Per-league scoring rules     |
| `league_scoring_profile_entries` | Individual stat point values |
| `league_scoring_change_log`      | Audit log                    |

### Functions

| Function                                     | Purpose                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `compute_career_scores(p_league_id INTEGER)` | Returns per-player scoring (batting/pitching/fielding/total/avg_ppg) using league or default multipliers. Use for DB-level player sorting. |
| `is_major_league()`                          | Checks if a player has MLB-level stats                                                                                                     |

```sql
-- Example: Top 10 players by average points per game (default scoring)
SELECT * FROM compute_career_scores(NULL) ORDER BY avg_ppg DESC LIMIT 10;

-- Example: League-specific scoring
SELECT * FROM compute_career_scores(16) ORDER BY total_score DESC LIMIT 50;
```

---

## Common Query Patterns

### User lookup

```sql
SELECT id, email, username FROM app_internal.users WHERE id = 123;
```

### League with owner

```sql
SELECT l.id, l.name, l.draft_status, u.username AS owner_name
FROM public.leagues l
JOIN app_internal.users u ON l.owner = u.id
WHERE l.id = 16;
```

### Matchup details

```sql
SELECT m.id, m.week_number, m.status, m.stats_loading_status,
       t1.name AS team1_name, t2.name AS team2_name,
       m.team1_score, m.team2_score
FROM public.matchups m
JOIN public.teams t1 ON m.team1_id = t1.id
JOIN public.teams t2 ON m.team2_id = t2.id
WHERE m.league_id = 16 AND m.week_number = 1;
```

### Player career stats

```sql
SELECT p.first_name, p.last_name, cb.h, cb.hr, cb.rbi
FROM public.players p
JOIN public.career_batting cb ON p.id = cb.player_id
WHERE p.id = 456;
```

### Team roster

```sql
SELECT p.id, p.first_name, p.last_name, lp.position_type
FROM public.team_members tm
JOIN public.players p ON tm.player_id = p.id
JOIN public.league_positions lp ON tm.position_id = lp.id
WHERE tm.team_id = 5 AND tm.league_id = 16;
```
