import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Extend position_slot with the combined K/P slot (LS-9107).
 *
 *   KP : Kicker/Punter combined slot
 *
 * Accepted-but-inert like SFLEX today — no player eligibility, queries, or
 * stats exist for KP yet. Gated server-side behind the
 * `custom_roster_positions` entitlement alongside SFLEX (LS-9107); full
 * eligibility support is out of scope per LS-6151 Open Questions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE "public"."position_slot" ADD VALUE IF NOT EXISTS 'KP';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (_args: { db: PgDatabase<any> }) => {
  // Enum values cannot be removed in PostgreSQL without recreating the type.
};
