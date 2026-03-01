import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add is_public column to leagues table
 *
 * Purpose:
 * - Support the public/open leagues feature (LS-284)
 * - Allow leagues to be discoverable by all authenticated users
 * - Existing leagues default to private (is_public = false)
 *
 * Changes:
 * - leagues.is_public BOOLEAN NOT NULL DEFAULT false
 * - Index on is_public for efficient discovery queries
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

    CREATE INDEX IF NOT EXISTS leagues_is_public_idx ON leagues (is_public);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP INDEX IF EXISTS leagues_is_public_idx;

    ALTER TABLE leagues
      DROP COLUMN IF EXISTS is_public;
  `);
};
