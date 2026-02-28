/**
 * Migration: Add matchup performance indexes
 * Created: 2025-11-08
 * Ticket: LS-36
 *
 * Adds performance indexes to improve matchup query performance:
 * - Matchups table indexes (league_id, league_id+week_number)
 * - Matchup players table indexes (matchup_id, player_id, season, compound)
 * - Matchup player games indexes (matchup_player_id, game_num, compound, fielding_pos)
 * - Team members indexes for matchup operations
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Indexes for matchups table
  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchups_league_id_idx 
      ON matchups USING btree (league_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchups_league_id_week_number_idx 
      ON matchups USING btree (league_id, week_number);
  `);

  // Indexes for matchup_players table
  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_players_matchup_id_idx 
      ON matchup_players USING btree (matchup_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_players_player_id_idx 
      ON matchup_players USING btree (player_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_players_season_idx 
      ON matchup_players USING btree (season);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_players_matchup_player_idx 
      ON matchup_players USING btree (matchup_id, player_id);
  `);

  // Indexes for matchup_player_games table
  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_player_games_matchup_player_id_idx 
      ON matchup_player_games USING btree (matchup_player_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_player_games_game_num_idx 
      ON matchup_player_games USING btree (game_num);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_player_games_matchup_player_game_idx 
      ON matchup_player_games USING btree (matchup_player_id, game_num);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS matchup_player_games_fielding_pos_idx 
      ON matchup_player_games USING btree (fielding_game_pos);
  `);

  // Additional team_members indexes for matchup-related queries
  await db.execute(`
    CREATE INDEX IF NOT EXISTS team_members_league_id_idx 
      ON team_members USING btree (league_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS team_members_team_id_idx 
      ON team_members USING btree (team_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS team_members_player_id_idx 
      ON team_members USING btree (player_id);
  `);

  // Add comments for documentation
  await db.execute(`
    COMMENT ON INDEX matchups_league_id_idx IS 'Improves performance for league-specific matchup queries';
    COMMENT ON INDEX matchup_players_matchup_id_idx IS 'Prevents N+1 queries when loading matchup players';
    COMMENT ON INDEX matchup_player_games_matchup_player_id_idx IS 'Optimizes game data retrieval for matchup players';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop all indexes (in reverse order)
  await db.execute(`DROP INDEX IF EXISTS team_members_player_id_idx;`);
  await db.execute(`DROP INDEX IF EXISTS team_members_team_id_idx;`);
  await db.execute(`DROP INDEX IF EXISTS team_members_league_id_idx;`);
  await db.execute(
    `DROP INDEX IF EXISTS matchup_player_games_fielding_pos_idx;`,
  );
  await db.execute(
    `DROP INDEX IF EXISTS matchup_player_games_matchup_player_game_idx;`,
  );
  await db.execute(`DROP INDEX IF EXISTS matchup_player_games_game_num_idx;`);
  await db.execute(
    `DROP INDEX IF EXISTS matchup_player_games_matchup_player_id_idx;`,
  );
  await db.execute(`DROP INDEX IF EXISTS matchup_players_matchup_player_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_players_season_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_players_player_id_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchup_players_matchup_id_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchups_league_id_week_number_idx;`);
  await db.execute(`DROP INDEX IF EXISTS matchups_league_id_idx;`);
};
