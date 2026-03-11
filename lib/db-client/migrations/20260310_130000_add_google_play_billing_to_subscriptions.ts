import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add Google Play Billing columns to subscriptions
 *
 * Purpose:
 * - Support Android in-app purchase subscriptions via Google Play Billing
 *   Library v6+ alongside the existing Stripe subscription flow.
 * - Google requires all digital content subscriptions to go through Play
 *   Billing on Android.
 *
 * Changes:
 * - Make stripe_customer_id and stripe_subscription_id nullable so a row can
 *   represent either a Stripe subscription OR a Google Play subscription.
 * - Add google_purchase_token (unique) to identify the Google Play subscription.
 * - Add google_product_id to track which Play Store product was purchased.
 * - Add unique index on google_purchase_token.
 * - Add google_events table for idempotent processing of Real-time Developer
 *   Notifications (mirrors the existing stripe_events table).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    -- Allow Stripe columns to be NULL so Google-only subscriptions can exist
    ALTER TABLE app_internal.subscriptions
      ALTER COLUMN stripe_customer_id DROP NOT NULL,
      ALTER COLUMN stripe_subscription_id DROP NOT NULL;

    -- Google Play Billing columns
    ALTER TABLE app_internal.subscriptions
      ADD COLUMN IF NOT EXISTS google_purchase_token TEXT,
      ADD COLUMN IF NOT EXISTS google_product_id TEXT;

    -- Unique index for Google purchase token
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_google_purchase_token_uk
      ON app_internal.subscriptions (google_purchase_token)
      WHERE google_purchase_token IS NOT NULL;

    -- Idempotency table for Real-time Developer Notifications (RTDN)
    CREATE TABLE IF NOT EXISTS app_internal.google_events (
      event_id     TEXT        PRIMARY KEY NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS app_internal.google_events;

    DROP INDEX IF EXISTS app_internal.subscriptions_google_purchase_token_uk;

    ALTER TABLE app_internal.subscriptions
      DROP COLUMN IF EXISTS google_purchase_token,
      DROP COLUMN IF EXISTS google_product_id;

    -- Re-add NOT NULL constraints (will fail if any row has NULL values)
    ALTER TABLE app_internal.subscriptions
      ALTER COLUMN stripe_customer_id SET NOT NULL,
      ALTER COLUMN stripe_subscription_id SET NOT NULL;
  `);
};
