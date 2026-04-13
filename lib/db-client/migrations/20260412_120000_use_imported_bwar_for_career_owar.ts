import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Use imported BR bwar for career_batting offensive_war (LS-3136)
 *
 * Problem:
 * The career_batting materialized view computed offensive_war from a multi-CTE
 * wOBA/park-factor/positional-adjustment formula that intentionally deviated
 * from Baseball Reference's methodology (omitting Rdp, Rbaser, and using
 * FanGraphs wOBA weights instead of BR's). Users reported that the displayed
 * oWAR values don't match the values imported from Baseball Reference.
 *
 * Fix:
 * The season_batting table already stores BR's per-season oWAR in the `bwar`
 * column (imported via bref-client's B_WAR mapping). This migration replaces
 * the formula-based computation with a simple sum of the imported bwar values,
 * ensuring the displayed oWAR exactly matches Baseball Reference.
 *
 * The complex CTE chain (league_rpa, combined_rpa, league_sb, woba weights
 * joins, park factor joins, positional adjustment joins) was only needed for
 * the formula — it is no longer required and has been removed.
 *
 * Dependency chain:
 *   player_eligible_positions depends on career_batting → must be dropped first
 *   and recreated after.
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Drop dependent materialized view
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);

  // 2. Drop the existing career_batting materialized view
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // 3. Recreate career_batting using imported bwar instead of formula
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

  // UNIQUE index on player_id — required for CONCURRENTLY refresh
  await db.execute(sql`
    CREATE UNIQUE INDEX idx_career_batting_player_id
      ON public.career_batting (player_id)
  `);

  // Index on g (total career games)
  await db.execute(sql`
    CREATE INDEX idx_career_batting_g
      ON public.career_batting (g)
  `);

  // 4. Recreate player_eligible_positions
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

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop dependent views first
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);

  // Restore the formula-based career_batting materialized view
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.career_batting AS
    WITH league_rpa AS (
      SELECT sb.season,
             sb.lg_id,
             sum(sb.r)::numeric / NULLIF(sum(sb.pa), 0)::numeric AS lg_r_per_pa
        FROM season_batting sb
       WHERE sb.lg_id::text = ANY (ARRAY['AL'::character varying, 'NL'::character varying]::text[])
       GROUP BY sb.season, sb.lg_id
    ), combined_rpa AS (
      SELECT sb.season,
             sum(sb.r)::numeric / NULLIF(sum(sb.pa), 0)::numeric AS mlb_r_per_pa
        FROM season_batting sb
       WHERE sb.lg_id::text = ANY (ARRAY['AL'::character varying, 'NL'::character varying]::text[])
       GROUP BY sb.season
    ), league_sb AS (
      SELECT sb.season,
             sb.lg_id,
             (sum(sb.sb)::numeric * w.run_sb + sum(sb.cs)::numeric * w.run_cs) /
               NULLIF(sum(GREATEST(sb.h - sb.doubles - sb.triples - sb.hr, 0) + sb.bb + COALESCE(sb.hbp, 0) - COALESCE(sb.ibb, 0)), 0)::numeric AS lgwsb
        FROM season_batting sb
        JOIN woba_season_weights w ON w.season = sb.season
       WHERE sb.lg_id::text = ANY (ARRAY['AL'::character varying, 'NL'::character varying]::text[])
       GROUP BY sb.season, sb.lg_id, w.run_sb, w.run_cs
    ), team_season_batting AS (
      SELECT sb.player_id,
             sb.season,
             sb.team,
             sb.lg_id,
             sum(sb.g)::integer AS g,
             sum(sb.pa)::integer AS pa,
             sum(sb.ab)::integer AS ab,
             sum(sb.r)::integer AS r,
             sum(sb.h)::integer AS h,
             sum(sb.doubles)::integer AS doubles,
             sum(sb.triples)::integer AS triples,
             sum(sb.hr)::integer AS hr,
             sum(sb.rbi)::integer AS rbi,
             sum(sb.sb)::integer AS sb_count,
             sum(sb.cs)::integer AS cs_count,
             sum(sb.bb)::integer AS bb,
             sum(sb.so)::integer AS so,
             sum(sb.tb)::integer AS tb,
             sum(sb.gidp)::integer AS gidp,
             sum(sb.hbp)::integer AS hbp,
             sum(sb.sh)::integer AS sh,
             sum(sb.ibb)::integer AS ibb
        FROM season_batting sb
       WHERE sb.lg_id::text = ANY (ARRAY['AL'::character varying, 'NL'::character varying]::text[])
       GROUP BY sb.player_id, sb.season, sb.team, sb.lg_id
    ), season_totals AS (
      SELECT tsb.player_id,
             tsb.season,
             tsb.lg_id,
             sum(tsb.g)::integer AS g,
             sum(tsb.pa)::integer AS pa,
             sum(tsb.ab)::integer AS ab,
             sum(tsb.r)::integer AS r,
             sum(tsb.h)::integer AS h,
             sum(tsb.doubles)::integer AS doubles,
             sum(tsb.triples)::integer AS triples,
             sum(tsb.hr)::integer AS hr,
             sum(tsb.rbi)::integer AS rbi,
             sum(tsb.sb_count)::integer AS sb_count,
             sum(tsb.cs_count)::integer AS cs_count,
             sum(tsb.bb)::integer AS bb,
             sum(tsb.so)::integer AS so,
             sum(tsb.tb)::integer AS tb,
             sum(tsb.gidp)::integer AS gidp,
             sum(tsb.hbp)::integer AS hbp,
             sum(tsb.sh)::integer AS sh,
             sum(tsb.ibb)::integer AS ibb,
             COALESCE(
               sum(tsb.pa * COALESCE(pf.bpf, 100))::numeric / NULLIF(sum(tsb.pa), 0)::numeric,
               100.0
             ) AS weighted_pf,
             COALESCE(
               sum((COALESCE(cr.mlb_r_per_pa, 0::numeric) - COALESCE(lr.lg_r_per_pa, 0::numeric)) * tsb.pa::numeric),
               0::numeric
             ) AS league_adj_runs
        FROM team_season_batting tsb
        LEFT JOIN park_factors pf ON pf.season = tsb.season AND pf.team::text = tsb.team::text
        LEFT JOIN league_rpa lr ON lr.season = tsb.season AND lr.lg_id::text = tsb.lg_id::text
        LEFT JOIN combined_rpa cr ON cr.season = tsb.season
       GROUP BY tsb.player_id, tsb.season, tsb.lg_id
    ), season_war AS (
      SELECT st.player_id,
             st.season,
             st.g,
             st.pa,
             st.ab,
             st.r,
             st.h,
             st.doubles,
             st.triples,
             st.hr,
             st.rbi,
             st.sb_count AS sb,
             st.cs_count AS cs,
             st.bb,
             st.so,
             st.tb,
             st.gidp,
             st.hbp,
             st.sh,
             st.ibb,
             CASE
               WHEN st.pa >= 1 AND (st.pa - COALESCE(st.ibb, 0)) > 0 AND w.season IS NOT NULL THEN
                 ((((w.w_bb * GREATEST(0, st.bb - COALESCE(st.ibb, 0))::numeric
                   + w.w_hbp * COALESCE(st.hbp, 0)::numeric
                   + w.w_1b * GREATEST(0, st.h - st.doubles - st.triples - st.hr)::numeric
                   + w.w_2b * st.doubles::numeric
                   + w.w_3b * st.triples::numeric
                   + w.w_hr * st.hr::numeric
                  ) / NULLIF(st.pa - COALESCE(st.ibb, 0), 0)::numeric - w.lg_woba) / w.woba_scale
                   * st.pa::numeric
                   + (1.0 - st.weighted_pf / 100.0) / 2.0 * st.pa::numeric * w.r_pa
                   + st.league_adj_runs
                   + COALESCE(st.sb_count, 0)::numeric * w.run_sb
                   + COALESCE(st.cs_count, 0)::numeric * w.run_cs
                   - COALESCE(ls.lgwsb, 0::numeric) * (GREATEST(st.h - st.doubles - st.triples - st.hr, 0) + st.bb + COALESCE(st.hbp, 0) - COALESCE(st.ibb, 0))::numeric
                 )::double precision
                 + COALESCE((
                     SELECT sum(
                       CASE sf.pos
                         WHEN 'C'::text   THEN pa.c
                         WHEN '1B'::text  THEN pa.first_base
                         WHEN '2B'::text  THEN pa.second_base
                         WHEN '3B'::text  THEN pa.third_base
                         WHEN 'SS'::text  THEN pa.ss
                         WHEN 'LF'::text  THEN pa.lf
                         WHEN 'RF'::text  THEN pa.rf
                         WHEN 'CF'::text  THEN pa.cf
                         WHEN 'OF'::text  THEN pa.lf
                         WHEN 'DH'::text  THEN pa.dh
                         ELSE 0::numeric
                       END::double precision
                       * COALESCE(sf.inn_def, (sf.g::numeric * 9.0)::double precision)
                       / 1350.0::double precision
                     ) AS sum
                       FROM season_fielding sf
                      WHERE sf.player_id = st.player_id
                        AND sf.season = st.season
                        AND (sf.lg_id::text = ANY (ARRAY['AL'::character varying, 'NL'::character varying]::text[]))
                        AND (sf.pos::text <> 'OF'::text OR NOT (EXISTS (
                          SELECT 1
                            FROM season_fielding sf2
                           WHERE sf2.player_id = sf.player_id
                             AND sf2.season = sf.season
                             AND (sf2.pos::text = ANY (ARRAY['LF'::character varying, 'RF'::character varying, 'CF'::character varying]::text[]))
                             AND (sf2.lg_id::text = ANY (ARRAY['AL'::character varying, 'NL'::character varying]::text[]))
                        )))
                   ), 0::double precision)
                 + (20.5 * (st.pa::numeric / 600.0))::double precision
                ) / w.rpw::double precision
               ELSE 0::double precision
             END AS season_owar
        FROM season_totals st
        LEFT JOIN woba_season_weights w ON w.season = st.season
        LEFT JOIN positional_adjustments pa ON pa.season = st.season
        LEFT JOIN league_sb ls ON ls.season = st.season AND ls.lg_id::text = st.lg_id::text
    )
    SELECT player_id,
           sum(g)   AS g,
           sum(pa)  AS pa,
           sum(ab)  AS ab,
           sum(r)   AS r,
           sum(h)   AS h,
           sum(doubles)  AS doubles,
           sum(triples)  AS triples,
           sum(hr)  AS hr,
           sum(rbi) AS rbi,
           sum(sb)  AS sb,
           sum(cs)  AS cs,
           sum(bb)  AS bb,
           sum(so)  AS so,
           sum(tb)  AS tb,
           sum(gidp) AS gidp,
           sum(hbp) AS hbp,
           sum(sh)  AS sh,
           sum(ibb) AS ibb,
           CASE
             WHEN sum(pa) >= 10 THEN round(sum(season_owar)::numeric, 1)
             ELSE NULL::numeric
           END AS offensive_war
      FROM season_war
     GROUP BY player_id
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

  // Recreate player_eligible_positions
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
