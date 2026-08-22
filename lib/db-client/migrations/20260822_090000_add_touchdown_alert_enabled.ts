import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Add touchdown_alert_enabled to notification_preferences (LS-6360).
 *
 * Powers the new TD_ALERT push notification trigger — a premium user opts in
 * to being notified when a rostered player scores a touchdown. Defaults to
 * false (opt-in), unlike the existing matchup_* columns which default true.
 */
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE notification_preferences
      ADD COLUMN IF NOT EXISTS touchdown_alert_enabled BOOLEAN NOT NULL DEFAULT false
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE notification_preferences
      DROP COLUMN IF EXISTS touchdown_alert_enabled
  `);
};
