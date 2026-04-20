import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add refund + dispute (chargeback) audit columns to subscriptions (LS-2611)
 *
 * Before this change, `charge.refunded` only fired a GA4 analytic event and
 * `charge.dispute.created` was not handled at all — a refunded/disputed user
 * retained premium access indefinitely. These columns let the webhook
 * persist the audit trail so the refund/dispute state is queryable alongside
 * the subscription record.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER,
    ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispute_status TEXT;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    DROP COLUMN IF EXISTS refunded_at,
    DROP COLUMN IF EXISTS refund_amount_cents,
    DROP COLUMN IF EXISTS disputed_at,
    DROP COLUMN IF EXISTS dispute_status;
  `);
};
