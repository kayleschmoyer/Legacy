import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add a distinct MLB-season count to career_batting (LS-10552)
 *
 * The draft board's min-career-seasons eligibility rule
 * (`careerSeasonsCondition` in lib/db-client/src/lib/DraftUtils.ts) counted a
 * player's distinct AL/NL batting seasons with a correlated
 * `COUNT(DISTINCT season)` subquery against season_batting — one index scan +
 * sort per candidate player (~23.6k loops, ~107k buffer hits) on every
 * draft-pool, draft-ADP, waiver and eligibility-preview query.
 *
 * career_batting already aggregates exactly that row set (season_batting
 * WHERE lg_id IN ('AL', 'NL') GROUP BY player_id), so the count is added here
 * as `seasons` and the rule becomes a plain anti-join, the same shape as the
 * min-career-games rule on career_batting.g.
 *
 * Rebuilt in the same pattern as 20260615_120000_add_dwar_to_batting_stats:
 * drop dependents first, recreate the view, recreate the dependents. The
 * view is refreshed by the stats pipeline alongside g, so seasons stays
 * consistent with the games count the same rule set already reads.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // Recreate career_batting with the new seasons column
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
           END AS total_war,
           count(DISTINCT sb.season)::integer AS seasons
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

  // Recreate player_eligible_positions (depends on career_batting)
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
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // Restore career_batting without the seasons column
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

  // Recreate player_eligible_positions (depends on career_batting)
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
