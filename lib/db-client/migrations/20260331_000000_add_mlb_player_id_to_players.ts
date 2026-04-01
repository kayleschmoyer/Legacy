import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add mlb_player_id column to players table
 *
 * Purpose:
 * - Store the external MLB Stats API player ID alongside the existing bref_id
 *   so the MLB data provider pipeline can cross-reference players without a
 *   separate lookup table.
 * - Nullable because historical players (pre-2000) may not have a mapping yet.
 * - Indexed for fast lookups via the playerMlbStats GraphQL query and the
 *   stats lambda MLB provider message handler.
 *
 * Population strategy:
 * - Backfill via MLB Stats API roster endpoint (LS-1864 mlb-client library)
 * - Players without a known mapping remain NULL until populated by the sync job
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE players
      ADD COLUMN IF NOT EXISTS mlb_player_id INTEGER;
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS players_mlb_player_id_idx
      ON players (mlb_player_id)
      WHERE mlb_player_id IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS players_mlb_player_id_idx;
    ALTER TABLE players DROP COLUMN IF EXISTS mlb_player_id;
  `);
};
