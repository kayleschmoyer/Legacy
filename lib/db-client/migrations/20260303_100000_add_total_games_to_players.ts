import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add total_games column to the players table
 *
 * Purpose:
 * - Eliminate the 4th most expensive correlated subquery in pg_stat_statements
 *   (217 calls × 4,516 ms mean = 980 s total; ~17.9% of all DB exec time).
 * - The old pattern fired two correlated subqueries per player row:
 *     COALESCE((SELECT cb.g FROM career_batting  cb WHERE cb.player_id = p.id ...), 0)
 *   + COALESCE((SELECT cp.g FROM career_pitching cp WHERE cp.player_id = p.id ...), 0)
 * - Replacing with a single pre-computed integer column turns O(N) subquery fans
 *   into a plain column read.
 *
 * Changes:
 * - ADD COLUMN total_games INTEGER NOT NULL DEFAULT 0 to players
 * - Back-fill from career_batting + career_pitching views
 * - Add index for range queries on total_games (min-career-games filters)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE players
      ADD COLUMN total_games integer NOT NULL DEFAULT 0;
  `);

  await db.execute(`
    UPDATE players p
    SET total_games =
          COALESCE((SELECT g FROM career_batting  WHERE player_id = p.id), 0)
        + COALESCE((SELECT g FROM career_pitching WHERE player_id = p.id), 0);
  `);

  await db.execute(`
    CREATE INDEX idx_players_total_games ON players (total_games);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS idx_players_total_games;
  `);

  await db.execute(`
    ALTER TABLE players DROP COLUMN total_games;
  `);
};
