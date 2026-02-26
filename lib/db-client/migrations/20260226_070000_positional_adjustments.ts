import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add season-specific positional adjustments from Baseball Reference
 *
 * Changes:
 * 1. Creates positional_adjustments table with BR's year-by-year positional adjustment
 *    values (per 1350 defensive innings = 150 games × 9 innings).
 *    Source: https://www.baseball-reference.com/about/war_explained_position.shtml
 *
 * 2. Updates career_batting view to:
 *    - Use year-specific positional adjustments instead of fixed constants
 *    - Prorate positional adjustment per 150 games (BR standard) instead of 162
 *    - Use replacement level of 20.5 runs per 600 PA (BR standard) instead of 20.0
 *    - Sum per-position adjustments directly instead of weighted average
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create positional_adjustments table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.positional_adjustments (
      season INTEGER PRIMARY KEY,
      c      NUMERIC(5,2) NOT NULL,
      first_base  NUMERIC(5,2) NOT NULL,
      second_base NUMERIC(5,2) NOT NULL,
      third_base  NUMERIC(5,2) NOT NULL,
      ss     NUMERIC(5,2) NOT NULL,
      lf     NUMERIC(5,2) NOT NULL,
      cf     NUMERIC(5,2) NOT NULL,
      rf     NUMERIC(5,2) NOT NULL,
      dh     NUMERIC(5,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 2. Drop career_batting (CASCADE drops player_eligible_positions)
  await db.execute(sql`DROP VIEW IF EXISTS public.career_batting CASCADE`);

  // 3. Recreate career_batting with:
  //    - JOIN to positional_adjustments for year-specific values
  //    - Per-position prorating: pos_adj * games_at_pos / 150.0
  //    - Replacement level: 20.5 runs per 600 PA
  await db.execute(sql`
    CREATE OR REPLACE VIEW public.career_batting AS
    WITH
    league_rpa AS (
        SELECT
            sb.season,
            sb.lg_id,
            SUM(sb.r)::numeric / NULLIF(SUM(sb.pa), 0) AS lg_r_per_pa
        FROM season_batting sb
        WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.season, sb.lg_id
    ),
    combined_rpa AS (
        SELECT
            sb.season,
            SUM(sb.r)::numeric / NULLIF(SUM(sb.pa), 0) AS mlb_r_per_pa
        FROM season_batting sb
        WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.season
    ),
    team_season_batting AS (
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
                    tsb.pa * COALESCE(pf.bpf, 100)
                )::numeric / NULLIF(SUM(tsb.pa), 0),
                100.0
            ) AS weighted_pf,
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

                        -- Park adjustment: (1 - BPF/100) / 2 * PA * (lgR/PA)
                        + (1.0 - st.weighted_pf / 100.0) / 2.0 * st.pa * w.r_pa

                        -- League adjustment
                        + st.league_adj_runs

                        -- BsR: base-running runs
                        + COALESCE(st.sb_count, 0) * w.run_sb
                        + COALESCE(st.cs_count, 0) * w.run_cs

                        -- Positional adjustment (year-specific from positional_adjustments table)
                        -- Per BR: sum of (pos_adj * games_at_position / 150) for each position
                        -- 'OF' is a summary row when LF/RF/CF exist; exclude to avoid double-counting
                        + COALESCE(
                            (
                                SELECT SUM(
                                    CASE sf.pos
                                        WHEN 'C'  THEN pa.c
                                        WHEN '1B' THEN pa.first_base
                                        WHEN '2B' THEN pa.second_base
                                        WHEN '3B' THEN pa.third_base
                                        WHEN 'SS' THEN pa.ss
                                        WHEN 'LF' THEN pa.lf
                                        WHEN 'RF' THEN pa.rf
                                        WHEN 'CF' THEN pa.cf
                                        WHEN 'OF' THEN pa.lf
                                        WHEN 'DH' THEN pa.dh
                                        ELSE 0
                                    END * sf.g::numeric / 150.0
                                )
                                FROM season_fielding sf
                                WHERE sf.player_id = st.player_id
                                  AND sf.season    = st.season
                                  AND sf.lg_id IN ('AL', 'NL')
                                  AND (sf.pos <> 'OF' OR NOT EXISTS (
                                      SELECT 1 FROM season_fielding sf2
                                      WHERE sf2.player_id = sf.player_id
                                        AND sf2.season = sf.season
                                        AND sf2.pos IN ('LF', 'RF', 'CF')
                                        AND sf2.lg_id IN ('AL', 'NL')
                                  ))
                            ),
                            0
                        )

                        -- Replacement level: 20.5 runs per 600 PA (BR standard)
                        + 20.5 * (st.pa / 600.0)
                    ) / w.rpw
                ELSE 0
            END AS season_owar
        FROM season_totals st
        LEFT JOIN woba_season_weights w ON w.season = st.season
        LEFT JOIN positional_adjustments pa ON pa.season = st.season
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

  // 4. Recreate player_eligible_positions (dropped by CASCADE above)
  await db.execute(sql`
    CREATE VIEW public.player_eligible_positions AS
    SELECT cfbp.player_id, cfbp.pos AS position, cfbp.g AS games
    FROM career_fielding_by_position cfbp
    JOIN career_batting cb ON cb.player_id = cfbp.player_id
    WHERE cfbp.pos != 'P'
      AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id, 'SP' AS position, gs AS games
    FROM career_pitching
    WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id, 'RP' AS position, (g - gs) AS games
    FROM career_pitching
    WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
    ORDER BY player_id, games DESC
  `);
};

/**
 * Down migration: drop positional_adjustments, restore fixed positional values
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Drop views
  await db.execute(sql`DROP VIEW IF EXISTS public.career_batting CASCADE`);

  // Drop table
  await db.execute(sql`DROP TABLE IF EXISTS public.positional_adjustments`);

  // Restore the previous view with fixed positional values, 162-game prorate, 20.0 replacement
  // (This restores to the 060000 migration state)
  await db.execute(sql`
    CREATE OR REPLACE VIEW public.career_batting AS
    WITH
    league_rpa AS (
        SELECT sb.season, sb.lg_id,
            SUM(sb.r)::numeric / NULLIF(SUM(sb.pa), 0) AS lg_r_per_pa
        FROM season_batting sb WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.season, sb.lg_id
    ),
    combined_rpa AS (
        SELECT sb.season,
            SUM(sb.r)::numeric / NULLIF(SUM(sb.pa), 0) AS mlb_r_per_pa
        FROM season_batting sb WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.season
    ),
    team_season_batting AS (
        SELECT sb.player_id, sb.season, sb.team, sb.lg_id,
            SUM(sb.g)::int AS g, SUM(sb.pa)::int AS pa, SUM(sb.ab)::int AS ab,
            SUM(sb.r)::int AS r, SUM(sb.h)::int AS h, SUM(sb.doubles)::int AS doubles,
            SUM(sb.triples)::int AS triples, SUM(sb.hr)::int AS hr, SUM(sb.rbi)::int AS rbi,
            SUM(sb.sb)::int AS sb_count, SUM(sb.cs)::int AS cs_count,
            SUM(sb.bb)::int AS bb, SUM(sb.so)::int AS so, SUM(sb.tb)::int AS tb,
            SUM(sb.gidp)::int AS gidp, SUM(sb.hbp)::int AS hbp,
            SUM(sb.sh)::int AS sh, SUM(sb.ibb)::int AS ibb
        FROM season_batting sb WHERE sb.lg_id IN ('AL', 'NL')
        GROUP BY sb.player_id, sb.season, sb.team, sb.lg_id
    ),
    season_totals AS (
        SELECT tsb.player_id, tsb.season,
            SUM(tsb.g)::int AS g, SUM(tsb.pa)::int AS pa, SUM(tsb.ab)::int AS ab,
            SUM(tsb.r)::int AS r, SUM(tsb.h)::int AS h, SUM(tsb.doubles)::int AS doubles,
            SUM(tsb.triples)::int AS triples, SUM(tsb.hr)::int AS hr, SUM(tsb.rbi)::int AS rbi,
            SUM(tsb.sb_count)::int AS sb_count, SUM(tsb.cs_count)::int AS cs_count,
            SUM(tsb.bb)::int AS bb, SUM(tsb.so)::int AS so, SUM(tsb.tb)::int AS tb,
            SUM(tsb.gidp)::int AS gidp, SUM(tsb.hbp)::int AS hbp,
            SUM(tsb.sh)::int AS sh, SUM(tsb.ibb)::int AS ibb,
            COALESCE(SUM(tsb.pa * COALESCE(pf.bpf, 100))::numeric / NULLIF(SUM(tsb.pa), 0), 100.0) AS weighted_pf,
            COALESCE(SUM((COALESCE(cr.mlb_r_per_pa, 0) - COALESCE(lr.lg_r_per_pa, 0)) * tsb.pa), 0) AS league_adj_runs
        FROM team_season_batting tsb
        LEFT JOIN park_factors pf ON pf.season = tsb.season AND pf.team = tsb.team
        LEFT JOIN league_rpa lr ON lr.season = tsb.season AND lr.lg_id = tsb.lg_id
        LEFT JOIN combined_rpa cr ON cr.season = tsb.season
        GROUP BY tsb.player_id, tsb.season
    ),
    season_war AS (
        SELECT st.player_id, st.season, st.g, st.pa, st.ab, st.r, st.h,
            st.doubles, st.triples, st.hr, st.rbi, st.sb_count AS sb, st.cs_count AS cs,
            st.bb, st.so, st.tb, st.gidp, st.hbp, st.sh, st.ibb,
            CASE WHEN st.pa >= 1 AND (st.pa - COALESCE(st.ibb, 0)) > 0 AND w.season IS NOT NULL THEN
                (
                    ((w.w_bb * GREATEST(0, st.bb - COALESCE(st.ibb, 0)) + w.w_hbp * COALESCE(st.hbp, 0)
                      + w.w_1b * GREATEST(0, st.h - st.doubles - st.triples - st.hr)
                      + w.w_2b * st.doubles + w.w_3b * st.triples + w.w_hr * st.hr
                    ) / NULLIF(st.pa - COALESCE(st.ibb, 0), 0) - w.lg_woba) / w.woba_scale * st.pa
                    + (1.0 - st.weighted_pf / 100.0) / 2.0 * st.pa * w.r_pa
                    + st.league_adj_runs
                    + COALESCE(st.sb_count, 0) * w.run_sb + COALESCE(st.cs_count, 0) * w.run_cs
                    + COALESCE((SELECT SUM(CASE sf.pos
                        WHEN 'C' THEN 12.5 WHEN '1B' THEN -12.5 WHEN '2B' THEN 2.5
                        WHEN '3B' THEN 2.5 WHEN 'SS' THEN 7.5 WHEN 'LF' THEN -7.5
                        WHEN 'RF' THEN -7.5 WHEN 'CF' THEN 2.5 WHEN 'OF' THEN -7.5
                        WHEN 'DH' THEN -17.5 ELSE 0 END * sf.g::numeric
                      ) / NULLIF(SUM(sf.g), 0)
                      FROM season_fielding sf
                      WHERE sf.player_id = st.player_id AND sf.season = st.season AND sf.lg_id IN ('AL', 'NL')
                    ), 0) * (st.g / 162.0)
                    + 20.0 * (st.pa / 600.0)
                ) / w.rpw
            ELSE 0 END AS season_owar
        FROM season_totals st
        LEFT JOIN woba_season_weights w ON w.season = st.season
    )
    SELECT player_id, SUM(g) AS g, SUM(pa) AS pa, SUM(ab) AS ab, SUM(r) AS r,
        SUM(h) AS h, SUM(doubles) AS doubles, SUM(triples) AS triples, SUM(hr) AS hr,
        SUM(rbi) AS rbi, SUM(sb) AS sb, SUM(cs) AS cs, SUM(bb) AS bb, SUM(so) AS so,
        SUM(tb) AS tb, SUM(gidp) AS gidp, SUM(hbp) AS hbp, SUM(sh) AS sh, SUM(ibb) AS ibb,
        CASE WHEN SUM(pa) >= 10 THEN ROUND(SUM(season_owar)::numeric, 1) ELSE NULL END AS offensive_war
    FROM season_war GROUP BY player_id
  `);

  // Recreate player_eligible_positions
  await db.execute(sql`
    CREATE VIEW public.player_eligible_positions AS
    SELECT cfbp.player_id, cfbp.pos AS position, cfbp.g AS games
    FROM career_fielding_by_position cfbp
    JOIN career_batting cb ON cb.player_id = cfbp.player_id
    WHERE cfbp.pos != 'P' AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
    UNION
    SELECT player_id, 'SP' AS position, gs AS games FROM career_pitching
    WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
    UNION
    SELECT player_id, 'RP' AS position, (g - gs) AS games FROM career_pitching
    WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
    ORDER BY player_id, games DESC
  `);
};
