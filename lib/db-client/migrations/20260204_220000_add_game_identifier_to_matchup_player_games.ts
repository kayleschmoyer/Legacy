/**
 * Migration: Add game_identifier column to matchup_player_games
 *
 * Purpose: Enable selecting games by physical game identifier instead of game numbers
 *
 * Changes:
 * - Add game_identifier column (nullable, will be populated by stats-lambda)
 * - Keep existing batting/pitching/fielding game_num columns for backward compatibility during transition
 *
 * Flow:
 * 1. Season selection → queue stats loading
 * 2. Stats loading → select random game_identifiers → populate this column
 * 3. Frontend/scoring uses game_identifier to look up stats
 */

import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type postgres from 'postgres';

export const up = async ({
  db,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('📊 Adding game_identifier to matchup_player_games...');

  await db.execute(
    sql`ALTER TABLE matchup_player_games ADD COLUMN game_identifier VARCHAR(20)`,
  );

  console.log('✅ game_identifier column added to matchup_player_games');
};

export const down = async ({
  db,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔄 Removing game_identifier from matchup_player_games...');

  await db.execute(
    sql`ALTER TABLE matchup_player_games DROP COLUMN game_identifier`,
  );

  console.log('✅ game_identifier column removed from matchup_player_games');
};
