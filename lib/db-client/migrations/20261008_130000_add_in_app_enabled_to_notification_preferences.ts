import type { SQLWrapper } from 'drizzle-orm';

type MigrationDb = { execute: (query: SQLWrapper | string) => Promise<unknown> };

/**
 * Migration: add `in_app_enabled` to notification_preferences (LS-7090).
 *
 * The in-app inbox (/notifications) previously had no opt-out of its own — it
 * was populated whenever push delivery ran. A separate channel flag lets users
 * toggle in-app, push, and email independently. Defaults to true so existing
 * users keep receiving inbox entries.
 *
 * Idempotent: IF NOT EXISTS / IF EXISTS guards.
 */
export const up = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`
    ALTER TABLE notification_preferences
      ADD COLUMN IF NOT EXISTS in_app_enabled BOOLEAN NOT NULL DEFAULT true
  `);
};

export const down = async ({ db }: { db: MigrationDb }) => {
  await db.execute(`
    ALTER TABLE notification_preferences
      DROP COLUMN IF EXISTS in_app_enabled
  `);
};
