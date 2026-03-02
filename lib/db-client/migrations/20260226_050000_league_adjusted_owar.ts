import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: League-adjusted lWAR
 *
 * Purpose:
 * - Adds league adjustment to the lWAR formula, on top of park factors
 * - Accounts for differences in run-scoring environment between AL and NL
 *   (e.g., the AL was generally higher-scoring in the 1920s-1930s)
 * - Formula: league_adj = (MLB_R/PA - league_R/PA) * PA
 *   - Penalizes batters in higher-scoring leagues (negative adjustment)
 *   - Rewards batters in lower-scoring leagues (positive adjustment)
 * - League R/PA is computed directly from season_batting data,
 *   not from FanGraphs (which only publishes combined MLB constants)
 *
 * Requires:
 * - woba_season_weights table (migration 20260226_010000)
 * - park_factors table (migration 20260226_030000)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE VIEW public.career_batting AS
    WITH
    -- Per-league runs per PA (AL vs NL)
    league_rpa AS (
        SELECT
            sb.season,
            sb.lg_id,
            SUM(sb.r)::numeric / NULLIF(SUM(sb.pa), 0) AS lg_r_per_pa
        FROM season_batting sb
        WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.season, sb.lg_id
    ),
    -- Combined MLB runs per PA (AL + NL together)
    combined_rpa AS (
        SELECT
            sb.season,
            SUM(sb.r)::numeric / NULLIF(SUM(sb.pa), 0) AS mlb_r_per_pa
        FROM season_batting sb
        WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.season
    ),
    team_season_batting AS (
        -- Keep per-team rows so we can join park factors per team
        -- Also preserve lg_id for league adjustment
        SELECT
            sb.player_id,
            sb.season,
            sb.team,
            sb.lg_id,
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
        WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.player_id, sb.season, sb.team, sb.lg_id
    ),
    season_totals AS (
        -- Aggregate to (player_id, season) for season-level stats
        SELECT
            tsb.player_id,
            tsb.season,
            SUM(tsb.g)::int       AS g,
            SUM(tsb.pa)::int      AS pa,
            SUM(tsb.ab)::int      AS ab,
            SUM(tsb.r)::int       AS r,
            SUM(tsb.h)::int       AS h,
            SUM(tsb.doubles)::int AS doubles,
            SUM(tsb.triples)::int AS triples,
            SUM(tsb.hr)::int      AS hr,
            SUM(tsb.rbi)::int     AS rbi,
            SUM(tsb.sb_count)::int AS sb_count,
            SUM(tsb.cs_count)::int AS cs_count,
            SUM(tsb.bb)::int      AS bb,
            SUM(tsb.so)::int      AS so,
            SUM(tsb.tb)::int      AS tb,
            SUM(tsb.gidp)::int    AS gidp,
            SUM(tsb.hbp)::int     AS hbp,
            SUM(tsb.sh)::int      AS sh,
            SUM(tsb.ibb)::int     AS ibb,
            -- PA-weighted park factor for the season
            COALESCE(
                SUM(
                    tsb.pa * COALESCE(pf.basic_5yr, 100.0)
                )::numeric / NULLIF(SUM(tsb.pa), 0),
                100.0
            ) AS weighted_pf,
            -- PA-weighted league adjustment for multi-league seasons
            -- league_adj_runs = SUM over stints of: (mlb_r_pa - lg_r_pa) * stint_PA
            COALESCE(
                SUM(
                    (COALESCE(cr.mlb_r_per_pa, 0) - COALESCE(lr.lg_r_per_pa, 0))
                    * tsb.pa
                ),
                0
            ) AS league_adj_runs
        FROM team_season_batting tsb
        LEFT JOIN park_factors pf
            ON pf.season = tsb.season AND pf.team = tsb.team
        LEFT JOIN league_rpa lr
            ON lr.season = tsb.season AND lr.lg_id = tsb.lg_id
        LEFT JOIN combined_rpa cr
            ON cr.season = tsb.season
        GROUP BY tsb.player_id, tsb.season
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

                        -- Park adjustment: (1 - PF/100) / 2 * PA * (lgR/PA)
                        -- The /2 accounts for half home / half away games
                        + (1.0 - st.weighted_pf / 100.0) / 2.0 * st.pa * w.r_pa

                        -- League adjustment: penalize batters in higher-scoring leagues
                        -- (mlb_r_pa - lg_r_pa) * PA — negative when league > MLB average
                        + st.league_adj_runs

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
                                  AND sf.lg_id IN ('AL', 'NL')
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
 * Down migration: restore the park-factor-adjusted formula WITHOUT league adjustment
 * (reverts to 20260226_040000 version)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE VIEW public.career_batting AS
    WITH team_season_batting AS (
        SELECT
            sb.player_id,
            sb.season,
            sb.team,
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
        GROUP BY sb.player_id, sb.season, sb.team
    ),
    season_totals AS (
        SELECT
            tsb.player_id,
            tsb.season,
            SUM(tsb.g)::int       AS g,
            SUM(tsb.pa)::int      AS pa,
            SUM(tsb.ab)::int      AS ab,
            SUM(tsb.r)::int       AS r,
            SUM(tsb.h)::int       AS h,
            SUM(tsb.doubles)::int AS doubles,
            SUM(tsb.triples)::int AS triples,
            SUM(tsb.hr)::int      AS hr,
            SUM(tsb.rbi)::int     AS rbi,
            SUM(tsb.sb_count)::int AS sb_count,
            SUM(tsb.cs_count)::int AS cs_count,
            SUM(tsb.bb)::int      AS bb,
            SUM(tsb.so)::int      AS so,
            SUM(tsb.tb)::int      AS tb,
            SUM(tsb.gidp)::int    AS gidp,
            SUM(tsb.hbp)::int     AS hbp,
            SUM(tsb.sh)::int      AS sh,
            SUM(tsb.ibb)::int     AS ibb,
            COALESCE(
                SUM(
                    tsb.pa * COALESCE(pf.basic_5yr, 100.0)
                )::numeric / NULLIF(SUM(tsb.pa), 0),
                100.0
            ) AS weighted_pf
        FROM team_season_batting tsb
        LEFT JOIN park_factors pf
            ON pf.season = tsb.season AND pf.team = tsb.team
        GROUP BY tsb.player_id, tsb.season
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
                        + (1.0 - st.weighted_pf / 100.0) / 2.0 * st.pa * w.r_pa
                        + COALESCE(st.sb_count, 0) * w.run_sb
                        + COALESCE(st.cs_count, 0) * w.run_cs
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
