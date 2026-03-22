import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add CHECK constraints to league dues tables
 *
 * Purpose: LS-1531 — Enforce data integrity for dues settings and payment status
 *
 * Changes:
 * - Add non-negative constraint on amount_cents
 * - Add consistency constraint on paid/paid_at/marked_by
 */

export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_dues_settings
      ADD CONSTRAINT league_dues_settings_amount_cents_nonnegative
        CHECK (amount_cents >= 0);
  `);

  await db.execute(`
    ALTER TABLE public.league_member_payment_status
      ADD CONSTRAINT league_member_payment_status_paid_consistency
        CHECK ((paid = false) OR (paid = true AND paid_at IS NOT NULL AND marked_by IS NOT NULL));
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_member_payment_status
      DROP CONSTRAINT IF EXISTS league_member_payment_status_paid_consistency;
  `);

  await db.execute(`
    ALTER TABLE public.league_dues_settings
      DROP CONSTRAINT IF EXISTS league_dues_settings_amount_cents_nonnegative;
  `);
};
