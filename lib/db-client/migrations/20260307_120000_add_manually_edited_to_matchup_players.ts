import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add manually_edited flag to matchup_players
 *
 * Purpose:
 * - Track which matchup player position slots were explicitly set via the
 *   matchup lineup editor (vs. seeded from team_members at matchup creation).
 * - When a My Roster change is made, the sync logic propagates the new
 *   positionId to ALL future matchup weeks — but skips any row where
 *   manually_edited = true, so user-intentional future-week edits are
 *   preserved.
 *
 * Changes:
 * - matchup_players.manually_edited BOOLEAN NOT NULL DEFAULT false
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE matchup_players
      ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN NOT NULL DEFAULT false;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE matchup_players
      DROP COLUMN IF EXISTS manually_edited;
  `);
};
