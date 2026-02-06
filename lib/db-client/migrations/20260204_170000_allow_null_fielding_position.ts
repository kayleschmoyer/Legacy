import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type postgres from 'postgres';

/**
 * Migration: Allow NULL fielding_game_pos in matchup_player_games
 *
 * Reason: Pitchers and some players may not have fielding stats for their assigned season.
 * The game selection lambda should still create game records for batting and pitching stats
 * even when fielding stats are unavailable.
 *
 * Bug fix for: Players being completely skipped during game selection when they lack
 * fielding stats, causing inconsistent game counts (e.g., 2/5 games vs 4/5 games).
 */
export const up = async ({
  db,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔧 Allowing NULL for fielding_game_pos...');

  // Allow NULL for fielding_game_pos
  await db.execute(
    sql`ALTER TABLE matchup_player_games ALTER COLUMN fielding_game_pos DROP NOT NULL`,
  );

  console.log(
    '✅ Modified matchup_player_games.fielding_game_pos to allow NULL',
  );
};

export const down = async ({
  db,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔧 Restoring NOT NULL constraint...');

  // Update any NULL values to empty string before adding NOT NULL constraint back
  await db.execute(
    sql`UPDATE matchup_player_games SET fielding_game_pos = '' WHERE fielding_game_pos IS NULL`,
  );

  // Restore NOT NULL constraint
  await db.execute(
    sql`ALTER TABLE matchup_player_games ALTER COLUMN fielding_game_pos SET NOT NULL`,
  );

  console.log(
    '✅ Restored matchup_player_games.fielding_game_pos NOT NULL constraint',
  );
};
