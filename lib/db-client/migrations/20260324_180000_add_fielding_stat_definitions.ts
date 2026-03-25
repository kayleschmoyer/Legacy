import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add positive fielding stat definitions (LS-1768)
 *
 * The fielding score was calculated using only errors (e_def) with a -1
 * multiplier, making it always negative. This adds putouts, assists, and
 * double plays as positive fielding metrics and updates the
 * compute_career_scores function to incorporate them.
 *
 * Default multipliers:
 *   - Putouts (po):       +0.02  (routine, many per career)
 *   - Assists (a):        +0.1   (skill-based defensive play)
 *   - Double plays (dp):  +0.5   (high-value defensive play)
 *   - Errors (e_def):     -0.5   (reduced from -1 to balance with new positives)
 */

export const up = async ({
  db,
}: {
  db: PgDatabase<Record<string, unknown>>;
}): Promise<void> => {
  // 1. Add new fielding stat definitions
  await db.execute(`
    INSERT INTO public.scoring_stat_definitions
      (stat_key, stat_group, source_table, source_column, display_name, description,
       default_multiplier, min_multiplier, max_multiplier, step, is_premium, is_advanced, is_enabled)
    VALUES
      ('fielding_putouts',     'fielding', 'season_fielding', 'po',     'Putouts',      'Defensive out recorded by the fielder',              0.020, -1.000,  1.000, 0.010, false, false, true),
      ('fielding_assists',     'fielding', 'season_fielding', 'a',      'Assists',      'Throw or deflection leading to a putout',            0.100, -1.000,  1.000, 0.010, false, false, true),
      ('fielding_double_plays','fielding', 'season_fielding', 'dp_def', 'Double Plays', 'Participation in turning a double play',             0.500, -5.000,  5.000, 0.100, false, false, true)
    ON CONFLICT (stat_key) DO NOTHING;
  `);

  // 2. Update errors default multiplier from -1 to -0.5
  await db.execute(`
    UPDATE public.scoring_stat_definitions
       SET default_multiplier = -0.500
     WHERE stat_key = 'fielding_errors'
       AND default_multiplier = -1.000;
  `);

  // 3. Recreate compute_career_scores with expanded fielding calculation
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
            COALESCE(MAX(CASE WHEN source_column = 'po'     THEN multiplier END), 0) AS po,
            COALESCE(MAX(CASE WHEN source_column = 'a'      THEN multiplier END), 0) AS a,
            COALESCE(MAX(CASE WHEN source_column = 'e_def'  THEN multiplier END), 0) AS e_def,
            COALESCE(MAX(CASE WHEN source_column = 'dp_def' THEN multiplier END), 0) AS dp_def
        FROM effective_multipliers
        WHERE stat_group = 'fielding'
    ),

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
            (
                COALESCE(cf.po, 0)     * m.po     +
                COALESCE(cf.a, 0)      * m.a      +
                COALESCE(cf.e_def, 0)  * m.e_def  +
                COALESCE(cf.dp_def, 0) * m.dp_def
            )::NUMERIC AS score
        FROM public.career_fielding cf
        CROSS JOIN fld_m m
    )

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

  // 4. Refresh player_scoring_cache so UI reflects new fielding formula immediately
  await db.execute(`SELECT public.refresh_player_scoring_cache(NULL);`);
};

export const down = async ({
  db,
}: {
  db: PgDatabase<Record<string, unknown>>;
}): Promise<void> => {
  // Revert errors default multiplier (only if it was changed by this migration)
  await db.execute(`
    UPDATE public.scoring_stat_definitions
       SET default_multiplier = -1.000
     WHERE stat_key = 'fielding_errors'
       AND default_multiplier = -0.500;
  `);

  // Remove added stat definitions
  await db.execute(`
    DELETE FROM public.scoring_stat_definitions
     WHERE stat_key IN ('fielding_putouts', 'fielding_assists', 'fielding_double_plays');
  `);

  // Restore original function with e_def only
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
