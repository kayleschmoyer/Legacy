import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add dedupe column for Discord lineup reminders
 *
 * Purpose:
 * - discord_last_reminder_matchup_id: tracks the last matchup for which a
 *   Discord reminder was sent, preventing duplicate notifications on
 *   successive hourly EventBridge runs.
 * - (LS-1683: Discord lineup lock reminders)
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('Adding discord_last_reminder_matchup_id to leagues...');

  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS discord_last_reminder_matchup_id INTEGER;
  `);

  console.log('discord_last_reminder_matchup_id added to leagues');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE leagues
    DROP COLUMN IF EXISTS discord_last_reminder_matchup_id;
  `);
};
