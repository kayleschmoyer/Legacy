import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add Discord webhook URL and reminder settings to leagues
 *
 * Purpose:
 * - discord_webhook_url: per-league Discord webhook for notifications
 * - discord_reminder_hours: hours before matchup lock to send lineup reminder (default: 3)
 * - (LS-1683: Discord lineup lock reminders)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Adding Discord reminder columns to leagues...');

  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT,
    ADD COLUMN IF NOT EXISTS discord_reminder_hours INTEGER NOT NULL DEFAULT 3;
  `);

  console.log('✅ Discord reminder columns added to leagues');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE leagues
    DROP COLUMN IF EXISTS discord_webhook_url,
    DROP COLUMN IF EXISTS discord_reminder_hours;
  `);
};
