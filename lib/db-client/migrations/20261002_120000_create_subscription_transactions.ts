import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create app_internal.subscription_transactions ledger (LS-10396)
 *
 * Purpose:
 * - Append-only record of billing events (one row per provider event) so
 *   amount/currency and refund/dispute history are not lost when the mutable
 *   subscriptions row is overwritten.
 *
 * Changes:
 * - Creates subscription_transaction_provider enum (stripe, apple, google)
 * - Creates subscription_transaction_event_type enum
 *   (payment_succeeded, payment_failed, refund, dispute_created)
 * - Creates app_internal.subscription_transactions with FK to subscriptions
 *   (cascade delete) and a unique provider_event_id for webhook idempotency
 * - Adds index on subscription_id
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Enums (guarded so a partial prior run can be re-applied)
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.subscription_transaction_provider AS ENUM (
        'stripe',
        'apple',
        'google'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE app_internal.subscription_transaction_event_type AS ENUM (
        'payment_succeeded',
        'payment_failed',
        'refund',
        'dispute_created'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.subscription_transactions (
      id SERIAL PRIMARY KEY,
      subscription_id INTEGER NOT NULL REFERENCES app_internal.subscriptions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES app_internal.users(id) ON DELETE CASCADE,
      provider app_internal.subscription_transaction_provider NOT NULL,
      event_type app_internal.subscription_transaction_event_type NOT NULL,
      amount_cents INTEGER,
      currency TEXT,
      provider_event_id TEXT NOT NULL,
      occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT subscription_transactions_provider_event_id_uk UNIQUE (provider_event_id)
    );
  `);

  // 3. Index
  await db.execute(`
    CREATE INDEX IF NOT EXISTS subscription_transactions_subscription_id_idx
      ON app_internal.subscription_transactions(subscription_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS app_internal.subscription_transactions;
    DROP TYPE IF EXISTS app_internal.subscription_transaction_event_type;
    DROP TYPE IF EXISTS app_internal.subscription_transaction_provider;
  `);
};
