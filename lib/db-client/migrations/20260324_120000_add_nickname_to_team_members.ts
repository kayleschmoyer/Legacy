import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add nickname column to team_members
 *
 * Purpose:
 * - Allows users to assign optional custom nicknames to players on their roster.
 * - Nicknames are per-roster (per team_member), so different leagues can have
 *   different nicknames for the same player.
 * - (LS-1813: Allow adding nicknames to players on a roster)
 */

export const up = async ({
  db,
}: {
  db: PgDatabase<Record<string, unknown>>;
}): Promise<void> => {
  await db.execute(`
    ALTER TABLE team_members
    ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
  `);
};

export const down = async ({
  db,
}: {
  db: PgDatabase<Record<string, unknown>>;
}): Promise<void> => {
  await db.execute(`
    ALTER TABLE team_members
    DROP COLUMN IF EXISTS nickname;
  `);
};
