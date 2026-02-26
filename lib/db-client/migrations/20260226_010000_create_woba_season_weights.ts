import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create woba_season_weights table
 *
 * Purpose:
 * - Stores FanGraphs Guts! season-level wOBA linear weights, league wOBA,
 *   wOBA scale, and Runs Per Win (RPW) constants.
 * - Used by the oWAR (offensive WAR) calculation to apply season-specific
 *   weights instead of fixed constants, matching Baseball Reference methodology.
 *
 * Source: https://www.fangraphs.com/guts.aspx?type=cn
 *
 * Columns:
 *   season       – MLB season year (PK)
 *   lg_woba      – league-average wOBA
 *   woba_scale   – wOBA scaling factor (typically 1.15–1.55)
 *   w_bb         – linear weight for unintentional walks
 *   w_hbp        – linear weight for hit-by-pitch
 *   w_1b         – linear weight for singles
 *   w_2b         – linear weight for doubles
 *   w_3b         – linear weight for triples
 *   w_hr         – linear weight for home runs
 *   run_sb       – run value per stolen base
 *   run_cs       – run value per caught stealing
 *   r_pa         – league runs per plate appearance
 *   rpw          – runs per win
 *   c_fip        – FIP constant (included for completeness)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.woba_season_weights (
      season   INTEGER PRIMARY KEY,
      lg_woba  NUMERIC(5,3) NOT NULL,
      woba_scale NUMERIC(5,3) NOT NULL,
      w_bb     NUMERIC(5,3) NOT NULL,
      w_hbp    NUMERIC(5,3) NOT NULL,
      w_1b     NUMERIC(5,3) NOT NULL,
      w_2b     NUMERIC(5,3) NOT NULL,
      w_3b     NUMERIC(5,3) NOT NULL,
      w_hr     NUMERIC(5,3) NOT NULL,
      run_sb   NUMERIC(5,3) NOT NULL,
      run_cs   NUMERIC(6,3) NOT NULL,
      r_pa     NUMERIC(5,3) NOT NULL,
      rpw      NUMERIC(6,3) NOT NULL,
      c_fip    NUMERIC(5,3) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_woba_season_weights_season
    ON public.woba_season_weights (season)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS public.woba_season_weights CASCADE`);
};
