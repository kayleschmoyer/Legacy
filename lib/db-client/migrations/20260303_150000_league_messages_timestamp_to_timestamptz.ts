import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Convert league_messages.timestamp to TIMESTAMPTZ (LS-474)
 *
 * Purpose:
 * - The column was originally declared as TIMESTAMP (no timezone), but all
 *   values are written as UTC.  The mismatch caused chat messages to display
 *   UTC wall-clock time in the UI instead of the viewer's local time.
 * - Changing to TIMESTAMPTZ makes the column semantics match the stored data
 *   and lets the PostgreSQL driver surface a timezone-aware string so any
 *   future reader automatically gets a correct UTC ISO 8601 value.
 *
 * Changes:
 * - ALTER COLUMN "timestamp" TYPE TIMESTAMPTZ USING "timestamp" AT TIME ZONE 'UTC'
 *   (lossless cast — existing rows are already stored as UTC)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      ALTER COLUMN "timestamp" TYPE TIMESTAMPTZ
      USING "timestamp" AT TIME ZONE 'UTC'
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE public.league_messages
      ALTER COLUMN "timestamp" TYPE TIMESTAMP
      USING "timestamp" AT TIME ZONE 'UTC'
  `);
};
