import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add scheduledAt to drafts table
 *
 * Purpose:
 * - Supports LS-423: schedule drafts in advance so they auto-start at a set time.
 * - Commissioners can set a scheduled_at timestamp from the settings page.
 * - EventBridge fires the autoStartScheduledDrafts mutation every minute to
 *   start any draft whose scheduled_at has arrived.
 * - The draft room opens for early joining 30 minutes before the scheduled start.
 *
 * Changes:
 * - Add nullable `scheduled_at TIMESTAMP WITH TIME ZONE` to drafts table.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE drafts
      ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE drafts DROP COLUMN IF EXISTS scheduled_at;
  `);
};
