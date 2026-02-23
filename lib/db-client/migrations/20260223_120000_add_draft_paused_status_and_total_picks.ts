import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add 'paused' draft status
 *
 * Purpose:
 * - Allow live drafts to be paused/resumed by the commissioner
 *
 * Changes:
 * - Add 'paused' value to the draft_status enum
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Add 'paused' to the draft_status enum
  await db.execute(`
    ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'paused';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Note: Cannot remove enum values in PostgreSQL without recreating the type.
  // The 'paused' value will remain but is harmless if unused.
};
