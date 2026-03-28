import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add FIP-based pitching lWAR to career_pitching materialized view
 *
 * Purpose:
 * - Adds a `pitching_war` computed column to the career_pitching materialized view,
 *   mirroring the offensive_war column on career_batting.
 * - Uses FIP (Fielding Independent Pitching) as the run-estimation model,
 *   with season-specific cFIP constants and RPW from woba_season_weights.
 *
 * Formula per season:
 *   FIP = (13*HR + 3*(BB+HBP) - 2*K) / IP + cFIP
 *   Runs above average = (lgERA - FIP) / 9 * IP
 *   Replacement runs = 20 * (IP / 200)  (matching the 20-per-600PA hitter analog)
 *   Season pWAR = (runs_above_avg + replacement_runs) / RPW
 *
 * Career pWAR = SUM(season_pWAR), rounded to 1 decimal. NULL if < 3 career IP.
 *
 * Note: career_pitching is a MATERIALIZED VIEW (since LS-303 migration 20260303_130000).
 * player_eligible_positions depends on it, so we must drop/recreate both.
 *
 * Requires:
 * - woba_season_weights table (c_fip, rpw columns)
 *
 * (LS-1853)
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Drop dependent materialized view first
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);

  // 2. Drop career_pitching materialized view
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.career_pitching
  `);

  // 3. Recreate with pitching_war column
  await db.execute(`
    CREATE MATERIALIZED VIEW public.career_pitching AS
    WITH season_totals AS (
        SELECT
            sp.player_id,
            sp.season,
            SUM(sp.w)::int             AS w,
            SUM(sp.l)::int             AS l,
            SUM(sp.g)::int             AS g,
            SUM(sp.gs)::int            AS gs,
            SUM(sp.gf)::int            AS gf,
            SUM(sp.cg)::int            AS cg,
            SUM(sp.sho)::int           AS sho,
            SUM(sp.sv)::int            AS sv,
            SUM(sp.h)::int             AS h,
            SUM(sp.r)::int             AS r,
            SUM(sp.er)::int            AS er,
            SUM(sp.hr)::int            AS hr,
            SUM(sp.bb)::int            AS bb,
            SUM(sp.ibb)::int           AS ibb,
            SUM(sp.so)::int            AS so,
            SUM(sp.hbp)::int           AS hbp,
            SUM(sp.bk)::int            AS bk,
            SUM(sp.wp)::int            AS wp,
            SUM(sp.batters_faced)::int AS batters_faced,
            SUM(sp.outs_recorded)::int AS outs_recorded
        FROM season_pitching sp
        WHERE EXISTS (
            SELECT 1
            FROM regexp_split_to_table(sp.lg_id::text, ','::text) AS x(lg)
            WHERE x.lg = ANY (ARRAY['AL'::text, 'NL'::text])
        )
        GROUP BY sp.player_id, sp.season
    ),
    league_era AS (
        SELECT
            season,
            CASE WHEN SUM(outs_recorded) > 0
                THEN SUM(er)::numeric / (SUM(outs_recorded)::numeric / 27.0)
                ELSE NULL
            END AS lg_era
        FROM season_totals
        GROUP BY season
    ),
    season_war AS (
        SELECT
            st.*,
            CASE
                WHEN st.outs_recorded >= 3
                     AND w.season IS NOT NULL
                     AND le.lg_era IS NOT NULL
                THEN
                    (
                        -- FIP = (13*HR + 3*(BB+HBP) - 2*K) / IP + cFIP
                        -- runs_above_avg = (lgERA - FIP) / 9 * IP
                        (le.lg_era - (
                            (13.0 * st.hr
                             + 3.0 * (st.bb + COALESCE(st.hbp, 0))
                             - 2.0 * st.so
                            ) / (st.outs_recorded::numeric / 3.0)
                            + w.c_fip
                        )) / 9.0 * (st.outs_recorded::numeric / 3.0)
                        -- Replacement level: 20 runs per 200 IP
                        + 20.0 * ((st.outs_recorded::numeric / 3.0) / 200.0)
                    ) / w.rpw
                ELSE 0
            END AS season_pwar
        FROM season_totals st
        LEFT JOIN woba_season_weights w ON w.season = st.season
        LEFT JOIN league_era le ON le.season = st.season
    )
    SELECT
        player_id,
        SUM(w)             AS w,
        SUM(l)             AS l,
        SUM(g)             AS g,
        SUM(gs)            AS gs,
        SUM(gf)            AS gf,
        SUM(cg)            AS cg,
        SUM(sho)           AS sho,
        SUM(sv)            AS sv,
        SUM(h)             AS h,
        SUM(r)             AS r,
        SUM(er)            AS er,
        SUM(hr)            AS hr,
        SUM(bb)            AS bb,
        SUM(ibb)           AS ibb,
        SUM(so)            AS so,
        SUM(hbp)           AS hbp,
        SUM(bk)            AS bk,
        SUM(wp)            AS wp,
        SUM(batters_faced) AS batters_faced,
        SUM(outs_recorded) AS outs_recorded,
        SUM(outs_recorded) /
        CASE SUM(batters_faced)
            WHEN 0 THEN 1::bigint
            ELSE SUM(batters_faced)
        END AS out_rate,
        SUM(er)::numeric /
        CASE SUM(outs_recorded)
            WHEN 0 THEN 1::bigint::numeric
            ELSE SUM(outs_recorded)::numeric / 27.0
        END AS era,
        CASE
            WHEN SUM(outs_recorded) >= 9 THEN ROUND(SUM(season_pwar)::numeric, 1)
            ELSE NULL
        END AS pitching_war
    FROM season_war
    GROUP BY player_id
    WITH DATA
  `);

  // 4. Recreate unique index (required for CONCURRENTLY refresh)
  await db.execute(`
    CREATE UNIQUE INDEX idx_career_pitching_player_id
      ON public.career_pitching (player_id)
  `);

  // 5. Recreate player_eligible_positions (same SQL as 20260303_130000)
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
  `);

  await db.execute(`
    CREATE INDEX idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id)
  `);
};

/**
 * Down migration: restore career_pitching without pitching_war
 */
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop dependent view first
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.player_eligible_positions
  `);
  await db.execute(`
    DROP MATERIALIZED VIEW IF EXISTS public.career_pitching
  `);

  // Restore original materialized view without pitching_war
  await db.execute(`
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

  await db.execute(`
    CREATE UNIQUE INDEX idx_career_pitching_player_id
      ON public.career_pitching (player_id)
  `);

  // Recreate player_eligible_positions
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
  `);

  await db.execute(`
    CREATE INDEX idx_player_eligible_positions_player_id
      ON public.player_eligible_positions (player_id)
  `);
};
