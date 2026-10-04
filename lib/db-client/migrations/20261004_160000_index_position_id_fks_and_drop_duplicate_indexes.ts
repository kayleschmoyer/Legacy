import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Index league_positions FKs + drop exact-duplicate indexes (LS-10551)
 *
 * Purpose:
 * - `DELETE FROM leagues WHERE id = $1` averaged 422ms on dev. Deleting a
 *   league cascades to league_positions, and each league_positions delete then
 *   seq-scanned two referencing tables whose FK column had no usable index:
 *     - team_members.position_id (ON DELETE CASCADE) — the only index covering
 *       it, team_members_uk_team_position, leads with team_id.
 *     - matchup_players.position_id (ON DELETE SET NULL) — only covered as the
 *       trailing column of matchup_players_unique_slot_idx.
 *   matchup_players showed ~203k seq scans in pg_stat_user_tables.
 *
 * - The dev DB carried 40 groups of exact-duplicate indexes (same columns,
 *   expressions, predicate and opclass) — pure write amplification and
 *   storage (~85MB for game_batting alone). For each group the index that
 *   backs a PRIMARY KEY / UNIQUE constraint is kept; where neither member
 *   backs a constraint, the one declared in the Drizzle models is kept.
 *
 * Re-derive duplicates with:
 *   SELECT indrelid::regclass, array_agg(indexrelid::regclass) FROM pg_index
 *   GROUP BY indrelid, indkey::text, coalesce(indexprs::text,''),
 *            coalesce(indpred::text,''), indclass::text
 *   HAVING count(*) > 1;
 *
 * Every statement uses CONCURRENTLY (the migration runner does not wrap
 * migrations in a transaction — see migration-runner.ts) and IF [NOT] EXISTS,
 * because several of the duplicates exist only on long-lived databases that
 * drifted from the migration history. CONCURRENTLY statements cannot share a
 * multi-statement query string, so each one is issued on its own.
 */

/** Redundant indexes dropped by `up`, with the definition `down` restores. */
const DUPLICATE_INDEXES: ReadonlyArray<{ name: string; definition: string }> = [
  // == leagues_invite_code_unique
  { name: 'public.leagues_invite_code_idx', definition: 'public.leagues USING btree (invite_code)' },
  // == idx_matchup_player_games_player_game
  {
    name: 'public.matchup_player_games_matchup_player_game_idx',
    definition: 'public.matchup_player_games USING btree (matchup_player_id, game_num)',
  },
  // == matchups_pkey
  { name: 'public.idx_matchup_scores_view_matchup_id', definition: 'public.matchups USING btree (id)' },
  // == game_{batting,fielding,pitching}_pkey
  {
    name: 'public.game_batting_player_id_season_game_num_idx',
    definition: 'public.game_batting USING btree (player_id, season, game_number)',
  },
  {
    name: 'public.game_fielding_player_id_season_game_num_idx',
    definition: 'public.game_fielding USING btree (player_id, season, game_num)',
  },
  {
    name: 'public.game_pitching_player_id_season_game_num_idx',
    definition: 'public.game_pitching USING btree (player_id, season, game_num)',
  },
  // == idx_season_batting_lgid_playerid
  { name: 'public.idx_season_batting_lgid_player', definition: 'public.season_batting USING btree (lg_id, player_id)' },
  // == users_username_uk / users_canonical_email_uk
  { name: 'app_internal.users__index', definition: 'app_internal.users USING btree (username)' },
  { name: 'app_internal.users_canonical_email_idx', definition: 'app_internal.users USING btree (canonical_email)' },
  { name: 'app_internal.users_email_index', definition: 'app_internal.users USING btree (canonical_email)' },
  // == *_league_id_idx / *_bracket_id_idx / *_matchup_id_idx / *_user_id_idx / *_message_id_idx / *_sender_id_idx
  { name: 'public.playoff_brackets_league_idx', definition: 'public.playoff_brackets USING btree (league_id)' },
  { name: 'public.playoff_matchups_bracket_idx', definition: 'public.playoff_matchups USING btree (bracket_id)' },
  { name: 'public.playoff_seeds_bracket_idx', definition: 'public.playoff_seeds USING btree (bracket_id)' },
  { name: 'public.champion_trophies_league_idx', definition: 'public.champion_trophies USING btree (league_id)' },
  {
    name: 'public.matchup_message_connections_league_idx',
    definition: 'public.matchup_message_connections USING btree (league_id)',
  },
  {
    name: 'public.matchup_message_connections_matchup_idx',
    definition: 'public.matchup_message_connections USING btree (matchup_id)',
  },
  {
    name: 'public.matchup_message_connections_user_idx',
    definition: 'public.matchup_message_connections USING btree (user_id)',
  },
  {
    name: 'public.matchup_message_reactions_message_idx',
    definition: 'public.matchup_message_reactions USING btree (message_id)',
  },
  { name: 'public.matchup_messages_sender_idx', definition: 'public.matchup_messages USING btree (sender_id)' },
  // == tiebreaker_rules_league_uk
  { name: 'public.tiebreaker_rules_league_idx', definition: 'public.tiebreaker_rules USING btree (league_id)' },
  // == league_week_player_seasons_unique
  {
    name: 'public.idx_league_week_player_seasons_lookup',
    definition: 'public.league_week_player_seasons USING btree (league_id, week_number, player_id)',
  },
  // == draft_picks_uk_draft_overall
  { name: 'public.draft_picks_overall_pick_idx', definition: 'public.draft_picks USING btree (draft_id, overall_pick)' },
  // == woba_season_weights_pkey
  { name: 'public.idx_woba_season_weights_season', definition: 'public.woba_season_weights USING btree (season)' },
  // == season_draft_games_invite_code_unique
  {
    name: 'public.season_draft_games_invite_code_idx',
    definition: 'public.season_draft_games USING btree (invite_code)',
  },
  // == league_dues_settings_league_uk
  { name: 'public.league_dues_settings_league_id_idx', definition: 'public.league_dues_settings USING btree (league_id)' },
  // == game_football_*_player_season_game_num_unique
  ...['passing', 'rushing', 'receiving', 'kicking', 'defense'].map((stat) => ({
    name: `public.game_football_${stat}_player_id_season_game_num_idx`,
    definition: `public.game_football_${stat} USING btree (player_id, season, game_num)`,
  })),
  // == football_season_*_player_season_idx
  ...['passing', 'rushing', 'receiving', 'kicking', 'defense'].map((stat) => ({
    name: `public.football_season_${stat}_player_id_season_idx`,
    definition: `public.football_season_${stat} USING btree (player_id, season)`,
  })),
  // == football_season_defense_idp_player_id_season_idx (the name the Drizzle model declares)
  {
    name: 'public.football_season_defense_idp_player_season_idx',
    definition: 'public.football_season_defense_idp USING btree (player_id, season)',
  },
  // == career_football_*_pkey
  ...['passing', 'rushing', 'receiving', 'kicking', 'defense'].map((stat) => ({
    name: `public.career_football_${stat}_player_id_idx`,
    definition: `public.career_football_${stat} USING btree (player_id)`,
  })),
];

/**
 * Leftovers of the 2025 notification system that only exist on databases
 * built fresh from the migration history (20251108_030000 sorts after its own
 * removal in 20250206_000000, then 20260206_000001 recreates the tables under
 * the names the Drizzle models declare). They duplicate the Drizzle-declared
 * indexes/constraints and are absent from long-lived databases, so `down`
 * does not recreate them.
 */
const LEGACY_NOTIFICATION_INDEXES = [
  'public.notification_history_user_idx', // == notification_history_user_id_idx
  'public.notification_history_read_idx', // == notification_history_is_read_idx
  'public.device_tokens_user_idx', // == device_tokens_user_id_idx
];
const LEGACY_NOTIFICATION_CONSTRAINTS = [
  { table: 'public.notification_preferences', name: 'notification_preferences_user_uk' }, // == ..._user_id_unique
  { table: 'public.device_tokens', name: 'device_tokens_token_uk' }, // == device_tokens_device_token_unique
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS team_members_position_id_idx
      ON public.team_members USING btree (position_id);
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS matchup_players_position_id_idx
      ON public.matchup_players USING btree (position_id)
      WHERE position_id IS NOT NULL;
  `);

  for (const { name } of DUPLICATE_INDEXES) {
    await db.execute(`DROP INDEX CONCURRENTLY IF EXISTS ${name};`);
  }

  for (const name of LEGACY_NOTIFICATION_INDEXES) {
    await db.execute(`DROP INDEX CONCURRENTLY IF EXISTS ${name};`);
  }
  for (const { table, name } of LEGACY_NOTIFICATION_CONSTRAINTS) {
    await db.execute(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name};`);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  for (const { name, definition } of DUPLICATE_INDEXES) {
    // CREATE INDEX takes an unqualified name; the schema comes from the table.
    const indexName = name.slice(name.indexOf('.') + 1);
    await db.execute(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON ${definition};`);
  }

  await db.execute(`DROP INDEX CONCURRENTLY IF EXISTS public.matchup_players_position_id_idx;`);
  await db.execute(`DROP INDEX CONCURRENTLY IF EXISTS public.team_members_position_id_idx;`);
};
