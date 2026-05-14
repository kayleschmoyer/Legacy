import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Replacement for 20260311_090000_add_batting_seasons_played_covering_index.ts.
 *
 * That migration used a schema-qualified index name
 * (public.idx_season_batting_player_season) which fails with CREATE INDEX
 * CONCURRENTLY in PostgreSQL 16 — the same index name without the schema
 * prefix works correctly. This migration is idempotent: IF NOT EXISTS makes
 * it a no-op on databases where the original migration already ran.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_batting_player_season
      ON season_batting (player_id, season)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS idx_season_batting_player_season
  `);
};
