# Entity Chain — Tables and Models

> Loaded from [domain-reference SKILL](../SKILL.md).

## Entity chain

| Entity                   | Table(s)                                                                                | Model file (`lib/db-client/src/drizzle/public/models/`) | Notes                                                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users                    | `app_internal.users` (+ `public.users` view)                                            | `Users.ts`                                              | Carries `subscription_tier` (runtime premium source)                                                                                                                                                                            |
| Leagues                  | `leagues`                                                                               | `Leagues.ts`                                            | All settings live here: `sport`, `games_per_matchup` (default 5), `total_matchups` (default 10), `current_week`, `week_advance_status`, playoff config, era/pool filters, salary cap, `pitcher_starts_per_matchup`              |
| Membership & permissions | `league_members`                                                                        | `Leagues.ts`                                            | `permission_level` enum: `general_manager` \| `assistant_manager` \| `commissioner` (`leaguePermissionLevel` in `Enums.ts`). The old `owner` value was renamed — docs saying `owner` are stale                                  |
| Teams & rosters          | `teams`, `team_members`                                                                 | `Leagues.ts`                                            | `team_members` is the persistent roster                                                                                                                                                                                         |
| Drafts                   | `drafts`, `draft_teams`, `draft_picks`, `draft_queue`                                   | `Leagues.ts`                                            | `draft_mode` (`live`\|`automated`), `selection_method` (`standard`\|`auction`\|`random`), `draft_order` (`snake`\|`linear`) — the old `draft_type` enum was **dropped** (migration `20260219_000000_update_draft_type_enum.ts`) |
| Weeks                    | _(no table)_                                                                            | —                                                       | Weeks are implicit: `leagues.current_week` + `matchups.week_number`. All weeks' matchups are pre-created at draft completion                                                                                                    |
| Matchups                 | `matchups`, `matchup_players`                                                           | `Matchups.ts`                                           | One `matchups` row per (league, week, team1, team2); `matchup_players` is the per-week roster snapshot (`manually_edited` flag)                                                                                                 |
| Season assignment        | `league_week_player_seasons`                                                            | `Matchups.ts`                                           | The random-season-per-player-per-week feature; unique `(league_id, week_number, player_id)`                                                                                                                                     |
| Game picks               | `matchup_player_games`                                                                  | `Matchups.ts`                                           | Per-night real-game selections (`game_identifier`, `sp_skipped`)                                                                                                                                                                |
| Scoring                  | `league_scoring_profiles`, `league_scoring_profile_entries`, `scoring_stat_definitions` | `Scoring.ts`                                            | Versioned; one `is_default` profile per league                                                                                                                                                                                  |
| Playoffs                 | `playoff_brackets`, `playoff_seeds`, `playoff_matchups`                                 | `Playoffs.ts`                                           | Each playoff matchup gets a sibling row in `matchups` so the selection/scoring pipeline runs unchanged                                                                                                                          |

### Sport discriminator invariants

The multi-sport model ([`docs/architecture/multi-sport.md`](../../../../docs/architecture/multi-sport.md) — accurate on the discriminator; its stats-lambda router section is stale, see [Stale docs](#stale-docs--do-not-trust)):

1. `leagues.sport` (`sport_kind` enum: `baseball` | `football`) is the **canonical** discriminator; all sport-specific behavior gates on it. `players.sport` mirrors it. Both are `NOT NULL DEFAULT 'baseball'` (`Leagues.ts`, `Players.ts`).
2. Cross-sport roster moves are rejected by `assertSportCompatibility` ([`lambdas/db/src/schema/sport-eligibility.ts`](../../../../lambdas/db/src/schema/sport-eligibility.ts)).
3. Stat tables are sport-specific (`game_batting`/`game_pitching`/... vs `game_football_*`); no table mixes sports. Shared tables (matchups, rosters, scoring) discriminate at query time via `leagues.sport`.
4. GraphQL exposes per-sport stats via `union MatchupStats = BaseballMatchupStats | FootballMatchupStats` (`lambdas/db/schema.graphql`).
5. Football leagues additionally carry `defensive_format` (`'dst'` | `'idp'`); baseball leagues leave it at default (`Leagues.ts`).
6. Per-sport vocabularies (player pools, eras) live in lookup tables `sport_player_pools` / `sport_eras` keyed `(sport, key)` ([`Sports.ts`](../../../../lib/db-client/src/drizzle/public/models/Sports.ts)) — extending a sport's pools/eras is data, not code.

## Re-verification

| Fact                                                | Re-verify                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `advanced_football_stats` removed from entitlements | `grep -n advanced_football_stats lib/utils/src/lib/entitlements.ts` (expect no hits)  |
| Permission enum values                              | `grep -n -A 4 leaguePermissionLevel lib/db-client/src/drizzle/public/models/Enums.ts` |
