import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add last_event_timestamp to app_internal.subscriptions (LS-2613)
 *
 * Purpose:
 * - Detect out-of-order Stripe webhook delivery so a stale
 *   customer.subscription.updated cannot overwrite newer state.
 *
 * Changes:
 * - Adds nullable BIGINT last_event_timestamp column. NULL means the row has
 *   not yet seen a guarded event — the first event through will initialize it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    ADD COLUMN IF NOT EXISTS last_event_timestamp BIGINT;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    DROP COLUMN IF EXISTS last_event_timestamp;
  `);
};
