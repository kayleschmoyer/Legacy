import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend player_position with football skill positions (LS-245).
 *
 * Phase 1 of the multi-sport football epic (LS-244). Additive only — existing
 * baseball values are untouched.
 *
 * Note: ALTER TYPE ADD VALUE cannot run inside a transaction. Drizzle runs
 * each db.execute() outside of an implicit transaction, so multi-statement
 * ALTER TYPE scripts are safe in one execute() call.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'QB';
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'RB';
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'WR';
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'TE';
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'K';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type
  // and re-casting every dependent column. No-op down — additive only.
};
