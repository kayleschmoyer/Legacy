# Matchup System Architecture

**Status**: Implemented · **Epic**: LS-17 · **Last Updated**: April 7, 2026

The matchup system runs week-by-week head-to-head competition for fantasy
leagues — from scheduling pairings, to selecting per-player game days, to
calculating scores from real MLB stats, to advancing the league through
playoffs and crowning a champion. This document describes the end-to-end
architecture, the moving parts, and where each lives in the codebase.

For user-facing how-to content see:

- [Matchup System Guide](../guides/matchup-system-guide.md) — league members
- [Commissioner Matchup Management](../guides/commissioner-matchup-management.md) — admins
- [Matchup API Reference](../api/matchup-api.md) — GraphQL queries and mutations

---

## High-level data flow

```
Commissioner creates league + schedule
  └─► createAllMatchups (mutation)
        └─► matchups + matchup_players + league_week_player_seasons rows
              └─► autoSelectGames (EventBridge cron, system auth)
                    └─► matchup_player_games rows (per-day game picks)
                          └─► stats-lambda fetches box scores
                                └─► ScoringService computes team totals
                                      └─► matchups.team1_score / team2_score
                                            └─► autoAdvanceMatchups (EventBridge cron)
                                                  └─► status='completed', week++,
                                                      Discord recap posted,
                                                      playoffs check, tiebreakers
```

Per-game scores are **not** persisted. Only league-versioned scoring
multipliers and the resulting team totals are stored. This keeps history
deterministic when scoring profiles are versioned and lets retroactive scoring
changes be recomputed without backfilling per-game rows.

---

## Major subsystems

### 1. Schema and roster (`lib/db-client/src/drizzle/public/models/Matchups.ts`)

The persistent shape of a matchup. See
[Database Schema](database-schema.md#matchup-system) for the full per-table
breakdown. The four core tables:

| Table                        | Purpose                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `matchups`                   | One row per (league, week, team1, team2). Holds status, stats-loading status, scores.   |
| `matchup_players`            | Roster snapshot for each matchup with per-matchup `position_id` and `manually_edited`.  |
| `league_week_player_seasons` | Per-player season assignment for the matchup week (the season selection feature).       |
| `matchup_player_games`       | Per-day game selections (`game_num`, `game_identifier`, `fielding_game_pos`, SP skips). |

**Roster propagation rule**: when a future-week roster is generated from the
current team roster, rows with `manually_edited = true` are skipped so the
commissioner / team owner can pre-set lineups for upcoming weeks without
having them clobbered by the propagation job.

**Win-streak indexes**: composite partial indexes on
`(team1_id, end_time) WHERE status='completed'` (and the team2 mirror) exist
purely so the planner uses index scans for `getWinStreakMatchupsForTeam`,
which the team profile page calls on every load.

### 2. Schedule generation and game selection

- **Schedule creation** — `createAllMatchups` mutation in
  `lambdas/db/src/schema/matchups/mutations.ts` (line 665) calls
  `createAllMatchupsForLeague` from `@legacy-sports/db-client`, which uses
  `MatchupService` internally. It generates the full season's pairings up
  front, populates the roster snapshot, and seeds each player's
  `league_week_player_seasons` row.
- **Schedule regeneration** — `adminRegenerateLeagueSchedule` (mutation, line 717) is admin-only and deletes only future `scheduled` matchups before
  regenerating the remaining schedule, preserving `in_progress` and
  `completed` weeks.
- **Game selection** — `autoSelectGames` (scheduled mutation,
  `scheduled-mutations.ts:87`) is invoked nightly by EventBridge with system
  auth (no human user). It walks each league's active week, picks a real MLB
  game per `game_num`, and writes the result to `matchup_player_games`.
  Probabilistic SP skip logic flips `sp_skipped = true` for starting pitchers
  who would not realistically pitch on the chosen day.

### 3. Scoring engine

Scoring is **per league**, **versioned**, and **change-logged**. See
`lib/db-client/src/drizzle/public/models/Scoring.ts`:

- `scoring_stat_definitions` — the catalog of stats the system understands
  (HR, RBI, IP, K, etc.) with `default_multiplier` and bounds.
- `league_scoring_profiles` — versioned profiles per league, exactly one
  flagged `is_default`.
- `league_scoring_profile_entries` — per-stat overrides for a profile.
- `league_scoring_change_log` — audit trail of every multiplier change with
  actor, reason, and the previous and new multipliers.

The stats lambda joins MLB box scores against the active league profile,
applies the multipliers, and persists only the resulting team totals to
`matchups.team1_score` / `team2_score`. This design makes "what would the
score have been if we tweaked HR from 4 to 3?" cheap to answer — the input
data is unchanged.

### 4. Status machine and automated progression

A matchup's `status` enum is `scheduled → in_progress → completed` (with
`cancelled` as a terminal escape hatch). `stats_loading_status` is a
parallel enum that tracks the async fetch from the stats lambda
(`not_started → queued → loading → completed | failed → retry`).

`autoAdvanceMatchups` (`scheduled-mutations.ts:303`) is the weekly job that:

1. Marks the prior week's matchups `completed`.
2. Updates each league's `current_week`.
3. Triggers Discord weekly recap post.
4. Checks playoff entry conditions.
5. Resolves any tied matchups via the league's tiebreaker rules.

### 5. Playoffs and championships (`Playoffs.ts`)

- `playoff_brackets` — bracket configuration: format (`4-team | 6-team |
8-team`), `start_week`, `multi_week_matchups` flag.
- `playoff_matchups` — individual playoff games with seeding metadata and
  `playoff_round` enum.
- `playoff_seeds` — top-N seeding snapshot at playoff start.
- `champion_trophies` — historical record of champion, runner-up, score, and
  championship week (unique per `(league_id, season)`).

The bracket service (`lambdas/db/src/services/playoff-service.ts`) builds the
correct round structure for each format and supports multi-week playoff
matchups when configured.

### 6. Tiebreakers (`Playoffs.ts`)

- `tiebreaker_rules` — one row per league with `primary_method`,
  `secondary_method`, `tertiary_method`, and an
  `allow_commissioner_override` flag plus a JSONB `config` for
  method-specific options.
- `tiebreaker_history` — append-only audit log of every applied
  tiebreaker, including which method resolved it, whether it was a
  commissioner override, and the resulting winner.

Supported methods: `highest_category`, `total_season_points`,
`head_to_head_record`, `random`, `co_champion`.

### 7. Chat, reactions, and moderation (`Matchups.ts`)

The matchup chat and trash-talk system (LS-37) lives in the same file as
matchup core. Key tables:

- `matchup_messages` — text/gif/system messages with reply threading,
  pinning, profanity flagging, and soft delete.
- `matchup_message_reactions` — emoji reactions
  (`like|fire|laugh|wow|trophy|thumbs_down`).
- `matchup_chat_blocks` — block scopes (`matchup | league | global`) with
  optional expiration.
- `matchup_message_connections` — WebSocket connection tracking for
  presence and live delivery.
- `matchup_message_reports` — moderator workflow with
  `pending → reviewing → resolved | dismissed` status.

### 8. Notifications

Three EventBridge-driven Discord integrations live alongside the matchup
schema in `lambdas/db/src/schema/matchups/`:

| File                       | Trigger       | Purpose                                       |
| -------------------------- | ------------- | --------------------------------------------- |
| `discord-score-alerts.ts`  | Every 4 hours | Live score updates, flags close matchups      |
| `discord-weekly-recaps.ts` | Weekly        | Posts the week-end recap with winners/losers  |
| `discord-reminders.ts`     | Hourly        | Lineup-lock reminders before game-day cutoffs |

Mobile push notifications are handled by the broader notification system
(`notification_preferences`, `device_tokens`, `notification_history`) — the
matchup-side just emits domain events.

### 9. Recaps and projections

The narrative library (`lib/narrative/`) is a deterministic, template-based
generator that auto-generates a recap from each completed matchup's results:

- Classifies the result as `blowout` (margin ≥ 20), `close` (margin ≤ 5), or
  `normal`.
- Produces a short headline (≤ 80 chars), a 2–3 sentence narrative, and up
  to 5 highlight bullets pulled from top performers.
- Output is **deterministic** — seeded on `matchup_id` so the same matchup
  always produces the same recap.

The dual projection system (LS-36) computes both **matchup-context
projections** (what we expect this player to score in this specific matchup)
and **career-context projections** (long-term baseline) and exposes both
through GraphQL so the UI can show "expected vs realized."

### 10. Analytics and standings

`lambdas/db/src/services/standings-service.ts` exposes:

- `getStandings(leagueId, season?, sortBy?)` — full standings with custom
  sort.
- `getHeadToHeadRecord(...)` — direct team comparison.
- `getSeasonSummary(...)` and `getMatchupHistory(...)` — historical queries.
- `getPlayoffRace(...)` — playoff qualification odds and magic numbers.

The dedicated `analytics.ts` schema module exposes `TeamStatistics`,
`PowerRanking`, and `PlayoffProjection` GraphQL types built on top of these
service calls.

### 11. UI surfaces

- **Web** (`apps/web/src/`) — `components/matchup/` contains `MatchupCard`,
  `MatchupGrid`, `MatchupScoreboard`, `MatchupRosterComparison`, plus the
  live `Scoreboard` / `ScoreboardTicker` and the
  `commissioner/MatchupControl` admin panel (which drives
  `autoAdvanceMatchups`). `features/matchup/` contains
  `MatchupRosterEditor` and `MatchupWinProbabilityPanel`. Both directories
  exist intentionally — `components/matchup` for the lower-level reusable
  bits and `features/matchup` for the higher-level feature compositions.
- **Pages** — `apps/web/src/pages/matchup/MatchupDetailPage.tsx` is the
  primary detail-page entry point.
- **Cross-platform / shared** (`lib/shared-components/`) — GraphQL fragments
  (`matchup.fragment.graphql`, `matchupPlayer.fragment.graphql`,
  `matchupRecap.fragment.graphql`) and the cross-platform display helpers
  (`scoreFormatting.ts`, `entry/matchup.ts`).
- **Mobile** — React Native components consume the same shared fragments
  via Apollo + the Metro `.native.ts` resolution pattern documented in
  [Cross-Platform System](cross-platform-system.md).

---

## Authorization model

| Operation                             | Who                                                                |
| ------------------------------------- | ------------------------------------------------------------------ |
| `createMatchup` / `createAllMatchups` | League commissioner, general manager, assistant manager, or admin  |
| `updateMatchupScore`                  | Admin or system request (manual override)                          |
| `updateMatchupStatus`                 | Admin or system request                                            |
| `updateMatchupPlayerPosition`         | The team's owner or commissioner                                   |
| `swapMatchupPlayerPositions`          | The team's owner or commissioner                                   |
| `adminRegenerateLeagueSchedule`       | Admin only                                                         |
| `autoSelectGames`                     | System auth, admin, or league-scoped commissioner / GM / assistant |
| `autoAdvanceMatchups`                 | System auth, admin, or league-scoped commissioner / GM / assistant |
| Read queries                          | Authenticated users                                                |

> Read queries currently require an authenticated user (`context.user`). The matchup query resolvers do not currently verify league membership, so read access is broader than league-member-only access.

`autoSelectGames` and `autoAdvanceMatchups` share the
[`assertAuthorized`](../../lambdas/db/src/schema/matchups/system-auth.ts)
guard. EventBridge invokes them with a signed system principal as the
primary trigger, and admins can run them across all leagues. The same
guard also permits non-admin commissioners, general managers, and
assistant managers to invoke them for a single league when a `leagueId`
is supplied — access is then checked against that league's membership.

---

## Performance considerations

- **Composite partial indexes** on `(team_id, end_time) WHERE status='completed'`
  make team profile streak lookups O(log n).
- **`matchup_players_matchup_team_idx`** speeds the per-team lineup query
  used by every matchup detail page.
- **DataLoaders** under `lambdas/db/src/schema/dataloaders/`, used by matchup
  field resolvers in `lambdas/db/src/schema/matchups/types.ts`, batch team /
  player lookups so an N-team standings page is two queries, not 2N.
- **Per-game scores are not persisted** — see [Scoring engine](#3-scoring-engine).
  This trades a small amount of recompute on edit for a much smaller, simpler
  schema.
- **Optimized history queries** — `lib/db-client/src/lib/client/matchup-queries-optimized.ts`
  contains the win/loss/streak queries that back the standings page; they
  rely on the partial indexes above.

See [Performance optimization tickets under LS-34](https://bkrupa.atlassian.net/browse/LS-34)
for the specific optimization work that landed during the system build-out.

---

## Related tickets

This subsystem was built under **epic LS-17** (Set up matchup system for
fantasy leagues). Notable child stories:

| Ticket | Subsystem                                |
| ------ | ---------------------------------------- |
| LS-18  | Database schema for pairings and scoring |
| LS-19  | GraphQL schema and resolvers             |
| LS-20  | Scheduling algorithm                     |
| LS-21  | Score calculation engine                 |
| LS-22  | History and results tracking             |
| LS-23  | React Native UI components               |
| LS-24  | Next.js web UI components                |
| LS-25  | Notification system                      |
| LS-26  | Automated matchup progression            |
| LS-27  | Analytics and statistics dashboard       |
| LS-28  | Playoffs and championship                |
| LS-29  | Trade deadline and roster lock features  |
| LS-30  | Matchup preview and predictions          |
| LS-31  | Matchup-specific chat and trash talk     |
| LS-32  | Tiebreaker rules system                  |
| LS-34  | Performance optimization                 |
| LS-35  | This documentation set                   |
| LS-36  | Dual projection system                   |
| LS-39  | Tiebreaker configuration UI              |

---

## See also

- [Matchup API Reference](../api/matchup-api.md)
- [Matchup System Guide (league members)](../guides/matchup-system-guide.md)
- [Commissioner Matchup Management](../guides/commissioner-matchup-management.md)
- [Database Schema](database-schema.md)
- [GraphQL Integration](graphql-integration.md)
- [Season Selection Architecture](season-selection-architecture.md)
