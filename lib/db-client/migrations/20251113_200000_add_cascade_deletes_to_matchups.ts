import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add CASCADE deletes to matchup-related foreign keys
 *
 * Ensures that when a matchup is deleted, all related matchup_players and
 * matchup_player_games are automatically deleted. Also adds CASCADE to
 * league_week_player_seasons when a league is deleted.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔗 Adding CASCADE deletes to matchup-related foreign keys...');

  // 1. matchup_players.matchup_id -> matchups.id
  await db.execute(`
    ALTER TABLE matchup_players 
    DROP CONSTRAINT IF EXISTS matchup_players_matchup_fk;
  `);
  await db.execute(`
    ALTER TABLE matchup_players 
    ADD CONSTRAINT matchup_players_matchup_fk 
    FOREIGN KEY (matchup_id) REFERENCES matchups(id) 
    ON DELETE CASCADE;
  `);

  // 2. matchup_player_games.matchup_player_id -> matchup_players.id
  await db.execute(`
    ALTER TABLE matchup_player_games 
    DROP CONSTRAINT IF EXISTS matchup_player_games_matchup_player_fk;
  `);
  await db.execute(`
    ALTER TABLE matchup_player_games 
    ADD CONSTRAINT matchup_player_games_matchup_player_fk 
    FOREIGN KEY (matchup_player_id) REFERENCES matchup_players(id) 
    ON DELETE CASCADE;
  `);

  // 3. league_week_player_seasons.league_id -> leagues.id (for completeness)
  await db.execute(`
    ALTER TABLE league_week_player_seasons 
    DROP CONSTRAINT IF EXISTS league_week_player_seasons_league_fk;
  `);
  await db.execute(`
    ALTER TABLE league_week_player_seasons 
    ADD CONSTRAINT league_week_player_seasons_league_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id) 
    ON DELETE CASCADE;
  `);

  console.log('✅ CASCADE deletes added to matchup foreign keys');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log(
    '🔄 Removing CASCADE deletes from matchup-related foreign keys...',
  );

  // 1. matchup_players.matchup_id -> matchups.id
  await db.execute(`
    ALTER TABLE matchup_players 
    DROP CONSTRAINT IF EXISTS matchup_players_matchup_fk;
  `);
  await db.execute(`
    ALTER TABLE matchup_players 
    ADD CONSTRAINT matchup_players_matchup_fk 
    FOREIGN KEY (matchup_id) REFERENCES matchups(id);
  `);

  // 2. matchup_player_games.matchup_player_id -> matchup_players.id
  await db.execute(`
    ALTER TABLE matchup_player_games 
    DROP CONSTRAINT IF EXISTS matchup_player_games_matchup_player_fk;
  `);
  await db.execute(`
    ALTER TABLE matchup_player_games 
    ADD CONSTRAINT matchup_player_games_matchup_player_fk 
    FOREIGN KEY (matchup_player_id) REFERENCES matchup_players(id);
  `);

  // 3. league_week_player_seasons.league_id -> leagues.id
  await db.execute(`
    ALTER TABLE league_week_player_seasons 
    DROP CONSTRAINT IF EXISTS league_week_player_seasons_league_fk;
  `);
  await db.execute(`
    ALTER TABLE league_week_player_seasons 
    ADD CONSTRAINT league_week_player_seasons_league_fk 
    FOREIGN KEY (league_id) REFERENCES leagues(id);
  `);

  console.log('✅ CASCADE deletes removed from matchup foreign keys');
};
