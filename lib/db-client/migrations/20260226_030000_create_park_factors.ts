import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create park_factors table
 *
 * Purpose:
 * - Stores FanGraphs park factors per team per season
 * - The "basic_5yr" field is the 5-year average park factor (runs, 100 = neutral)
 *   which is the standard park factor used in WAR calculations
 * - Used by the oWAR formula to park-adjust batting runs
 *
 * Source: https://www.fangraphs.com/tools/guts?type=pf
 *
 * Columns:
 *   season       – MLB season year
 *   team         – Team abbreviation matching season_batting.team (e.g., NYY, BOS)
 *   basic_5yr    – 5-year average park factor (runs), 100 = neutral
 *   basic_3yr    – 3-year average park factor (runs)
 *   basic_1yr    – Single-year park factor (runs)
 *   fg_team_name – FanGraphs team name for reference (e.g., "Yankees")
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS public.park_factors (
      season       INTEGER     NOT NULL,
      team         VARCHAR(10) NOT NULL,
      basic_5yr    NUMERIC(8,3) NOT NULL,
      basic_3yr    NUMERIC(8,3),
      basic_1yr    NUMERIC(8,3),
      fg_team_name VARCHAR(50),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (season, team)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_park_factors_season
    ON public.park_factors (season)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_park_factors_team
    ON public.park_factors (team)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS public.park_factors CASCADE`);
};
