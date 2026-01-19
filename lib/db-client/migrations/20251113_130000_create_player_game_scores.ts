import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create player_game_scores table
 *
 * Pre-computes fantasy scores for every player's individual games.
 * This eliminates the need for on-demand score calculation during matchups.
 *
 * Architecture:
 * - One row per player/season/game combination
 * - Stores pre-calculated batting/pitching/fielding scores
 * - JSONB columns store raw stats for quick reference
 * - Referenced by matchup_player_games for instant score lookup
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📊 Creating player_game_scores table...');

  await db.execute(`
    CREATE TABLE player_game_scores (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      game_num INTEGER NOT NULL,
      
      -- Pre-computed fantasy scores using league scoring rules
      batting_score NUMERIC(10, 3),
      pitching_score NUMERIC(10, 3),
      fielding_score NUMERIC(10, 3),
      total_score NUMERIC(10, 3) GENERATED ALWAYS AS (
        COALESCE(batting_score, 0) + 
        COALESCE(pitching_score, 0) + 
        COALESCE(fielding_score, 0)
      ) STORED,
      
      -- Denormalized stats for quick reference (avoids joins to game_batting/pitching/fielding)
      batting_stats JSONB,
      pitching_stats JSONB,
      fielding_stats JSONB,
      
      -- When this score was computed
      computed_at TIMESTAMP DEFAULT NOW(),
      
      -- Ensure one score record per player/season/game
      UNIQUE(player_id, season, game_num),
      
      -- Foreign key to players table
      CONSTRAINT player_game_scores_player_fk 
        FOREIGN KEY (player_id) 
        REFERENCES players(id) 
        ON DELETE CASCADE
    );
  `);

  // Create indexes for common query patterns
  console.log('📊 Creating indexes on player_game_scores...');

  await db.execute(`
    -- Index for looking up scores by player and season
    CREATE INDEX idx_player_game_scores_player_season 
      ON player_game_scores(player_id, season);
    
    -- Index for looking up specific games
    CREATE INDEX idx_player_game_scores_lookup 
      ON player_game_scores(player_id, season, game_num);
    
    -- Index for filtering by score ranges (e.g., "best games")
    CREATE INDEX idx_player_game_scores_total 
      ON player_game_scores(total_score DESC) 
      WHERE total_score IS NOT NULL;
  `);

  console.log('✅ player_game_scores table created with indexes');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Dropping player_game_scores table...');

  await db.execute(`
    DROP TABLE IF EXISTS player_game_scores CASCADE;
  `);

  console.log('✅ player_game_scores table dropped');
};
