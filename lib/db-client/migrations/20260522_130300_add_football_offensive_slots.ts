import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend position_slot with football offensive + DST slots (LS-245).
 *
 *   FLEX  : RB / WR / TE eligible
 *   SFLEX : QB / RB / WR / TE eligible (Superflex)
 *
 * Slot-to-position eligibility for these slots will be seeded into
 * position_slot_mapping in a later football ticket (mirroring the baseball
 * rows added by LS-4694).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'QB';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'RB';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'WR';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'TE';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'K';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'DST';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'FLEX';
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'SFLEX';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type.
};
