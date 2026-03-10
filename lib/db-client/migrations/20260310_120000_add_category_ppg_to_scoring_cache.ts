import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add per-category PPG columns to player_scoring_cache
 *
 * Purpose:
 * - Eliminate 3 LEFT JOINs (career_batting, career_pitching, career_fielding)
 *   in the draft auto-pick scoring query by pre-computing per-category
 *   per-game fantasy point values in the scoring cache (LS-902).
 *
 * Changes:
 * - Adds batting_ppg, pitching_ppg, fielding_ppg columns to player_scoring_cache
 * - Replaces refresh_player_scoring_cache() to compute the new columns by
 *   joining compute_career_scores() with career stat views for per-category
 *   game counts
 * - Backfills existing rows
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    -- Add per-category PPG columns
    ALTER TABLE public.player_scoring_cache
      ADD COLUMN batting_ppg  NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN pitching_ppg NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN fielding_ppg NUMERIC NOT NULL DEFAULT 0;

    -- Replace refresh function to compute the new columns
    CREATE OR REPLACE FUNCTION public.refresh_player_scoring_cache(
      p_league_id INTEGER DEFAULT NULL
    )
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF p_league_id IS NULL THEN
        DELETE FROM public.player_scoring_cache WHERE league_id IS NULL;
        INSERT INTO public.player_scoring_cache
          (league_id, player_id, batting_score, pitching_score,
           fielding_score, total_score, career_games, avg_ppg,
           batting_ppg, pitching_ppg, fielding_ppg)
        SELECT
          NULL,
          cs.player_id,
          cs.batting_score,
          cs.pitching_score,
          cs.fielding_score,
          cs.total_score,
          cs.career_games,
          cs.avg_ppg,
          CASE WHEN COALESCE(cb.g, 0) > 0
               THEN ROUND(cs.batting_score / cb.g, 6) ELSE 0 END,
          CASE WHEN COALESCE(cp.g, 0) > 0
               THEN ROUND(cs.pitching_score / cp.g, 6) ELSE 0 END,
          CASE WHEN COALESCE(cf.g, 0) > 0
               THEN ROUND(cs.fielding_score / cf.g, 6) ELSE 0 END
        FROM public.compute_career_scores(NULL) cs
        LEFT JOIN public.career_batting  cb ON cb.player_id = cs.player_id
        LEFT JOIN public.career_pitching cp ON cp.player_id = cs.player_id
        LEFT JOIN public.career_fielding cf ON cf.player_id = cs.player_id;
      ELSE
        DELETE FROM public.player_scoring_cache WHERE league_id = p_league_id;
        INSERT INTO public.player_scoring_cache
          (league_id, player_id, batting_score, pitching_score,
           fielding_score, total_score, career_games, avg_ppg,
           batting_ppg, pitching_ppg, fielding_ppg)
        SELECT
          p_league_id,
          cs.player_id,
          cs.batting_score,
          cs.pitching_score,
          cs.fielding_score,
          cs.total_score,
          cs.career_games,
          cs.avg_ppg,
          CASE WHEN COALESCE(cb.g, 0) > 0
               THEN ROUND(cs.batting_score / cb.g, 6) ELSE 0 END,
          CASE WHEN COALESCE(cp.g, 0) > 0
               THEN ROUND(cs.pitching_score / cp.g, 6) ELSE 0 END,
          CASE WHEN COALESCE(cf.g, 0) > 0
               THEN ROUND(cs.fielding_score / cf.g, 6) ELSE 0 END
        FROM public.compute_career_scores(p_league_id) cs
        LEFT JOIN public.career_batting  cb ON cb.player_id = cs.player_id
        LEFT JOIN public.career_pitching cp ON cp.player_id = cs.player_id
        LEFT JOIN public.career_fielding cf ON cf.player_id = cs.player_id;
      END IF;
    END;
    $$;

    -- Backfill existing default rows
    SELECT public.refresh_player_scoring_cache(NULL);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    -- Restore original refresh function (without category PPG columns)
    CREATE OR REPLACE FUNCTION public.refresh_player_scoring_cache(
      p_league_id INTEGER DEFAULT NULL
    )
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF p_league_id IS NULL THEN
        DELETE FROM public.player_scoring_cache WHERE league_id IS NULL;
        INSERT INTO public.player_scoring_cache
          (league_id, player_id, batting_score, pitching_score,
           fielding_score, total_score, career_games, avg_ppg)
        SELECT
          NULL, player_id, batting_score, pitching_score,
          fielding_score, total_score, career_games, avg_ppg
        FROM public.compute_career_scores(NULL);
      ELSE
        DELETE FROM public.player_scoring_cache WHERE league_id = p_league_id;
        INSERT INTO public.player_scoring_cache
          (league_id, player_id, batting_score, pitching_score,
           fielding_score, total_score, career_games, avg_ppg)
        SELECT
          p_league_id, player_id, batting_score, pitching_score,
          fielding_score, total_score, career_games, avg_ppg
        FROM public.compute_career_scores(p_league_id);
      END IF;
    END;
    $$;

    ALTER TABLE public.player_scoring_cache
      DROP COLUMN IF EXISTS batting_ppg,
      DROP COLUMN IF EXISTS pitching_ppg,
      DROP COLUMN IF EXISTS fielding_ppg;
  `);
};
