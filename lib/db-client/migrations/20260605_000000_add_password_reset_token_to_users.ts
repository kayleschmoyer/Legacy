import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add password reset token columns to app_internal.users (LS-6680)
 *
 * Enables the forgot-password flow: a short-lived token is generated on
 * /oauth/forgot-password, stored here, and consumed (then cleared) by
 * /oauth/reset-password. The columns are intentionally excluded from the
 * public.users view so reset tokens are never exposed via the GraphQL layer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(128),
    ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP WITH TIME ZONE;
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS users_password_reset_token_idx
    ON app_internal.users (password_reset_token)
    WHERE password_reset_token IS NOT NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP INDEX IF EXISTS app_internal.users_password_reset_token_idx;
  `);

  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS password_reset_token,
    DROP COLUMN IF EXISTS password_reset_expires_at;
  `);
};
