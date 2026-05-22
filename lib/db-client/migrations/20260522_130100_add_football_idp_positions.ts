import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend player_position with football IDP positions (LS-245).
 *
 * DL covers DE + DT; LB covers ILB, OLB, MLB; DB covers CB, S, FS, SS.
 * The pfr-client normalization (LS-252) collapses PFR's stated positions
 * onto these three buckets before storing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'DL';
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'LB';
    ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'DB';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type.
};
