import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Drop player_game_scores table
 *
 * Purpose:
 * - The player_game_scores table was scaffolded as a pre-computed fantasy score
 *   cache, but the write side was never implemented and nothing consumes it.
 * - No lambda, CLI command, or scheduled process inserts/upserts into this table.
 * - The getPlayerGameScores GraphQL query was the only consumer and has been removed.
 * - Matchup scoring reads directly from game_batting / game_pitching / game_fielding.
 *
 * Changes:
 * - DROP TABLE player_game_scores (CASCADE to drop dependent indexes/constraints)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  console.log('🗑️  Dropping player_game_scores table...');
  await db.execute(`
    DROP TABLE IF EXISTS player_game_scores CASCADE;
  `);
  console.log('✅ player_game_scores table dropped');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  console.log('📊 Restoring player_game_scores table...');
  await db.execute(`
    CREATE TABLE player_game_scores (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      game_num INTEGER NOT NULL,
      batting_score NUMERIC(10,3),
      pitching_score NUMERIC(10,3),
      fielding_score NUMERIC(10,3),
      total_score NUMERIC(10,3) GENERATED ALWAYS AS (
        COALESCE(batting_score, 0) + COALESCE(pitching_score, 0) + COALESCE(fielding_score, 0)
      ) STORED,
      batting_stats JSONB,
      pitching_stats JSONB,
      fielding_stats JSONB,
      computed_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT player_game_scores_player_fk
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      CONSTRAINT player_game_scores_unique
        UNIQUE (player_id, season, game_num)
    );
    CREATE INDEX idx_player_game_scores_player_season
      ON player_game_scores(player_id, season);
    CREATE INDEX idx_player_game_scores_lookup
      ON player_game_scores(player_id, season, game_num);
    CREATE INDEX idx_player_game_scores_total
      ON player_game_scores(total_score DESC)
      WHERE total_score IS NOT NULL;
  `);
  console.log('✅ player_game_scores table restored');
};
