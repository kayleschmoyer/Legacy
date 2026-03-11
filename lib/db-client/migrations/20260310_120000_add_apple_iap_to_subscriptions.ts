import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add Apple IAP columns to subscriptions
 *
 * Purpose:
 * - Support iOS in-app purchase subscriptions via StoreKit 2 alongside
 *   the existing Stripe subscription flow.
 * - Apple requires all digital content subscriptions to go through IAP on iOS.
 *
 * Changes:
 * - Make stripe_customer_id and stripe_subscription_id nullable so a row can
 *   represent either a Stripe subscription OR an Apple IAP subscription.
 * - Add apple_original_transaction_id (unique) to identify the Apple subscription.
 * - Add apple_product_id to track which App Store product was purchased.
 * - Add unique index on apple_original_transaction_id.
 * - Add apple_events table for idempotent processing of App Store Server
 *   Notifications v2 (mirrors the existing stripe_events table).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    -- Allow Stripe columns to be NULL so Apple-only subscriptions can exist
    ALTER TABLE app_internal.subscriptions
      ALTER COLUMN stripe_customer_id DROP NOT NULL,
      ALTER COLUMN stripe_subscription_id DROP NOT NULL;

    -- Apple IAP columns
    ALTER TABLE app_internal.subscriptions
      ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
      ADD COLUMN IF NOT EXISTS apple_product_id TEXT;

    -- Unique index for Apple original transaction ID
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_apple_original_transaction_id_uk
      ON app_internal.subscriptions (apple_original_transaction_id)
      WHERE apple_original_transaction_id IS NOT NULL;

    -- Idempotency table for App Store Server Notifications v2
    CREATE TABLE IF NOT EXISTS app_internal.apple_events (
      event_id   TEXT        PRIMARY KEY NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS app_internal.apple_events;

    DROP INDEX IF EXISTS app_internal.subscriptions_apple_original_transaction_id_uk;

    ALTER TABLE app_internal.subscriptions
      DROP COLUMN IF EXISTS apple_original_transaction_id,
      DROP COLUMN IF EXISTS apple_product_id;

    -- Re-add NOT NULL constraints (will fail if any row has NULL values)
    ALTER TABLE app_internal.subscriptions
      ALTER COLUMN stripe_customer_id SET NOT NULL,
      ALTER COLUMN stripe_subscription_id SET NOT NULL;
  `);
};
