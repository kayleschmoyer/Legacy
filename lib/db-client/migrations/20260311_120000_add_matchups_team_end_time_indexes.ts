import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add composite (team_id, end_time) indexes on matchups
 *
 * Purpose:
 * - getWinStreakMatchupsForTeam queries matchups with:
 *     WHERE (team1_id = $1 OR team2_id = $1) AND status = 'completed'
 *     ORDER BY end_time DESC LIMIT 50
 * - Without composite indexes the query must sort all rows for that team.
 * - These indexes allow Postgres to use an index scan with the ORDER BY
 *   already satisfied, avoiding a filesort on large leagues.
 *
 * Changes:
 * - CREATE INDEX matchups_team1_id_end_time_idx ON matchups (team1_id, end_time)
 *   WHERE status = 'completed'
 * - CREATE INDEX matchups_team2_id_end_time_idx ON matchups (team2_id, end_time)
 *   WHERE status = 'completed'
 *
 * Note: CONCURRENTLY is safe here because the migration runner does NOT wrap
 * individual migrations in a transaction.
 *
 * Partial indexes (WHERE status = 'completed') keep the index smaller and
 * more selective since the query always filters on that status.  Postgres can
 * scan a btree index backwards, so omitting DESC still satisfies
 * ORDER BY end_time DESC without a sort step.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS matchups_team1_id_end_time_idx
      ON public.matchups (team1_id, end_time)
      WHERE status = 'completed';
  `);
  await db.execute(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS matchups_team2_id_end_time_idx
      ON public.matchups (team2_id, end_time)
      WHERE status = 'completed';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS matchups_team1_id_end_time_idx;
  `);
  await db.execute(`
    DROP INDEX CONCURRENTLY IF EXISTS matchups_team2_id_end_time_idx;
  `);
};
