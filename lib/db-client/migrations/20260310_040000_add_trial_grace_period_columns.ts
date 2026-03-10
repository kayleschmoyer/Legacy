import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add trial and grace period tracking columns to subscriptions table
 *
 * Purpose:
 * - Track when a subscription trial ends so the UI can display a countdown
 * - Track grace period end for past_due subscriptions so users retain premium
 *   access while payment retries are in progress (LS-844)
 *
 * Changes:
 * - Add trial_ends_at TIMESTAMPTZ to app_internal.subscriptions
 *   (populated from Stripe subscription.trial_end on checkout/subscription events)
 * - Add grace_period_ends_at TIMESTAMPTZ to app_internal.subscriptions
 *   (set to now() + STRIPE_GRACE_PERIOD_DAYS on first invoice.payment_failed)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    DROP COLUMN IF EXISTS trial_ends_at,
    DROP COLUMN IF EXISTS grace_period_ends_at;
  `);
};
