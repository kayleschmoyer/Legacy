import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Remove score columns from matchup_player_games table
 *
 * Scores should be calculated on the frontend using the @legacy-sports/scoring package
 * and league-specific scoring settings. They should never be stored in the database.
 *
 * Removes: batting_score, fielding_score, pitching_score, total_score columns
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🗑️  Removing score columns from matchup_player_games...');

  // Remove score columns - these should only be calculated on the frontend
  await db.execute(`
    ALTER TABLE matchup_player_games
    DROP COLUMN IF EXISTS batting_score,
    DROP COLUMN IF EXISTS fielding_score,
    DROP COLUMN IF EXISTS pitching_score,
    DROP COLUMN IF EXISTS total_score;
  `);

  console.log('✅ Score columns removed from matchup_player_games');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Re-adding score columns to matchup_player_games...');

  // Re-add columns if we need to rollback
  await db.execute(`
    ALTER TABLE matchup_player_games
    ADD COLUMN batting_score NUMERIC(10, 3),
    ADD COLUMN fielding_score NUMERIC(10, 3),
    ADD COLUMN pitching_score NUMERIC(10, 3),
    ADD COLUMN total_score NUMERIC(10, 3);
  `);

  console.log('✅ Score columns re-added to matchup_player_games');
};
