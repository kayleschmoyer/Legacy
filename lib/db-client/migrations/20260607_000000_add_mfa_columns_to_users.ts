import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add MFA columns to app_internal.users (LS-7830)
 *
 * Adds the persistence layer for optional TOTP-based two-factor auth
 * (umbrella story LS-6677 / finding LGN-022):
 * - mfa_enabled: enrollment flag, NOT NULL default false (existing users opt out).
 * - totp_secret: the user's TOTP secret, nullable (NULL until enrollment).
 *
 * The public.users VIEW is intentionally NOT updated — totp_secret is a
 * credential that must never be exposed through the public (app-facing) schema,
 * and mfa_enabled is read/written only through the internal db client here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS totp_secret TEXT;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS totp_secret,
    DROP COLUMN IF EXISTS mfa_enabled;
  `);
};
