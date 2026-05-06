import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add apple_last_notification_type to app_internal.subscriptions (LS-2625)
 *
 * Purpose:
 * - Apple App Store Server Notifications can downgrade a subscription for
 *   materially different reasons. REFUND means the user was refunded; REVOKE
 *   means Apple forcibly revoked access.
 * - Persisting the latest Apple notification type on the subscription row gives
 *   support and analytics a lightweight audit trail without requiring log access.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    ADD COLUMN IF NOT EXISTS apple_last_notification_type TEXT;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    DROP COLUMN IF EXISTS apple_last_notification_type;
  `);
};
