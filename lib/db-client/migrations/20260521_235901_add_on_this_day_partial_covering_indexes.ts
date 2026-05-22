import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Partial covering expression indexes for the "on this day"
 * highlights queries on game_batting and game_pitching (LS-4691).
 *
 * Problem:
 *   pg_stat_statements (dev RDS, snapshot 2026-05-21) showed:
 *     queryid -5802016805995432485 (game_batting) — 1,947 s total · 1,482 ms mean · 1,314 calls
 *     queryid -183285079424058842 (game_pitching) —   836 s total ·   636 ms mean · 1,314 calls
 *
 *   These are produced by StatisticsService.getOnThisDay, which filters by
 *   SUBSTRING(game_identifier, 8, 2) (month) and SUBSTRING(game_identifier, 10, 2) (day)
 *   plus a "notable performance" predicate, then joins to players. Without an
 *   index covering the substring expressions the planner falls back to a
 *   Parallel Seq Scan of game_batting (757k rows / 264 MB) and game_pitching
 *   (142k rows / 52 MB), confirmed via EXPLAIN ANALYZE.
 *
 * Fix:
 *   Create a partial expression index per table keyed on the (month, day)
 *   substrings of game_identifier, with the "notable" filter as the partial
 *   predicate and the projected columns as INCLUDE so the planner can serve
 *   the whole query as an index-only scan. The partial predicate keeps the
 *   index small — only rows meeting the highlight thresholds are stored.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS game_batting_notable_on_this_day_idx
      ON game_batting (
        (SUBSTRING(game_identifier, 8, 2)),
        (SUBSTRING(game_identifier, 10, 2))
      )
      INCLUDE (player_id, season, game_identifier, hr, rbi, h, doubles, triples, ab, bb, r)
      WHERE hr > 0 OR h >= 3 OR rbi >= 4;
  `);

  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS game_pitching_notable_on_this_day_idx
      ON game_pitching (
        (SUBSTRING(game_identifier, 8, 2)),
        (SUBSTRING(game_identifier, 10, 2))
      )
      INCLUDE (player_id, season, game_identifier, so, ip, er, h, bb, sv, w)
      WHERE so >= 10 OR (ip >= 7 AND COALESCE(er, 1) = 0) OR sv > 0;
  `);

  // Refresh the visibility map so the planner is immediately willing to use
  // index-only scans. Without this, the first few minutes/hours of queries
  // still incur heap fetches and the perf win is not realized until autovacuum
  // catches up.
  await db.execute(`VACUUM ANALYZE game_batting;`);
  await db.execute(`VACUUM ANALYZE game_pitching;`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS game_batting_notable_on_this_day_idx;
  `);
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS game_pitching_notable_on_this_day_idx;
  `);
};
