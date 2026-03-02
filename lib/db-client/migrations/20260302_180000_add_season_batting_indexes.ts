import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add indexes to season_batting for WAR/wSB/GIDP CTE analytical queries
 *
 * Purpose:
 * - Several complex CTE queries against season_batting run at 2.1-2.3s each.
 * - No composite indexes exist for the GROUP BY aggregation and per-player
 *   league lookup patterns these queries use.
 *
 * Changes:
 * - idx_season_batting_lgid_season ON season_batting (lg_id, season)
 *     Supports GROUP BY (season, lg_id) aggregations used by wSB and GIDP adjustments.
 * - idx_season_batting_player_lgid ON season_batting (player_id, lg_id)
 *     Supports per-player league lookups used by offensive_war leaderboard.
 * - idx_woba_season_weights_season ON woba_season_weights (season)
 *     Supports join path from season_batting to woba_season_weights on season.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_season_batting_lgid_season
      ON public.season_batting (lg_id, season);

    CREATE INDEX IF NOT EXISTS idx_season_batting_player_lgid
      ON public.season_batting (player_id, lg_id);

    CREATE INDEX IF NOT EXISTS idx_woba_season_weights_season
      ON public.woba_season_weights (season);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS public.idx_season_batting_lgid_season;
    DROP INDEX IF EXISTS public.idx_season_batting_player_lgid;
    DROP INDEX IF EXISTS public.idx_woba_season_weights_season;
  `);
};
