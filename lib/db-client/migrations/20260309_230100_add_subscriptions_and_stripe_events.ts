import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add subscriptions, stripe_events tables and users.subscription_tier column
 *
 * Purpose:
 * - Track Stripe subscription state for users
 * - Log processed Stripe webhook events for idempotency
 * - Provide denormalized subscription_tier on users for fast resolver checks
 *
 * Changes:
 * - Create app_internal.subscriptions table
 * - Create app_internal.stripe_events table
 * - Add subscription_tier column to app_internal.users
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create subscriptions table
  await db.execute(`
    CREATE TABLE app_internal.subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT NOT NULL,
      stripe_subscription_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inactive',
      tier TEXT NOT NULL DEFAULT 'free',
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT subscriptions_stripe_customer_id_uk UNIQUE (stripe_customer_id),
      CONSTRAINT subscriptions_stripe_subscription_id_uk UNIQUE (stripe_subscription_id)
    );
  `);

  // Index for user lookups
  await db.execute(`
    CREATE INDEX subscriptions_user_id_idx ON app_internal.subscriptions(user_id);
  `);

  // Auto-update updated_at trigger
  await db.execute(`
    CREATE TRIGGER subscriptions_updated_at_trigger
    BEFORE UPDATE ON app_internal.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // 2. Create stripe_events idempotency table
  await db.execute(`
    CREATE TABLE app_internal.stripe_events (
      event_id TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 3. Add subscription_tier to users
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.users DROP COLUMN IF EXISTS subscription_tier;
  `);

  await db.execute(`
    DROP TABLE IF EXISTS app_internal.stripe_events;
  `);

  await db.execute(`
    DROP TRIGGER IF EXISTS subscriptions_updated_at_trigger ON app_internal.subscriptions;
    DROP TABLE IF EXISTS app_internal.subscriptions;
  `);
};
