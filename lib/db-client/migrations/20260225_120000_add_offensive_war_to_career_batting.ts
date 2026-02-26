import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add offensive_war computed column to career_batting view
 *
 * Purpose:
 * - Computes oWAR at the database level so it can be used for server-side sorting
 * - Uses wOBA linear weights + baserunning + positional adjustment + replacement level
 * - Positional adjustment is derived from a correlated subquery on career_fielding_by_position
 *
 * Changes:
 * - Recreates career_batting as a CTE-based view with an offensive_war column
 *
 * Formula:
 *   oWAR = (wRAA + BsR + posAdj + replRuns) / 10
 *   wRAA  = ((wOBA - 0.320) / 1.24) * PA
 *   BsR   = SB * 0.20 - CS * 0.40
 *   posAdj = weightedPosAdj * (G / 162)  [weighted average across positions played]
 *   replRuns = 20.0 * (PA / 600)
 *   wOBA constants: uBB=0.69, HBP=0.72, 1B=0.88, 2B=1.25, 3B=1.59, HR=2.10
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
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
                           -- wRAA: (wOBA - lgwOBA) / wOBA_scale * PA
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
                           -- BsR: stolen base runs
                           + COALESCE(b.sb, 0) * 0.2 - COALESCE(b.cs, 0) * 0.4
                           -- Positional adjustment: weighted average positional value scaled to actual games
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
                           -- Replacement level: 20 runs below average per 600 PA
                           + 20.0 * (b.pa / 600.0)
                       ) / 10.0 AS numeric),
                       1
                   )
               ELSE NULL
           END AS offensive_war
    FROM batting b
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE VIEW public.career_batting AS
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
  `);
};
