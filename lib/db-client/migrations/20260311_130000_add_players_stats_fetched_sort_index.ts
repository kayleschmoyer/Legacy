import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add index for buildPlayerPool sort query
 *
 * Purpose:
 * - The draft-processor buildPlayerPool sorts the players table by
 *   stats_last_fetched_at DESC NULLS LAST, id ASC to prioritise players
 *   whose stats have been loaded.  The previous query expressed this as a
 *   CASE WHEN expression which prevented index use, forcing a full-table
 *   sequential scan + sort before the LIMIT was applied.
 * - Adding a plain B-tree index on (stats_last_fetched_at DESC NULLS LAST,
 *   id ASC) lets PostgreSQL satisfy the ORDER BY + LIMIT directly from the
 *   index without scanning or sorting the whole table.
 *
 * Changes:
 * - players: add index on (stats_last_fetched_at DESC NULLS LAST, id ASC)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_players_stats_fetched_sort
      ON players (stats_last_fetched_at DESC NULLS LAST, id ASC);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS idx_players_stats_fetched_sort;
  `);
};
