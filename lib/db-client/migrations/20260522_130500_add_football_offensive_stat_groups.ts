import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend scoring_stat_group with football offensive groups (LS-245).
 *
 * Mirrors the baseball ('batting', 'pitching', 'fielding') grouping so the
 * scoring engine (LS-254) can keep its per-group lookup pattern.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."scoring_stat_group" ADD VALUE IF NOT EXISTS 'passing';
    ALTER TYPE "public"."scoring_stat_group" ADD VALUE IF NOT EXISTS 'rushing';
    ALTER TYPE "public"."scoring_stat_group" ADD VALUE IF NOT EXISTS 'receiving';
    ALTER TYPE "public"."scoring_stat_group" ADD VALUE IF NOT EXISTS 'kicking';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type.
};
