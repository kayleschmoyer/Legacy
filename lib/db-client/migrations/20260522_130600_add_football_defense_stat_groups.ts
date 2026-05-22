import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend scoring_stat_group with football defensive groups (LS-245).
 *
 *   defense : DST team-defense scoring
 *   idp     : Individual Defensive Player scoring
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."scoring_stat_group" ADD VALUE IF NOT EXISTS 'defense';
    ALTER TYPE "public"."scoring_stat_group" ADD VALUE IF NOT EXISTS 'idp';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type.
};
