import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add defensive_format column to leagues (LS-246 / LS-257).
 *
 * Values: 'dst' (team D/ST, default) | 'idp' (Individual Defensive Players).
 * Only meaningful when sport = 'football'; baseball leagues default to 'dst'.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS defensive_format VARCHAR(10) NOT NULL DEFAULT 'dst';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues DROP COLUMN IF EXISTS defensive_format;
  `);
};
