import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Drop legacy ordinal game number columns from matchup_player_games
 *
 * Purpose:
 * - Remove batting_game_num, fielding_game_num, pitching_game_num columns
 * - These were replaced by the game_identifier column which links all stat
 *   types to the same real baseball game
 * - The old design picked separate random ordinal numbers per stat type,
 *   mixing stats from different games — a fundamental design flaw
 *
 * Related: matchup-status-premature-completion fix
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(sql`
    ALTER TABLE matchup_player_games
      DROP COLUMN IF EXISTS batting_game_num,
      DROP COLUMN IF EXISTS fielding_game_num,
      DROP COLUMN IF EXISTS pitching_game_num;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(sql`
    ALTER TABLE matchup_player_games
      ADD COLUMN IF NOT EXISTS batting_game_num integer,
      ADD COLUMN IF NOT EXISTS fielding_game_num integer,
      ADD COLUMN IF NOT EXISTS pitching_game_num integer;
  `);
};
