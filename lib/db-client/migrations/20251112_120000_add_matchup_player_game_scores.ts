import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add scoring columns to matchup_player_games table
 *
 * Adds individual score columns for batting, fielding, pitching, and total score
 * to support detailed player performance tracking in matchups.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📊 Adding scoring columns to matchup_player_games...');

  // Add scoring columns
  await db.execute(`
    ALTER TABLE matchup_player_games
    ADD COLUMN IF NOT EXISTS batting_score NUMERIC(10, 3),
    ADD COLUMN IF NOT EXISTS fielding_score NUMERIC(10, 3),
    ADD COLUMN IF NOT EXISTS pitching_score NUMERIC(10, 3),
    ADD COLUMN IF NOT EXISTS total_score NUMERIC(10, 3);
  `);

  console.log('✅ Scoring columns added to matchup_player_games');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Removing scoring columns from matchup_player_games...');

  // Remove scoring columns
  await db.execute(`
    ALTER TABLE matchup_player_games
    DROP COLUMN IF EXISTS batting_score,
    DROP COLUMN IF EXISTS fielding_score,
    DROP COLUMN IF EXISTS pitching_score,
    DROP COLUMN IF EXISTS total_score;
  `);

  console.log('✅ Scoring columns removed from matchup_player_games');
};
