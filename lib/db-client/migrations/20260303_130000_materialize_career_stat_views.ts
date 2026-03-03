import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Materialize career_batting, career_fielding, career_pitching views (LS-433)
 *
 * Replaces 20260303_120000_materialize_career_stat_views.ts which had a syntax error:
 * missing outer opening paren in the WAR CASE THEN expression (LS-451).
 *
 * Purpose:
 * - career_batting, career_fielding, career_pitching are plain VIEWs that re-execute
 *   expensive multi-CTE aggregations (WAR, wOBA, park-factor adjustments) on every query.
 * - pg_stat_statements shows mean latencies of 430ms–5,588ms for these views with
 *   >50% of total database execution time attributable to them.
 * - Converting to MATERIALIZED VIEWs with a unique index on player_id eliminates the
 *   repeated aggregation — reads become simple indexed lookups on pre-computed data.
 * - Also resolves LS-436: career_batting.g threshold queries benefit from the new (g) index.
 *
 * Dependency chain:
 *   season_batting/fielding/pitching (base tables)
 *     → career_batting / career_fielding / career_pitching  ← materializing these
 *       → player_eligible_positions (already materialized, LS-369)
 *
 * player_eligible_positions must be dropped and recreated because it was created when
 * career_batting and career_pitching were plain VIEWs; PostgreSQL tracks these
 * dependencies in pg_depend and will refuse DROP VIEW ... CASCADE otherwise.
 *
 * Changes:
 * - Drop MATERIALIZED VIEW player_eligible_positions (recreated at end)
 * - Drop VIEW career_batting CASCADE
 * - Drop VIEW career_fielding CASCADE
 * - Drop VIEW career_pitching CASCADE
 * - Create MATERIALIZED VIEW career_batting  + UNIQUE INDEX (player_id) + INDEX (g)
 * - Create MATERIALIZED VIEW career_fielding + UNIQUE INDEX (player_id)
 * - Create MATERIALIZED VIEW career_pitching + UNIQUE INDEX (player_id)
 * - Recreate MATERIALIZED VIEW player_eligible_positions + its two indexes
 * - VACUUM ANALYZE the underlying base tables
 *
 * Refresh strategy:
 * - refreshCareerStats() calls REFRESH MATERIALIZED VIEW CONCURRENTLY on all three,
 *   then refreshPlayerEligiblePositions() refreshes player_eligible_positions.
 * - Both are called once per SQS batch in stats-lambda/load-career.ts.
 * - CONCURRENTLY keeps reads available during refresh; requires the unique indexes below.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Drop dependent materialized view first (player_eligible_positions depends on
  //    career_batting and career_pitching via its stored query plan).
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);

  // 2. Drop the three plain views (CASCADE in case any other objects depend on them).
  await db.execute(sql`
    DROP VIEW IF EXISTS public.career_batting CASCADE
  `);
  await db.execute(sql`
    DROP VIEW IF EXISTS public.career_fielding CASCADE
  `);
  await db.execute(sql`
    DROP VIEW IF EXISTS public.career_pitching CASCADE
  `);

  // Also drop any materialized views that might exist from a prior failed run
  // of the old 20260303_120000 migration (idempotent).
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_fielding
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_pitching
  `);

  // ---------------------------------------------------------------------------
  // 3. career_batting — complex WAR/wOBA/park-factor CTE aggregation
  // ---------------------------------------------------------------------------
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

  // UNIQUE index on player_id — required for CONCURRENTLY refresh
  await db.execute(sql`
    CREATE UNIQUE INDEX idx_career_batting_player_id
      ON public.career_batting (player_id)
  `);

  // Index on g (total career games) — resolves LS-436 eligibility-threshold queries
  await db.execute(sql`
    CREATE INDEX idx_career_batting_g
      ON public.career_batting (g)
  `);

  // ---------------------------------------------------------------------------
  // 4. career_fielding — per-player career totals + positions_played JSON
  // ---------------------------------------------------------------------------
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.career_fielding AS
    SELECT cf.player_id,
           cf.g,
           cf.gs,
           cf.cg,
           cf.inn_def,
           cf.chances,
           cf.po,
           cf.a,
           cf.e_def,
           cf.dp_def,
           cf.sb,
           cf.cs,
           cf.pickoffs,
           cf.wp,
           NULL::text AS pos,
           COALESCE(
             jsonb_object_agg(
               pos_agg.pos,
               jsonb_build_object('games', pos_agg.g, 'gamesStarted', pos_agg.gs, 'position', pos_agg.pos)
             ) FILTER (WHERE pos_agg.pos IS NOT NULL),
             '{}'::jsonb
           ) AS positions_played
      FROM (
             SELECT season_fielding.player_id,
                    sum(season_fielding.g)        AS g,
                    sum(season_fielding.gs)       AS gs,
                    sum(season_fielding.cg)       AS cg,
                    sum(season_fielding.inn_def)  AS inn_def,
                    sum(season_fielding.chances)  AS chances,
                    sum(season_fielding.po)       AS po,
                    sum(season_fielding.a)        AS a,
                    sum(season_fielding.e_def)    AS e_def,
                    sum(season_fielding.dp_def)   AS dp_def,
                    sum(season_fielding.sb)       AS sb,
                    sum(season_fielding.cs)       AS cs,
                    sum(season_fielding.pickoffs) AS pickoffs,
                    sum(season_fielding.wp)       AS wp
               FROM season_fielding
              WHERE (( SELECT count(1) AS count
                         FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
                        WHERE season_fielding.lg_id::text = ANY (ARRAY['AL'::character varying::text, 'NL'::character varying::text]))) > 0
              GROUP BY season_fielding.player_id
           ) cf
      LEFT JOIN (
             SELECT season_fielding.player_id,
                    season_fielding.pos,
                    sum(season_fielding.g)  AS g,
                    sum(season_fielding.gs) AS gs
               FROM season_fielding
              WHERE (( SELECT count(1) AS count
                         FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
                        WHERE season_fielding.lg_id::text = ANY (ARRAY['AL'::character varying::text, 'NL'::character varying::text]))) > 0
              GROUP BY season_fielding.player_id, season_fielding.pos
           ) pos_agg ON cf.player_id = pos_agg.player_id
     GROUP BY cf.player_id, cf.g, cf.gs, cf.cg, cf.inn_def, cf.chances,
              cf.po, cf.a, cf.e_def, cf.dp_def, cf.sb, cf.cs, cf.pickoffs, cf.wp
    WITH DATA
  `);

  // UNIQUE index on player_id — required for CONCURRENTLY refresh
  await db.execute(sql`
    CREATE UNIQUE INDEX idx_career_fielding_player_id
      ON public.career_fielding (player_id)
  `);

  // ---------------------------------------------------------------------------
  // 5. career_pitching — per-player career totals + ERA
  // ---------------------------------------------------------------------------
  await db.execute(sql`
    CREATE MATERIALIZED VIEW public.career_pitching AS
    SELECT player_id, w, l, g, gs, gf, cg, sho, sv,
           h, r, er, hr, bb, ibb, so, hbp, bk, wp,
           batters_faced, outs_recorded, out_rate, era
      FROM (
             SELECT season_pitching.player_id,
                    sum(season_pitching.w)              AS w,
                    sum(season_pitching.l)              AS l,
                    sum(season_pitching.g)              AS g,
                    sum(season_pitching.gs)             AS gs,
                    sum(season_pitching.gf)             AS gf,
                    sum(season_pitching.cg)             AS cg,
                    sum(season_pitching.sho)            AS sho,
                    sum(season_pitching.sv)             AS sv,
                    sum(season_pitching.h)              AS h,
                    sum(season_pitching.r)              AS r,
                    sum(season_pitching.er)             AS er,
                    sum(season_pitching.hr)             AS hr,
                    sum(season_pitching.bb)             AS bb,
                    sum(season_pitching.ibb)            AS ibb,
                    sum(season_pitching.so)             AS so,
                    sum(season_pitching.hbp)            AS hbp,
                    sum(season_pitching.bk)             AS bk,
                    sum(season_pitching.wp)             AS wp,
                    sum(season_pitching.batters_faced)  AS batters_faced,
                    sum(season_pitching.outs_recorded)  AS outs_recorded,
                    sum(season_pitching.outs_recorded) /
                      CASE sum(season_pitching.batters_faced)
                        WHEN 0 THEN 1::bigint
                        ELSE sum(season_pitching.batters_faced)
                      END                              AS out_rate,
                    sum(season_pitching.er)::numeric /
                      CASE sum(season_pitching.outs_recorded)
                        WHEN 0 THEN 1::bigint::numeric
                        ELSE sum(season_pitching.outs_recorded)::numeric / 27.0
                      END                              AS era
               FROM season_pitching
              WHERE (( SELECT count(1) AS count
                         FROM regexp_split_to_table(season_pitching.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
                        WHERE season_pitching.lg_id::text = ANY (ARRAY['AL'::character varying::text, 'NL'::character varying::text]))) > 0
              GROUP BY season_pitching.player_id
           ) unnamed_subquery
    WITH DATA
  `);

  // UNIQUE index on player_id — required for CONCURRENTLY refresh
  await db.execute(sql`
    CREATE UNIQUE INDEX idx_career_pitching_player_id
      ON public.career_pitching (player_id)
  `);

  // ---------------------------------------------------------------------------
  // 6. Recreate player_eligible_positions (same SQL as migration 20260302_120000)
  // ---------------------------------------------------------------------------
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
  `);

  await db.execute(sql`
    CREATE INDEX idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id)
  `);

  // 7. Refresh statistics on base tables for the query planner
  await db.execute(sql`
    VACUUM ANALYZE public.season_batting, public.season_fielding, public.season_pitching
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop all materialized views (player_eligible_positions first due to dependency)
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_batting
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_fielding
  `);
  await db.execute(sql`
    DROP MATERIALIZED VIEW IF EXISTS public.career_pitching
  `);

  // Restore plain views (identical SQL to originals)
  await db.execute(sql`
    CREATE VIEW public.career_batting AS
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
  `);

  await db.execute(sql`
    CREATE VIEW public.career_fielding AS
    SELECT cf.player_id,
           cf.g, cf.gs, cf.cg, cf.inn_def, cf.chances,
           cf.po, cf.a, cf.e_def, cf.dp_def,
           cf.sb, cf.cs, cf.pickoffs, cf.wp,
           NULL::text AS pos,
           COALESCE(
             jsonb_object_agg(
               pos_agg.pos,
               jsonb_build_object('games', pos_agg.g, 'gamesStarted', pos_agg.gs, 'position', pos_agg.pos)
             ) FILTER (WHERE pos_agg.pos IS NOT NULL),
             '{}'::jsonb
           ) AS positions_played
      FROM (
             SELECT season_fielding.player_id,
                    sum(season_fielding.g)        AS g,
                    sum(season_fielding.gs)       AS gs,
                    sum(season_fielding.cg)       AS cg,
                    sum(season_fielding.inn_def)  AS inn_def,
                    sum(season_fielding.chances)  AS chances,
                    sum(season_fielding.po)       AS po,
                    sum(season_fielding.a)        AS a,
                    sum(season_fielding.e_def)    AS e_def,
                    sum(season_fielding.dp_def)   AS dp_def,
                    sum(season_fielding.sb)       AS sb,
                    sum(season_fielding.cs)       AS cs,
                    sum(season_fielding.pickoffs) AS pickoffs,
                    sum(season_fielding.wp)       AS wp
               FROM season_fielding
              WHERE (( SELECT count(1) AS count
                         FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
                        WHERE season_fielding.lg_id::text = ANY (ARRAY['AL'::character varying::text, 'NL'::character varying::text]))) > 0
              GROUP BY season_fielding.player_id
           ) cf
      LEFT JOIN (
             SELECT season_fielding.player_id,
                    season_fielding.pos,
                    sum(season_fielding.g)  AS g,
                    sum(season_fielding.gs) AS gs
               FROM season_fielding
              WHERE (( SELECT count(1) AS count
                         FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
                        WHERE season_fielding.lg_id::text = ANY (ARRAY['AL'::character varying::text, 'NL'::character varying::text]))) > 0
              GROUP BY season_fielding.player_id, season_fielding.pos
           ) pos_agg ON cf.player_id = pos_agg.player_id
     GROUP BY cf.player_id, cf.g, cf.gs, cf.cg, cf.inn_def, cf.chances,
              cf.po, cf.a, cf.e_def, cf.dp_def, cf.sb, cf.cs, cf.pickoffs, cf.wp
  `);

  await db.execute(sql`
    CREATE VIEW public.career_pitching AS
    SELECT player_id, w, l, g, gs, gf, cg, sho, sv,
           h, r, er, hr, bb, ibb, so, hbp, bk, wp,
           batters_faced, outs_recorded, out_rate, era
      FROM (
             SELECT season_pitching.player_id,
                    sum(season_pitching.w)              AS w,
                    sum(season_pitching.l)              AS l,
                    sum(season_pitching.g)              AS g,
                    sum(season_pitching.gs)             AS gs,
                    sum(season_pitching.gf)             AS gf,
                    sum(season_pitching.cg)             AS cg,
                    sum(season_pitching.sho)            AS sho,
                    sum(season_pitching.sv)             AS sv,
                    sum(season_pitching.h)              AS h,
                    sum(season_pitching.r)              AS r,
                    sum(season_pitching.er)             AS er,
                    sum(season_pitching.hr)             AS hr,
                    sum(season_pitching.bb)             AS bb,
                    sum(season_pitching.ibb)            AS ibb,
                    sum(season_pitching.so)             AS so,
                    sum(season_pitching.hbp)            AS hbp,
                    sum(season_pitching.bk)             AS bk,
                    sum(season_pitching.wp)             AS wp,
                    sum(season_pitching.batters_faced)  AS batters_faced,
                    sum(season_pitching.outs_recorded)  AS outs_recorded,
                    sum(season_pitching.outs_recorded) /
                      CASE sum(season_pitching.batters_faced)
                        WHEN 0 THEN 1::bigint
                        ELSE sum(season_pitching.batters_faced)
                      END                              AS out_rate,
                    sum(season_pitching.er)::numeric /
                      CASE sum(season_pitching.outs_recorded)
                        WHEN 0 THEN 1::bigint::numeric
                        ELSE sum(season_pitching.outs_recorded)::numeric / 27.0
                      END                              AS era
               FROM season_pitching
              WHERE (( SELECT count(1) AS count
                         FROM regexp_split_to_table(season_pitching.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
                        WHERE season_pitching.lg_id::text = ANY (ARRAY['AL'::character varying::text, 'NL'::character varying::text]))) > 0
              GROUP BY season_pitching.player_id
           ) unnamed_subquery
  `);

  // Restore player_eligible_positions materialized view and its indexes
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
  `);

  await db.execute(sql`
    CREATE INDEX idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id)
  `);
};
