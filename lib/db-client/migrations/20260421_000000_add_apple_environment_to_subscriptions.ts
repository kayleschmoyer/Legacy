import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add apple_environment column to app_internal.subscriptions (LS-2622)
 *
 * Purpose:
 * - The App Store Server Notification payload includes an environment field
 *   ('Sandbox' | 'Production') that was previously discarded. Without persisting
 *   it, sandbox data can silently mix with production subscription rows with no
 *   audit trail.
 *
 * Changes:
 * - Adds nullable TEXT apple_environment column. Populated on every upsert
 *   from the decoded notification's environment field.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle or() typing limitation with variadic args
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    ADD COLUMN IF NOT EXISTS apple_environment TEXT;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle or() typing limitation with variadic args
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.subscriptions
    DROP COLUMN IF EXISTS apple_environment;
  `);
};
