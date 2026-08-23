import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add football_player_scoring_cache (LS-9484)
 *
 * Football's `player_scoring_cache` equivalent. Deliberately a SEPARATE table
 * rather than new columns on `player_scoring_cache`: that table's existing
 * refresh function (`refresh_player_scoring_cache`) does a blanket
 * DELETE + re-INSERT covering every row in `public.players` (both sports) on
 * every baseball stat load / scoring edit — reusing the same table would mean
 * every baseball-triggered refresh silently zeroes out football's columns
 * moments after this function populates them, since the baseball INSERT's
 * column list never mentions them. A separate table sidesteps that risk
 * entirely instead of touching the existing, load-bearing baseball refresh
 * path (LS-696/LS-902/LS-4688).
 *
 * Mirrors compute_career_scores()/refresh_player_scoring_cache()/
 * player_scoring_cache exactly, scoped to `players.sport = 'football'` and to
 * the football scoring stat groups (passing, rushing, receiving, kicking,
 * defense, idp) seeded by LS-251 against the football career aggregate
 * tables from LS-9478.
 *
 * Team-defense (DST) points-allowed-band stats (defense_pts_band_*, 7 rows in
 * scoring_stat_definitions) are intentionally NOT scored here: their
 * multiplier resolves like any other stat, but `career_football_defense` has
 * no per-band count column to multiply against (only a `pts_allowed_per_g`
 * rate) — banding is only meaningful at the game/week level, not summed over
 * a career. `career_football_defense` is also empty in production today
 * (LS-9475 postmortem: DST has no ingested data), so this is a safe no-op
 * rather than a new failure mode. Filed as a follow-up alongside team-defense
 * ingest, not part of this ticket's scope.
 *
 * Refresh triggers (in application code, this PR):
 * - When a football league's scoring profile or position bonuses are edited
 *   → refreshFootballPlayerScoringCache(db, leagueId) (scoring.ts)
 * There is no recurring football stats-ingest job yet (unlike baseball's
 * load-career.ts) — career_football_* tables are currently populated by
 * one-off migrations (LS-9478). Wiring a `refreshFootballPlayerScoringCache(db,
 * null)` call into that job is follow-up work for whenever it exists.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE public.football_player_scoring_cache (
      league_id       INTEGER,
      player_id       INTEGER      NOT NULL,
      passing_score   NUMERIC      NOT NULL DEFAULT 0,
      rushing_score   NUMERIC      NOT NULL DEFAULT 0,
      receiving_score NUMERIC      NOT NULL DEFAULT 0,
      kicking_score   NUMERIC      NOT NULL DEFAULT 0,
      defense_score   NUMERIC      NOT NULL DEFAULT 0,
      idp_score       NUMERIC      NOT NULL DEFAULT 0,
      total_score     NUMERIC      NOT NULL DEFAULT 0,
      career_games    BIGINT       NOT NULL DEFAULT 0,
      avg_ppg         NUMERIC      NOT NULL DEFAULT 0,
      computed_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX football_player_scoring_cache_default_uidx
      ON public.football_player_scoring_cache (player_id)
      INCLUDE (passing_score, rushing_score, receiving_score, kicking_score,
               defense_score, idp_score, total_score, career_games, avg_ppg)
      WHERE league_id IS NULL;

    CREATE UNIQUE INDEX football_player_scoring_cache_league_uidx
      ON public.football_player_scoring_cache (league_id, player_id)
      INCLUDE (passing_score, rushing_score, receiving_score, kicking_score,
               defense_score, idp_score, total_score, career_games, avg_ppg)
      WHERE league_id IS NOT NULL;

    CREATE OR REPLACE FUNCTION public.compute_career_football_scores(p_league_id INTEGER DEFAULT NULL)
    RETURNS TABLE (
        player_id       INTEGER,
        passing_score   NUMERIC,
        rushing_score   NUMERIC,
        receiving_score NUMERIC,
        kicking_score   NUMERIC,
        defense_score   NUMERIC,
        idp_score       NUMERIC,
        total_score     NUMERIC,
        career_games    BIGINT,
        avg_ppg         NUMERIC
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

    pass_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'yds'    THEN multiplier END), 0) AS yds,
            COALESCE(MAX(CASE WHEN source_column = 'td'     THEN multiplier END), 0) AS td,
            COALESCE(MAX(CASE WHEN source_column = 'int'    THEN multiplier END), 0) AS int,
            COALESCE(MAX(CASE WHEN source_column = 'sacked' THEN multiplier END), 0) AS sacked
        FROM effective_multipliers WHERE stat_group = 'passing'
    ),
    rush_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'yds'     THEN multiplier END), 0) AS yds,
            COALESCE(MAX(CASE WHEN source_column = 'td'      THEN multiplier END), 0) AS td,
            COALESCE(MAX(CASE WHEN source_column = 'fumbles' THEN multiplier END), 0) AS fumbles
        FROM effective_multipliers WHERE stat_group = 'rushing'
    ),
    rec_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'rec'     THEN multiplier END), 0) AS rec,
            COALESCE(MAX(CASE WHEN source_column = 'yds'     THEN multiplier END), 0) AS yds,
            COALESCE(MAX(CASE WHEN source_column = 'td'      THEN multiplier END), 0) AS td,
            COALESCE(MAX(CASE WHEN source_column = 'fumbles' THEN multiplier END), 0) AS fumbles
        FROM effective_multipliers WHERE stat_group = 'receiving'
    ),
    kick_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'fgm'    THEN multiplier END), 0) AS fgm,
            COALESCE(MAX(CASE WHEN source_column = 'fg_50m' THEN multiplier END), 0) AS fg_50m,
            COALESCE(MAX(CASE WHEN source_column = 'xpm'    THEN multiplier END), 0) AS xpm
        FROM effective_multipliers WHERE stat_group = 'kicking'
    ),
    -- Team-defense (DST) flat stats only — see migration header re: points-
    -- allowed bands, which have no career-aggregate column to score against.
    def_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'sacks'       THEN multiplier END), 0) AS sacks,
            COALESCE(MAX(CASE WHEN source_column = 'int'         THEN multiplier END), 0) AS int,
            COALESCE(MAX(CASE WHEN source_column = 'fumbles_rec' THEN multiplier END), 0) AS fumbles_rec,
            COALESCE(MAX(CASE WHEN source_column = 'def_td'      THEN multiplier END), 0) AS def_td,
            COALESCE(MAX(CASE WHEN source_column = 'safeties'    THEN multiplier END), 0) AS safeties
        FROM effective_multipliers WHERE stat_group = 'defense'
    ),
    idp_m AS (
        SELECT
            COALESCE(MAX(CASE WHEN source_column = 'solo_tkl' THEN multiplier END), 0) AS solo_tkl,
            COALESCE(MAX(CASE WHEN source_column = 'ast_tkl'  THEN multiplier END), 0) AS ast_tkl,
            COALESCE(MAX(CASE WHEN source_column = 'sacks'    THEN multiplier END), 0) AS sacks,
            COALESCE(MAX(CASE WHEN source_column = 'int'      THEN multiplier END), 0) AS int,
            COALESCE(MAX(CASE WHEN source_column = 'pd'       THEN multiplier END), 0) AS pd,
            COALESCE(MAX(CASE WHEN source_column = 'ff'       THEN multiplier END), 0) AS ff,
            COALESCE(MAX(CASE WHEN source_column = 'fr'       THEN multiplier END), 0) AS fr,
            COALESCE(MAX(CASE WHEN source_column = 'def_td'   THEN multiplier END), 0) AS def_td,
            COALESCE(MAX(CASE WHEN source_column = 'safeties' THEN multiplier END), 0) AS safeties
        FROM effective_multipliers WHERE stat_group = 'idp'
    ),

    pass_scores AS (
        SELECT cp.player_id,
            (COALESCE(cp.yds, 0) * m.yds + COALESCE(cp.td, 0) * m.td
             + COALESCE(cp.int, 0) * m.int + COALESCE(cp.sacked, 0) * m.sacked)::NUMERIC AS score,
            COALESCE(cp.g, 0) AS games
        FROM public.career_football_passing cp CROSS JOIN pass_m m
    ),
    rush_scores AS (
        SELECT cr.player_id,
            (COALESCE(cr.yds, 0) * m.yds + COALESCE(cr.td, 0) * m.td
             + COALESCE(cr.fumbles, 0) * m.fumbles)::NUMERIC AS score,
            COALESCE(cr.g, 0) AS games
        FROM public.career_football_rushing cr CROSS JOIN rush_m m
    ),
    rec_scores AS (
        SELECT cc.player_id,
            (COALESCE(cc.rec, 0) * m.rec + COALESCE(cc.yds, 0) * m.yds + COALESCE(cc.td, 0) * m.td
             + COALESCE(cc.fumbles, 0) * m.fumbles)::NUMERIC AS score,
            COALESCE(cc.g, 0) AS games
        FROM public.career_football_receiving cc CROSS JOIN rec_m m
    ),
    kick_scores AS (
        SELECT ck.player_id,
            (COALESCE(ck.fgm, 0) * m.fgm + COALESCE(ck.fg_50m, 0) * m.fg_50m
             + COALESCE(ck.xpm, 0) * m.xpm)::NUMERIC AS score,
            COALESCE(ck.g, 0) AS games
        FROM public.career_football_kicking ck CROSS JOIN kick_m m
    ),
    def_scores AS (
        SELECT cd.player_id,
            (COALESCE(cd.sacks, 0) * m.sacks + COALESCE(cd.int, 0) * m.int
             + COALESCE(cd.fumbles_rec, 0) * m.fumbles_rec + COALESCE(cd.def_td, 0) * m.def_td
             + COALESCE(cd.safeties, 0) * m.safeties)::NUMERIC AS score,
            COALESCE(cd.g, 0) AS games
        FROM public.career_football_defense cd CROSS JOIN def_m m
    ),
    idp_scores AS (
        SELECT ci.player_id,
            (COALESCE(ci.solo_tkl, 0) * m.solo_tkl + COALESCE(ci.ast_tkl, 0) * m.ast_tkl
             + COALESCE(ci.sacks, 0) * m.sacks + COALESCE(ci.int, 0) * m.int
             + COALESCE(ci.pd, 0) * m.pd + COALESCE(ci.ff, 0) * m.ff + COALESCE(ci.fr, 0) * m.fr
             + COALESCE(ci.def_td, 0) * m.def_td + COALESCE(ci.safeties, 0) * m.safeties)::NUMERIC AS score,
            COALESCE(ci.g, 0) AS games
        FROM public.career_football_defense_idp ci CROSS JOIN idp_m m
    )

    SELECT
        p.id                                                                  AS player_id,
        COALESCE(ps.score, 0)::NUMERIC                                        AS passing_score,
        COALESCE(rus.score, 0)::NUMERIC                                       AS rushing_score,
        COALESCE(rec.score, 0)::NUMERIC                                       AS receiving_score,
        COALESCE(kck.score, 0)::NUMERIC                                       AS kicking_score,
        COALESCE(def.score, 0)::NUMERIC                                       AS defense_score,
        COALESCE(idp.score, 0)::NUMERIC                                       AS idp_score,
        (COALESCE(ps.score, 0) + COALESCE(rus.score, 0) + COALESCE(rec.score, 0)
         + COALESCE(kck.score, 0) + COALESCE(def.score, 0) + COALESCE(idp.score, 0))::NUMERIC AS total_score,
        GREATEST(COALESCE(ps.games, 0), COALESCE(rus.games, 0), COALESCE(rec.games, 0),
                 COALESCE(kck.games, 0), COALESCE(def.games, 0), COALESCE(idp.games, 0))::BIGINT AS career_games,
        CASE
            WHEN GREATEST(COALESCE(ps.games, 0), COALESCE(rus.games, 0), COALESCE(rec.games, 0),
                          COALESCE(kck.games, 0), COALESCE(def.games, 0), COALESCE(idp.games, 0)) > 0
            THEN ROUND(
                (COALESCE(ps.score, 0) + COALESCE(rus.score, 0) + COALESCE(rec.score, 0)
                 + COALESCE(kck.score, 0) + COALESCE(def.score, 0) + COALESCE(idp.score, 0))
                / GREATEST(COALESCE(ps.games, 0), COALESCE(rus.games, 0), COALESCE(rec.games, 0),
                           COALESCE(kck.games, 0), COALESCE(def.games, 0), COALESCE(idp.games, 0)),
                3
            )
            ELSE 0
        END::NUMERIC                                                          AS avg_ppg
    FROM public.players p
    LEFT JOIN pass_scores ps  ON p.id = ps.player_id
    LEFT JOIN rush_scores rus ON p.id = rus.player_id
    LEFT JOIN rec_scores  rec ON p.id = rec.player_id
    LEFT JOIN kick_scores kck ON p.id = kck.player_id
    LEFT JOIN def_scores  def ON p.id = def.player_id
    LEFT JOIN idp_scores  idp ON p.id = idp.player_id
    WHERE p.sport = 'football';
    $fn$;

    CREATE OR REPLACE FUNCTION public.refresh_football_player_scoring_cache(
      p_league_id INTEGER DEFAULT NULL
    )
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF p_league_id IS NULL THEN
        DELETE FROM public.football_player_scoring_cache WHERE league_id IS NULL;
        INSERT INTO public.football_player_scoring_cache
          (league_id, player_id, passing_score, rushing_score, receiving_score,
           kicking_score, defense_score, idp_score, total_score, career_games, avg_ppg)
        SELECT
          NULL, player_id, passing_score, rushing_score, receiving_score,
          kicking_score, defense_score, idp_score, total_score, career_games, avg_ppg
        FROM public.compute_career_football_scores(NULL);
      ELSE
        DELETE FROM public.football_player_scoring_cache WHERE league_id = p_league_id;
        INSERT INTO public.football_player_scoring_cache
          (league_id, player_id, passing_score, rushing_score, receiving_score,
           kicking_score, defense_score, idp_score, total_score, career_games, avg_ppg)
        SELECT
          p_league_id, player_id, passing_score, rushing_score, receiving_score,
          kicking_score, defense_score, idp_score, total_score, career_games, avg_ppg
        FROM public.compute_career_football_scores(p_league_id);
      END IF;
    END;
    $$;

    -- Initial population: default (NULL) scoring for all football players.
    SELECT public.refresh_football_player_scoring_cache(NULL);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP FUNCTION IF EXISTS public.refresh_football_player_scoring_cache(INTEGER);
    DROP FUNCTION IF EXISTS public.compute_career_football_scores(INTEGER);
    DROP INDEX IF EXISTS public.football_player_scoring_cache_league_uidx;
    DROP INDEX IF EXISTS public.football_player_scoring_cache_default_uidx;
    DROP TABLE IF EXISTS public.football_player_scoring_cache;
  `);
};
