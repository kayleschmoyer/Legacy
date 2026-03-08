import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add player_scoring_cache table
 *
 * Purpose:
 * - Eliminate the 7-13 second compute_career_scores() call on every
 *   player browse / search / draft-pool request (LS-696).
 *
 * Changes:
 * - Creates player_scoring_cache table (one row per player per league,
 *   league_id = NULL for default scoring).
 * - Adds partial unique indexes for fast lookups.
 * - Creates refresh_player_scoring_cache(p_league_id) PL/pgSQL function
 *   that populates the table from compute_career_scores().
 * - Performs an initial population using NULL (default) scoring
 *   so queries work immediately after migration.
 *
 * Refresh triggers (in application code):
 * - After career stat materialized view refresh (stats loads) → NULL league
 * - When a league's scoring profile is edited → that league_id
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE public.player_scoring_cache (
      league_id      INTEGER,
      player_id      INTEGER      NOT NULL,
      batting_score  NUMERIC      NOT NULL DEFAULT 0,
      pitching_score NUMERIC      NOT NULL DEFAULT 0,
      fielding_score NUMERIC      NOT NULL DEFAULT 0,
      total_score    NUMERIC      NOT NULL DEFAULT 0,
      career_games   BIGINT       NOT NULL DEFAULT 0,
      avg_ppg        NUMERIC      NOT NULL DEFAULT 0,
      computed_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    -- Fast lookup for default (NULL league_id) rows
    CREATE UNIQUE INDEX player_scoring_cache_default_uidx
      ON public.player_scoring_cache (player_id)
      WHERE league_id IS NULL;

    -- Fast lookup for league-specific rows
    CREATE UNIQUE INDEX player_scoring_cache_league_uidx
      ON public.player_scoring_cache (league_id, player_id)
      WHERE league_id IS NOT NULL;

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

    -- Initial population: default (NULL) scoring for all players
    SELECT public.refresh_player_scoring_cache(NULL);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP FUNCTION IF EXISTS public.refresh_player_scoring_cache(INTEGER);
    DROP INDEX IF EXISTS public.player_scoring_cache_league_uidx;
    DROP INDEX IF EXISTS public.player_scoring_cache_default_uidx;
    DROP TABLE IF EXISTS public.player_scoring_cache;
  `);
};
