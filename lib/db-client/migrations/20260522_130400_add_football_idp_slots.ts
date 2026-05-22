import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend position_slot with football IDP slots (LS-245).
 *
 *   DP : defensive player flex — any IDP position eligible (DL / LB / DB).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'DL';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'LB';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'DB';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'DP';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type.
};
