import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add defensive WAR (dWAR) and total WAR to batting stats (LS-7007)
 *
 * Adds `dwar` to `season_batting` so the bref-client import pipeline can
 * populate Baseball Reference's per-season defensive WAR values. Rebuilds
 * `career_batting` to surface two new aggregated columns:
 *
 *   defensive_war  — career dWAR (null until bref-client imports dwar data)
 *   total_war      — career WAR = oWAR + dWAR (null until both are available)
 *
 * The career_batting materialized view is rebuilt in the same pattern as
 * 20260412_120000_use_imported_bwar_for_career_owar: drop dependents first,
 * recreate the view, recreate the dependents.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Add dwar column to season_batting
  await db.execute(sql`
    ALTER TABLE public.season_batting
    ADD COLUMN IF NOT EXISTS dwar double precision
  `);

  // 2. Drop dependent materialized view
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);

  // 3. Drop career_batting
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // 4. Recreate career_batting with defensive_war and total_war
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.career_batting AS
    SELECT sb.player_id,
           sum(sb.g)::bigint       AS g,
           sum(sb.pa)::bigint      AS pa,
           sum(sb.ab)::bigint      AS ab,
           sum(sb.r)::bigint       AS r,
           sum(sb.h)::bigint       AS h,
           sum(sb.doubles)::bigint AS doubles,
           sum(sb.triples)::bigint AS triples,
           sum(sb.hr)::bigint      AS hr,
           sum(sb.rbi)::bigint     AS rbi,
           sum(sb.sb)::bigint      AS sb,
           sum(sb.cs)::bigint      AS cs,
           sum(sb.bb)::bigint      AS bb,
           sum(sb.so)::bigint      AS so,
           sum(sb.tb)::bigint      AS tb,
           sum(sb.gidp)::bigint    AS gidp,
           sum(sb.hbp)::bigint     AS hbp,
           sum(sb.sh)::bigint      AS sh,
           sum(sb.ibb)::bigint     AS ibb,
           CASE
             WHEN sum(sb.pa) >= 10 THEN round(sum(sb.bwar)::numeric, 1)
             ELSE NULL::numeric
           END AS offensive_war,
           CASE
             WHEN sum(sb.pa) >= 10 THEN round(sum(sb.dwar)::numeric, 1)
             ELSE NULL::numeric
           END AS defensive_war,
           CASE
             WHEN sum(sb.pa) >= 10
                  AND sum(sb.bwar) IS NOT NULL
                  AND sum(sb.dwar) IS NOT NULL
             THEN round((sum(sb.bwar) + sum(sb.dwar))::numeric, 1)
             ELSE NULL::numeric
           END AS total_war
      FROM season_batting sb
     WHERE sb.lg_id::text = ANY (ARRAY['AL'::text, 'NL'::text])
     GROUP BY sb.player_id
    WITH DATA
  `);

  // Unique index required for CONCURRENTLY refresh
  await db.execute(sql`
    CREATE UNIQUE INDEX idx_career_batting_player_id
      ON public.career_batting (player_id)
  `);

  await db.execute(sql`
    CREATE INDEX idx_career_batting_g
      ON public.career_batting (g)
  `);

  // 5. Recreate player_eligible_positions
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.player_eligible_positions AS
    SELECT cfbp.player_id,
           cfbp.pos AS position,
           cfbp.g   AS games
      FROM career_fielding_by_position cfbp
      JOIN career_batting cb ON cb.player_id = cfbp.player_id
     WHERE cfbp.pos != 'P'
       AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id,
           'SP' AS position,
           gs   AS games
      FROM career_pitching
     WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id,
           'RP'     AS position,
           (g - gs) AS games
      FROM career_pitching
     WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
     ORDER BY player_id, games DESC
    WITH DATA
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
      INCLUDE (games)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Drop dependents
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // 2. Restore career_batting without dwar columns
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.career_batting AS
    SELECT sb.player_id,
           sum(sb.g)::bigint       AS g,
           sum(sb.pa)::bigint      AS pa,
           sum(sb.ab)::bigint      AS ab,
           sum(sb.r)::bigint       AS r,
           sum(sb.h)::bigint       AS h,
           sum(sb.doubles)::bigint AS doubles,
           sum(sb.triples)::bigint AS triples,
           sum(sb.hr)::bigint      AS hr,
           sum(sb.rbi)::bigint     AS rbi,
           sum(sb.sb)::bigint      AS sb,
           sum(sb.cs)::bigint      AS cs,
           sum(sb.bb)::bigint      AS bb,
           sum(sb.so)::bigint      AS so,
           sum(sb.tb)::bigint      AS tb,
           sum(sb.gidp)::bigint    AS gidp,
           sum(sb.hbp)::bigint     AS hbp,
           sum(sb.sh)::bigint      AS sh,
           sum(sb.ibb)::bigint     AS ibb,
           CASE
             WHEN sum(sb.pa) >= 10 THEN round(sum(sb.bwar)::numeric, 1)
             ELSE NULL::numeric
           END AS offensive_war
      FROM season_batting sb
     WHERE sb.lg_id::text = ANY (ARRAY['AL'::text, 'NL'::text])
     GROUP BY sb.player_id
    WITH DATA
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX idx_career_batting_player_id
      ON public.career_batting (player_id)
  `);

  await db.execute(sql`
    CREATE INDEX idx_career_batting_g
      ON public.career_batting (g)
  `);

  // 3. Recreate player_eligible_positions
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.player_eligible_positions AS
    SELECT cfbp.player_id,
           cfbp.pos AS position,
           cfbp.g   AS games
      FROM career_fielding_by_position cfbp
      JOIN career_batting cb ON cb.player_id = cfbp.player_id
     WHERE cfbp.pos != 'P'
       AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id,
           'SP' AS position,
           gs   AS games
      FROM career_pitching
     WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id,
           'RP'     AS position,
           (g - gs) AS games
      FROM career_pitching
     WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
     ORDER BY player_id, games DESC
    WITH DATA
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
      INCLUDE (games)
  `);

  // 4. Remove dwar from season_batting
  await db.execute(sql`
    ALTER TABLE public.season_batting DROP COLUMN IF EXISTS dwar
  `);
};
