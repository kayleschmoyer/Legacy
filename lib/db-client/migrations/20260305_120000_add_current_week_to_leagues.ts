import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add current_week to leagues
 *
 * Purpose:
 * - The leagues.current_matchup column stores a single matchup ID to represent
 *   "the current active week", but a league has one matchup *per team pair* each
 *   week. Pointing to one arbitrary matchup ID is semantically wrong.
 * - This migration adds current_week (an integer week number) as the canonical
 *   source of truth for which week a league is playing.
 * - Existing data is backfilled from the matchup record referenced by
 *   current_matchup so there is no data loss.
 * - current_matchup is left in place and will be removed in a follow-up cleanup
 *   migration once all code references are gone.
 *
 * Changes:
 * - ADD COLUMN leagues.current_week INTEGER
 * - Backfill from matchups.week_number via current_matchup FK
 * - ADD INDEX leagues_current_week_idx
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues ADD COLUMN IF NOT EXISTS current_week INTEGER;
  `);

  // Backfill: derive the week number from the matchup currently referenced
  await db.execute(`
    UPDATE leagues l
    SET current_week = m.week_number
    FROM matchups m
    WHERE l.current_matchup = m.id
      AND l.current_week IS NULL;
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS leagues_current_week_idx
      ON leagues USING btree (current_week)
      WHERE current_week IS NOT NULL;
  `);

  console.log('    ✓ leagues.current_week added and backfilled');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP INDEX IF EXISTS leagues_current_week_idx;`);
  await db.execute(`ALTER TABLE leagues DROP COLUMN IF EXISTS current_week;`);
};
