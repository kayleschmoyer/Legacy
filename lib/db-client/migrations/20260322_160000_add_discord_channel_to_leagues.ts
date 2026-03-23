import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add Discord server and channel columns to leagues
 *
 * Purpose:
 * - discord_guild_id: the Discord server linked to this league
 * - discord_channel_id: the auto-created text channel for league discussion
 * - discord_category_id: optional category to create channels under
 * - discord_webhook_url: optional webhook URL for sending messages to the channel
 * - (LS-1681: Auto-create Discord channels per league)
 */

export const up = async ({
  db,
}: {
  db: PgDatabase<Record<string, unknown>>;
}): Promise<void> => {
  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT,
    ADD COLUMN IF NOT EXISTS discord_guild_id VARCHAR(32),
    ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(32),
    ADD COLUMN IF NOT EXISTS discord_category_id VARCHAR(32);
  `);
};

export const down = async ({
  db,
}: {
  db: PgDatabase<Record<string, unknown>>;
}): Promise<void> => {
  await db.execute(`
    ALTER TABLE leagues
    DROP COLUMN IF EXISTS discord_webhook_url,
    DROP COLUMN IF EXISTS discord_guild_id,
    DROP COLUMN IF EXISTS discord_channel_id,
    DROP COLUMN IF EXISTS discord_category_id;
  `);
};
