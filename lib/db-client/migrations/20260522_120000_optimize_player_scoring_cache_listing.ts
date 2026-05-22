import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Optimize player_scoring_cache for the player listing query (LS-4688)
 *
 * The player listing endpoint joins player_scoring_cache twice (league-specific +
 * default) and recomputes (batting+fielding)/career_games and pitching/career_games
 * for every row in the projection — burning ~600 ms mean across ~18k calls per
 * snapshot of pg_stat_statements.
 *
 * Changes:
 * - Adds stored hitter_avg_ppg and pitching_avg_ppg columns so the SELECT is a
 *   column read instead of per-row arithmetic.
 * - Updates refresh_player_scoring_cache() to populate the new columns.
 * - Replaces the partial unique indexes with covering INCLUDE indexes so the
 *   per-player lookup can be served as an index-only scan (no heap fetch).
 * - Backfills existing rows in-place from the source columns (cheap UPDATE — no
 *   need to recompute via compute_career_scores()).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.player_scoring_cache
      ADD COLUMN hitter_avg_ppg   NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN pitching_avg_ppg NUMERIC NOT NULL DEFAULT 0;

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
           batting_ppg, pitching_ppg, fielding_ppg,
           hitter_avg_ppg, pitching_avg_ppg)
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
               THEN ROUND(cs.fielding_score / cf.g, 6) ELSE 0 END,
          CASE WHEN cs.career_games > 0
               THEN ROUND((cs.batting_score + cs.fielding_score) / cs.career_games, 6)
               ELSE 0 END,
          CASE WHEN cs.career_games > 0
               THEN ROUND(cs.pitching_score / cs.career_games, 6)
               ELSE 0 END
        FROM public.compute_career_scores(NULL) cs
        LEFT JOIN public.career_batting  cb ON cb.player_id = cs.player_id
        LEFT JOIN public.career_pitching cp ON cp.player_id = cs.player_id
        LEFT JOIN public.career_fielding cf ON cf.player_id = cs.player_id;
      ELSE
        DELETE FROM public.player_scoring_cache WHERE league_id = p_league_id;
        INSERT INTO public.player_scoring_cache
          (league_id, player_id, batting_score, pitching_score,
           fielding_score, total_score, career_games, avg_ppg,
           batting_ppg, pitching_ppg, fielding_ppg,
           hitter_avg_ppg, pitching_avg_ppg)
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
               THEN ROUND(cs.fielding_score / cf.g, 6) ELSE 0 END,
          CASE WHEN cs.career_games > 0
               THEN ROUND((cs.batting_score + cs.fielding_score) / cs.career_games, 6)
               ELSE 0 END,
          CASE WHEN cs.career_games > 0
               THEN ROUND(cs.pitching_score / cs.career_games, 6)
               ELSE 0 END
        FROM public.compute_career_scores(p_league_id) cs
        LEFT JOIN public.career_batting  cb ON cb.player_id = cs.player_id
        LEFT JOIN public.career_pitching cp ON cp.player_id = cs.player_id
        LEFT JOIN public.career_fielding cf ON cf.player_id = cs.player_id;
      END IF;
    END;
    $$;

    -- Backfill the new columns in-place for existing rows (avoids re-running
    -- compute_career_scores for every league-specific cache row).
    UPDATE public.player_scoring_cache
       SET hitter_avg_ppg = CASE WHEN career_games > 0
              THEN ROUND((batting_score + fielding_score) / career_games, 6)
              ELSE 0 END,
           pitching_avg_ppg = CASE WHEN career_games > 0
              THEN ROUND(pitching_score / career_games, 6)
              ELSE 0 END;

    -- Replace the partial unique indexes with covering equivalents so the
    -- per-player lookup from the listing query can be served as an index-only
    -- scan (no heap fetch for the score columns).
    DROP INDEX IF EXISTS public.player_scoring_cache_default_uidx;
    DROP INDEX IF EXISTS public.player_scoring_cache_league_uidx;

    CREATE UNIQUE INDEX player_scoring_cache_default_uidx
      ON public.player_scoring_cache (player_id)
      INCLUDE (batting_score, pitching_score, fielding_score, total_score,
               career_games, avg_ppg, batting_ppg, pitching_ppg, fielding_ppg,
               hitter_avg_ppg, pitching_avg_ppg)
      WHERE league_id IS NULL;

    CREATE UNIQUE INDEX player_scoring_cache_league_uidx
      ON public.player_scoring_cache (league_id, player_id)
      INCLUDE (batting_score, pitching_score, fielding_score, total_score,
               career_games, avg_ppg, batting_ppg, pitching_ppg, fielding_ppg,
               hitter_avg_ppg, pitching_avg_ppg)
      WHERE league_id IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    -- Restore the non-covering partial unique indexes
    DROP INDEX IF EXISTS public.player_scoring_cache_default_uidx;
    DROP INDEX IF EXISTS public.player_scoring_cache_league_uidx;

    CREATE UNIQUE INDEX player_scoring_cache_default_uidx
      ON public.player_scoring_cache (player_id)
      WHERE league_id IS NULL;

    CREATE UNIQUE INDEX player_scoring_cache_league_uidx
      ON public.player_scoring_cache (league_id, player_id)
      WHERE league_id IS NOT NULL;

    -- Restore the previous refresh function (without hitter_avg_ppg /
    -- pitching_avg_ppg columns).
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

    ALTER TABLE public.player_scoring_cache
      DROP COLUMN IF EXISTS hitter_avg_ppg,
      DROP COLUMN IF EXISTS pitching_avg_ppg;
  `);
};
