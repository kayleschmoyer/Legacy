import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix password_hash column type from CHAR to VARCHAR
 *
 * Purpose:
 * - PostgreSQL CHAR(n) pads stored values with trailing spaces to exactly n bytes.
 * - bcryptjs hashes are 60 chars; stored as 60 chars + 68 trailing spaces in CHAR(128).
 * - bcryptjs.compare() receives the padded value and always returns false, breaking login.
 *
 * Changes:
 * - app_internal.users.password_hash: CHAR(128) → VARCHAR(128)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ALTER COLUMN password_hash TYPE VARCHAR(128)
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE app_internal.users
    ALTER COLUMN password_hash TYPE CHAR(128)
  `);
};
