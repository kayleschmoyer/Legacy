/**
 * Migration: Add sp_skipped column to matchup_player_games
 *
 * Purpose: Allow explicit differentiation between two states that both have
 * a null game_identifier:
 *   1. SP probabilistically skipped (not starting this game day) → sp_skipped = true
 *   2. SP/other player selected but stats not yet cached → sp_skipped = false (default)
 *
 * Without this column, the only signal was:
 *   - skip:    gameIdentifier IS NULL AND stats_loading_status = 'completed'
 *   - pending: gameIdentifier IS NULL AND stats_loading_status = 'pending'
 *
 * That relied on implicit convention rather than an explicit flag, and breaks
 * down for non-pitcher players where stats_loading_status can also be
 * 'completed' with a null identifier (no games found).
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
  console.log('📊 Adding sp_skipped to matchup_player_games...');

  await db.execute(
    sql`ALTER TABLE matchup_player_games ADD COLUMN sp_skipped BOOLEAN NOT NULL DEFAULT FALSE`,
  );

  // Backfill existing rows: infer skipped = (game_identifier IS NULL AND stats_loading_status = 'completed')
  await db.execute(
    sql`UPDATE matchup_player_games SET sp_skipped = TRUE WHERE game_identifier IS NULL AND stats_loading_status = 'completed'`,
  );

  console.log('✅ sp_skipped column added to matchup_player_games');
};

export const down = async ({
  db,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔄 Removing sp_skipped from matchup_player_games...');

  await db.execute(
    sql`ALTER TABLE matchup_player_games DROP COLUMN sp_skipped`,
  );

  console.log('✅ sp_skipped column removed from matchup_player_games');
};
