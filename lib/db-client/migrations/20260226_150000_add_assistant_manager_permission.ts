import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add 'assistant_manager' permission level
 *
 * Purpose:
 * - Introduce a new 'assistant_manager' role that allows a team owner
 *   (General Manager) to delegate certain team management tasks to a
 *   trusted second user without granting full commissioner rights.
 *
 * Changes:
 * - Adds enum value 'assistant_manager' to league_permission_level (IF NOT EXISTS
 *   so this is safe to run after LS-193 which may already include it)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."league_permission_level" ADD VALUE IF NOT EXISTS 'assistant_manager';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // PostgreSQL does not support removing enum values; this migration is intentionally
  // irreversible. The 'assistant_manager' value will remain in the enum.
};
