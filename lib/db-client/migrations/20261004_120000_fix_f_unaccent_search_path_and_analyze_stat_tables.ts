import type { SQLWrapper } from 'drizzle-orm';

type MigrationDb = { execute: (query: SQLWrapper | string) => Promise<unknown> };

/**
 * Migration: Make f_unaccent() search_path-safe and refresh planner stats on
 * the season stat tables, player_facts and players (LS-10554).
 *
 * Root cause 1 — players never autoanalyzes (also the unexplained LS-9485):
 *   f_unaccent(text) (migration 20260614_060000) is a SQL function whose body
 *   calls `unaccent('unaccent', $1)` unqualified. It backs two expression
 *   indexes on players (idx_players_unaccent_{first,last}_name_football), and
 *   ANALYZE evaluates index expressions to build their stats. Autovacuum
 *   workers run with an empty search_path, so autoanalyze of players fails
 *   with `function unaccent(unknown, text) does not exist` on every attempt.
 *   Plain VACUUM never evaluates the expression, which is why autovacuum kept
 *   succeeding while autoanalyze stalled at 2026-06-05 (reproduced on dev:
 *   `SET search_path = ''; SELECT public.f_unaccent('x')` raises that error).
 *   LS-9485's tighter analyze thresholds could not help — the analyze itself
 *   errors. Fix: schema-qualify the call and the dictionary. Output is
 *   byte-identical (verified across every players row on dev), so the existing
 *   indexes stay valid without a REINDEX, and the function stays an inlinable
 *   IMMUTABLE SQL function.
 *
 * Root cause 2 — season_batting / season_fielding / season_pitching /
 * player_facts show no vacuum/analyze history and n_live_tup = 0:
 *   The cumulative statistics system was reset on dev at 2026-05-06 03:05 UTC
 *   (pg_stat_bgwriter/archiver/io/wal stats_reset). These tables are only
 *   written by the bref career-stats loader and the player-facts seed, neither
 *   of which has run since, so their pgstat counters (n_live_tup,
 *   n_mod_since_analyze, n_ins_since_vacuum) stayed at zero. Autovacuum decides
 *   purely from those counters, so it never revisits the tables. The catalog
 *   stats (pg_statistic, relallvisible) survive from the last pre-reset
 *   VACUUM ANALYZE, but are stale: columns added since (season_batting.dwar,
 *   season_fielding.drs/uzr/oaa) have no stats, and only ~half of
 *   season_batting's pages are all-visible, so its index-only scans pay heap
 *   fetches. Fix: VACUUM ANALYZE them here; the loaders now ANALYZE after each
 *   bulk run so this does not recur.
 *
 * The migration runner executes each statement in autocommit (no wrapping
 * transaction — see scripts/migration-runner.ts), so VACUUM is allowed here,
 * as in 20260521_235901_add_on_this_day_partial_covering_indexes.
 */

export const up = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`
    CREATE OR REPLACE FUNCTION public.f_unaccent(text)
      RETURNS text
      LANGUAGE sql IMMUTABLE STRICT
    AS $$
      SELECT public.unaccent('public.unaccent'::regdictionary, $1)
    $$
  `);

  await db.execute(`
    VACUUM ANALYZE public.season_batting, public.season_fielding,
      public.season_pitching, public.player_facts
  `);
  await db.execute(`ANALYZE public.players`);
};

export const down = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`
    CREATE OR REPLACE FUNCTION public.f_unaccent(text)
      RETURNS text
      LANGUAGE sql IMMUTABLE STRICT
    AS $$
      SELECT unaccent('unaccent', $1)
    $$
  `);
};
