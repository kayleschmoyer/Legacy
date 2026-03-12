import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add covering index on season_batting(player_id, season) (LS-1083)
 *
 * Purpose:
 * - The createBattingSeasonsPlayedLoader DataLoader runs
 *   COUNT(DISTINCT season) GROUP BY player_id against the large season_batting
 *   table for every player rendered on the draft board.
 * - The existing idx_season_batting_player_lgid_season index covers
 *   (player_id, lg_id, season), which supports lookups by player_id but is not
 *   a true covering index for the seasons-played query: lg_id sits between
 *   player_id and season, adding unnecessary index bulk, and Index Only Scans
 *   must still consult the visibility map per heap page to decide whether a
 *   heap fetch is needed.
 *
 * Changes:
 * - idx_season_batting_player_season: covering index on (player_id, season)
 *   so the DataLoader query can be satisfied entirely from the index without
 *   heap fetches (Index Only Scan).  Both columns needed by the query
 *   (player_id in WHERE/GROUP BY, season in COUNT DISTINCT) are present.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS public.idx_season_batting_player_season
      ON public.season_batting (player_id, season)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS public.idx_season_batting_player_season
  `);
};
