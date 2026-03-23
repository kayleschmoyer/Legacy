import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add discord_webhook_url to leagues table
 *
 * Purpose:
 * - Stores a Discord webhook URL per league for real-time notifications
 * - Nullable — leagues without a configured webhook get no Discord notifications
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Adding discord_webhook_url column to leagues...');

  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT;
  `);

  console.log('✅ discord_webhook_url column added to leagues');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE leagues
    DROP COLUMN IF EXISTS discord_webhook_url;
  `);
};
