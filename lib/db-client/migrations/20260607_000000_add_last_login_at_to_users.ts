import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add last_login_at to app_internal.users (LS-6674 / LGN-019)
 *
 * Records the timestamp of the most recent successful login so the account
 * can surface "last login" for account-security UX and so incident response
 * has a per-user signal alongside the structured login.success / login.failed
 * audit events emitted by the /oauth/login handler. Nullable — a NULL value
 * means the user has not logged in since this column was introduced.
 *
 * The public "users" view is intentionally left unchanged: last_login_at is an
 * internal security/observability signal and is not exposed through the public
 * read path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.users
    DROP COLUMN IF EXISTS last_login_at;
  `);
};
