import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Season-aware lWAR using woba_season_weights
 *
 * Purpose:
 * - Replaces the fixed-constant lWAR formula with season-specific linear weights
 * - Each season's wRAA, BsR, and RPW come from the woba_season_weights table
 *   (FanGraphs Guts! data)
 * - Positional adjustment is computed per-season from season_fielding
 * - Per-season lWAR is summed to produce career lWAR
 *
 * Key fix:
 * - Previous formula used fixed RPW = 10.0; actual RPW varies 8.1–19.0 by season
 * - Previous formula used fixed wOBA weights (2023-era); now uses season-specific values
 *
 * Requires:
 * - woba_season_weights table must exist and be populated
 *   (migration 20260226_010000, CLI command `load-woba-weights`)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE VIEW public.career_batting AS
    WITH season_totals AS (
        -- Aggregate season_batting per (player_id, season) to handle multi-team rows
        SELECT
            sb.player_id,
            sb.season,
            SUM(sb.g)::int       AS g,
            SUM(sb.pa)::int      AS pa,
            SUM(sb.ab)::int      AS ab,
            SUM(sb.r)::int       AS r,
            SUM(sb.h)::int       AS h,
            SUM(sb.doubles)::int AS doubles,
            SUM(sb.triples)::int AS triples,
            SUM(sb.hr)::int      AS hr,
            SUM(sb.rbi)::int     AS rbi,
            SUM(sb.sb)::int      AS sb_count,
            SUM(sb.cs)::int      AS cs_count,
            SUM(sb.bb)::int      AS bb,
            SUM(sb.so)::int      AS so,
            SUM(sb.tb)::int      AS tb,
            SUM(sb.gidp)::int    AS gidp,
            SUM(sb.hbp)::int     AS hbp,
            SUM(sb.sh)::int      AS sh,
            SUM(sb.ibb)::int     AS ibb
        FROM season_batting sb
        WHERE (
            SELECT count(1)
            FROM regexp_split_to_table(sb.lg_id::text, ','::text) x(x)
            WHERE sb.lg_id::text = ANY (ARRAY['AL'::text, 'NL'::text])
        ) > 0
        GROUP BY sb.player_id, sb.season
    ),
    season_war AS (
        SELECT
            st.player_id,
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
                WHEN st.pa >= 1
                     AND (st.pa - COALESCE(st.ibb, 0)) > 0
                     AND w.season IS NOT NULL
                THEN
                    (
                        -- wRAA: ((wOBA - lgwOBA) / wOBAScale) * PA
                        (
                            (
                                w.w_bb  * GREATEST(0, st.bb - COALESCE(st.ibb, 0))
                              + w.w_hbp * COALESCE(st.hbp, 0)
                              + w.w_1b  * GREATEST(0, st.h - st.doubles - st.triples - st.hr)
                              + w.w_2b  * st.doubles
                              + w.w_3b  * st.triples
                              + w.w_hr  * st.hr
                            ) / NULLIF(st.pa - COALESCE(st.ibb, 0), 0)
                            - w.lg_woba
                        ) / w.woba_scale * st.pa

                        -- BsR: base-running runs (run_cs is already negative)
                        + COALESCE(st.sb_count, 0) * w.run_sb
                        + COALESCE(st.cs_count, 0) * w.run_cs

                        -- Positional adjustment (season-level from season_fielding)
                        + COALESCE(
                            (
                                SELECT SUM(
                                    CASE sf.pos
                                        WHEN 'C'  THEN  12.5
                                        WHEN '1B' THEN -12.5
                                        WHEN '2B' THEN   2.5
                                        WHEN '3B' THEN   2.5
                                        WHEN 'SS' THEN   7.5
                                        WHEN 'LF' THEN  -7.5
                                        WHEN 'RF' THEN  -7.5
                                        WHEN 'CF' THEN   2.5
                                        WHEN 'OF' THEN  -7.5
                                        WHEN 'DH' THEN -17.5
                                        ELSE 0
                                    END * sf.g::numeric
                                ) / NULLIF(SUM(sf.g), 0)
                                FROM season_fielding sf
                                WHERE sf.player_id = st.player_id
                                  AND sf.season    = st.season
                                  AND (
                                      SELECT count(1)
                                      FROM regexp_split_to_table(sf.lg_id::text, ','::text) x(x)
                                      WHERE sf.lg_id::text = ANY (ARRAY['AL'::text, 'NL'::text])
                                  ) > 0
                            ),
                            0
                        ) * (st.g / 162.0)

                        -- Replacement level: 20 runs per 600 PA
                        + 20.0 * (st.pa / 600.0)
                    ) / w.rpw
                ELSE 0
            END AS season_owar
        FROM season_totals st
        LEFT JOIN woba_season_weights w ON w.season = st.season
    )
    SELECT
        player_id,
        SUM(g)       AS g,
        SUM(pa)      AS pa,
        SUM(ab)      AS ab,
        SUM(r)       AS r,
        SUM(h)       AS h,
        SUM(doubles) AS doubles,
        SUM(triples) AS triples,
        SUM(hr)      AS hr,
        SUM(rbi)     AS rbi,
        SUM(sb)      AS sb,
        SUM(cs)      AS cs,
        SUM(bb)      AS bb,
        SUM(so)      AS so,
        SUM(tb)      AS tb,
        SUM(gidp)    AS gidp,
        SUM(hbp)     AS hbp,
        SUM(sh)      AS sh,
        SUM(ibb)     AS ibb,
        CASE
            WHEN SUM(pa) >= 10 THEN ROUND(SUM(season_owar)::numeric, 1)
            ELSE NULL
        END AS offensive_war
    FROM season_war
    GROUP BY player_id
  `);
};

/**
 * Down migration: restore the previous fixed-constant lWAR formula
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE VIEW public.career_batting AS
    WITH batting AS (
        SELECT player_id,
               sum(g)       AS g,
               sum(pa)      AS pa,
               sum(ab)      AS ab,
               sum(r)       AS r,
               sum(h)       AS h,
               sum(doubles) AS doubles,
               sum(triples) AS triples,
               sum(hr)      AS hr,
               sum(rbi)     AS rbi,
               sum(sb)      AS sb,
               sum(cs)      AS cs,
               sum(bb)      AS bb,
               sum(so)      AS so,
               sum(tb)      AS tb,
               sum(gidp)    AS gidp,
               sum(hbp)     AS hbp,
               sum(sh)      AS sh,
               sum(ibb)     AS ibb
        FROM season_batting
        WHERE ((SELECT count(1) AS count
                FROM regexp_split_to_table(season_batting.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
                WHERE season_batting.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
        GROUP BY player_id
    )
    SELECT b.player_id,
           b.g,
           b.pa,
           b.ab,
           b.r,
           b.h,
           b.doubles,
           b.triples,
           b.hr,
           b.rbi,
           b.sb,
           b.cs,
           b.bb,
           b.so,
           b.tb,
           b.gidp,
           b.hbp,
           b.sh,
           b.ibb,
           CASE
               WHEN b.pa >= 10 AND (b.pa - COALESCE(b.ibb, 0)) > 0 THEN
                   ROUND(
                       CAST((
                           (
                               (
                                   0.69 * GREATEST(0, b.bb - COALESCE(b.ibb, 0))
                                   + 0.72 * COALESCE(b.hbp, 0)
                                   + 0.88 * GREATEST(0, b.h - b.doubles - b.triples - b.hr)
                                   + 1.25 * b.doubles
                                   + 1.59 * b.triples
                                   + 2.10 * b.hr
                               ) / NULLIF(b.pa - COALESCE(b.ibb, 0), 0)
                               - 0.320
                           ) / 1.24 * b.pa
                           + COALESCE(b.sb, 0) * 0.2 - COALESCE(b.cs, 0) * 0.4
                           + COALESCE(
                               (
                                   SELECT SUM(
                                       CASE cfbp.pos
                                           WHEN 'C'  THEN  12.5
                                           WHEN '1B' THEN -12.5
                                           WHEN '2B' THEN   2.5
                                           WHEN '3B' THEN   2.5
                                           WHEN 'SS' THEN   7.5
                                           WHEN 'LF' THEN  -7.5
                                           WHEN 'RF' THEN  -7.5
                                           WHEN 'CF' THEN   2.5
                                           WHEN 'OF' THEN  -7.5
                                           WHEN 'DH' THEN -17.5
                                           ELSE 0
                                       END * cfbp.g::numeric
                                   ) / NULLIF(SUM(cfbp.g), 0)
                                   FROM career_fielding_by_position cfbp
                                   WHERE cfbp.player_id = b.player_id
                               ),
                               0
                           ) * (b.g / 162.0)
                           + 20.0 * (b.pa / 600.0)
                       ) / 10.0 AS numeric),
                       1
                   )
               ELSE NULL
           END AS offensive_war
    FROM batting b
  `);
};
