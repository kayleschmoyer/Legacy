import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add sacrifice flies (sf) to career_batting (LS-10846)
 *
 * On-base percentage is (H + BB + HBP) / (AB + BB + HBP + SF). career_batting
 * had no sf column, so the career OBP sort (TypeSafeQueryBuilder) and the
 * CareerBatting.onBasePercentage resolver both put SH in the denominator
 * instead, and a PA-based client fallback disagreed with both. Exposing sf
 * lets every path share the one canonical, NULL-safe formula in
 * lib/db-client/src/lib/stats/on-base-percentage.ts.
 *
 * season_batting.sf is already an integer column (SF is NULL for seasons
 * before it was tracked; the shared formula counts NULL as 0, as
 * Baseball-Reference does). PA - SH was rejected as a denominator because
 * ~6.9k AL/NL season rows have PA > AB + BB + HBP + SH + SF (catcher's
 * interference etc.), which skews OBP.
 *
 * Rebuilt in the same pattern as 20261004_120000_add_seasons_to_career_batting:
 * drop dependents first, recreate the view, recreate the dependents.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // Recreate career_batting with the new sf column
  await db.execute(`
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
           END AS total_war,
           count(DISTINCT sb.season)::integer AS seasons,
           sum(sb.sf)::bigint      AS sf
      FROM season_batting sb
     WHERE sb.lg_id::text = ANY (ARRAY['AL'::text, 'NL'::text])
     GROUP BY sb.player_id
    WITH DATA
  `);

  // Unique index required for CONCURRENTLY refresh
  await db.execute(`
    CREATE UNIQUE INDEX idx_career_batting_player_id
      ON public.career_batting (player_id)
  `);

  await db.execute(`
    CREATE INDEX idx_career_batting_g
      ON public.career_batting (g)
  `);

  // Recreate player_eligible_positions (depends on career_batting)
  await db.execute(`
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

  await db.execute(`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
      INCLUDE (games)
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // Restore career_batting without the sf column
  await db.execute(`
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
           END AS total_war,
           count(DISTINCT sb.season)::integer AS seasons
      FROM season_batting sb
     WHERE sb.lg_id::text = ANY (ARRAY['AL'::text, 'NL'::text])
     GROUP BY sb.player_id
    WITH DATA
  `);

  // Unique index required for CONCURRENTLY refresh
  await db.execute(`
    CREATE UNIQUE INDEX idx_career_batting_player_id
      ON public.career_batting (player_id)
  `);

  await db.execute(`
    CREATE INDEX idx_career_batting_g
      ON public.career_batting (g)
  `);

  // Recreate player_eligible_positions (depends on career_batting)
  await db.execute(`
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

  await db.execute(`
    CREATE UNIQUE INDEX player_eligible_positions_player_id_position_idx
      ON public.player_eligible_positions (player_id, position)
      INCLUDE (games)
  `);
};
