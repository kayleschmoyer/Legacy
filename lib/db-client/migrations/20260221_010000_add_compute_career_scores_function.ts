import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add compute_career_scores SQL function
 *
 * Creates a PostgreSQL function that computes fantasy scoring at the database
 * level using career stats and league-specific (or default) scoring multipliers.
 *
 * This enables efficient server-side sorting by total points, average PPG, etc.
 * without loading all players into application memory.
 *
 * The function reads scoring_stat_definitions + league_scoring_profile_entries
 * to resolve effective multipliers, then applies them to career_batting,
 * career_pitching, and career_fielding views.
 *
 * Usage:
 *   SELECT * FROM compute_career_scores(16) ORDER BY avg_ppg DESC LIMIT 50;
 *   SELECT * FROM compute_career_scores(NULL) ORDER BY total_score DESC; -- default scoring
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE OR REPLACE FUNCTION public.compute_career_scores(p_league_id INTEGER DEFAULT NULL)
    RETURNS TABLE (
        player_id   INTEGER,
        batting_score  NUMERIC,
        pitching_score NUMERIC,
        fielding_score NUMERIC,
        total_score    NUMERIC,
        career_games   BIGINT,
        avg_ppg        NUMERIC
    )
    LANGUAGE sql STABLE
    AS $fn$
    WITH effective_multipliers AS (
        -- Resolve multipliers: league override → default fallback
        -- Exclude stats explicitly disabled by the league
        SELECT
            ssd.source_column,
            ssd.stat_group::text AS stat_group,
            COALESCE(lspe.multiplier, ssd.default_multiplier)::NUMERIC AS multiplier
        FROM public.scoring_stat_definitions ssd
        LEFT JOIN public.league_scoring_profiles lsp
            ON lsp.league_id = p_league_id
            AND lsp.is_default = true
        LEFT JOIN public.league_scoring_profile_entries lspe
            ON lspe.profile_id = lsp.id
            AND lspe.stat_definition_id = ssd.id
        WHERE lspe.is_enabled IS DISTINCT FROM false
    ),

    -- Pivot multipliers into single rows per stat group for efficient cross-join
    bat_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'h'       THEN multiplier END), 0) AS h,
            COALESCE(MAX(CASE WHEN source_column = 'doubles'  THEN multiplier END), 0) AS doubles,
            COALESCE(MAX(CASE WHEN source_column = 'triples'  THEN multiplier END), 0) AS triples,
            COALESCE(MAX(CASE WHEN source_column = 'hr'       THEN multiplier END), 0) AS hr,
            COALESCE(MAX(CASE WHEN source_column = 'r'        THEN multiplier END), 0) AS r,
            COALESCE(MAX(CASE WHEN source_column = 'rbi'      THEN multiplier END), 0) AS rbi,
            COALESCE(MAX(CASE WHEN source_column = 'sb'       THEN multiplier END), 0) AS sb,
            COALESCE(MAX(CASE WHEN source_column = 'cs'       THEN multiplier END), 0) AS cs,
            COALESCE(MAX(CASE WHEN source_column = 'hbp'      THEN multiplier END), 0) AS hbp,
            COALESCE(MAX(CASE WHEN source_column = 'so'       THEN multiplier END), 0) AS so
        FROM effective_multipliers
        WHERE stat_group = 'batting'
    ),
    pit_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'w'              THEN multiplier END), 0) AS w,
            COALESCE(MAX(CASE WHEN source_column = 'l'              THEN multiplier END), 0) AS l,
            COALESCE(MAX(CASE WHEN source_column = 'sv'             THEN multiplier END), 0) AS sv,
            COALESCE(MAX(CASE WHEN source_column = 'so'             THEN multiplier END), 0) AS so,
            COALESCE(MAX(CASE WHEN source_column = 'outs_recorded'  THEN multiplier END), 0) AS outs_recorded,
            COALESCE(MAX(CASE WHEN source_column = 'bb'             THEN multiplier END), 0) AS bb,
            COALESCE(MAX(CASE WHEN source_column = 'h'              THEN multiplier END), 0) AS h,
            COALESCE(MAX(CASE WHEN source_column = 'er'             THEN multiplier END), 0) AS er
        FROM effective_multipliers
        WHERE stat_group = 'pitching'
    ),
    fld_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'e_def' THEN multiplier END), 0) AS e_def
        FROM effective_multipliers
        WHERE stat_group = 'fielding'
    ),

    -- Compute category scores from career views
    bat_scores AS (
        SELECT
            cb.player_id,
            (
                COALESCE(cb.h, 0)       * m.h       +
                COALESCE(cb.doubles, 0)  * m.doubles  +
                COALESCE(cb.triples, 0)  * m.triples  +
                COALESCE(cb.hr, 0)       * m.hr       +
                COALESCE(cb.r, 0)        * m.r        +
                COALESCE(cb.rbi, 0)      * m.rbi      +
                COALESCE(cb.sb, 0)       * m.sb       +
                COALESCE(cb.cs, 0)       * m.cs       +
                COALESCE(cb.hbp, 0)      * m.hbp      +
                COALESCE(cb.so, 0)       * m.so
            )::NUMERIC AS score,
            COALESCE(cb.g, 0) AS games
        FROM public.career_batting cb
        CROSS JOIN bat_m m
    ),
    pit_scores AS (
        SELECT
            cp.player_id,
            (
                COALESCE(cp.w, 0)              * m.w              +
                COALESCE(cp.l, 0)              * m.l              +
                COALESCE(cp.sv, 0)             * m.sv             +
                COALESCE(cp.so, 0)             * m.so             +
                COALESCE(cp.outs_recorded, 0)  * m.outs_recorded  +
                COALESCE(cp.bb, 0)             * m.bb             +
                COALESCE(cp.h, 0)              * m.h              +
                COALESCE(cp.er, 0)             * m.er
            )::NUMERIC AS score,
            COALESCE(cp.g, 0) AS games
        FROM public.career_pitching cp
        CROSS JOIN pit_m m
    ),
    fld_scores AS (
        SELECT
            cf.player_id,
            (COALESCE(cf.e_def, 0) * m.e_def)::NUMERIC AS score
        FROM public.career_fielding cf
        CROSS JOIN fld_m m
    )

    -- Final result: one row per player with all scoring components
    SELECT
        p.id                                                             AS player_id,
        COALESCE(bs.score, 0)::NUMERIC                                   AS batting_score,
        COALESCE(ps.score, 0)::NUMERIC                                   AS pitching_score,
        COALESCE(fs.score, 0)::NUMERIC                                   AS fielding_score,
        (COALESCE(bs.score, 0)
         + COALESCE(ps.score, 0)
         + COALESCE(fs.score, 0))::NUMERIC                               AS total_score,
        GREATEST(COALESCE(bs.games, 0),
                 COALESCE(ps.games, 0))::BIGINT                          AS career_games,
        CASE
            WHEN GREATEST(COALESCE(bs.games, 0), COALESCE(ps.games, 0)) > 0
            THEN ROUND(
                (COALESCE(bs.score, 0) + COALESCE(ps.score, 0) + COALESCE(fs.score, 0))
                / GREATEST(COALESCE(bs.games, 0), COALESCE(ps.games, 0)),
                3
            )
            ELSE 0
        END::NUMERIC                                                     AS avg_ppg
    FROM public.players p
    LEFT JOIN bat_scores bs  ON p.id = bs.player_id
    LEFT JOIN pit_scores ps  ON p.id = ps.player_id
    LEFT JOIN fld_scores fs  ON p.id = fs.player_id;
    $fn$;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP FUNCTION IF EXISTS public.compute_career_scores(INTEGER);
  `);
};
