import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add waiver claim outcome event types
 *
 * Purpose:
 * - Extend the league_activity_event_type enum with outcome types for waiver
 *   claim processing results so the automated processor can write structured
 *   activity log entries for each claim resolution.
 *
 * Changes:
 * - Add 'waiver_claim_approved' value to league_activity_event_type enum
 * - Add 'waiver_claim_rejected' value to league_activity_event_type enum
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TYPE league_activity_event_type ADD VALUE IF NOT EXISTS 'waiver_claim_approved';
    ALTER TYPE league_activity_event_type ADD VALUE IF NOT EXISTS 'waiver_claim_rejected';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db: _db }: { db: PgDatabase<any> }) => {
  // PostgreSQL does not support removing values from an enum without
  // recreating the type. The safest rollback is a no-op; rows using
  // these values would need to be cleaned up manually before a full
  // enum reconstruction if required.
};
