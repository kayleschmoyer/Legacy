import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend player_position with DST synthetic position (LS-245).
 *
 * DST (Defense/Special Teams) is a synthetic "player" representing the team
 * defense unit. Seeded as 32 synthetic player rows by LS-251.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(
    `ALTER TYPE "public"."player_position" ADD VALUE IF NOT EXISTS 'DST';`,
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type.
};
