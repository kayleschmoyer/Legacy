import type { PgDatabase } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Migration: Add 'queued' status to stats_loading_status enum
 *
 * Purpose:
 * - Add intermediate 'queued' state between 'not_started' and 'loading'
 * - Provide immediate UI feedback when game selection is triggered
 * - Distinguish between message queued vs Lambda actively processing
 *
 * Status Flow:
 * - not_started → queued (when mutation sends SQS message)
 * - queued → loading (when Lambda picks up message)
 * - loading → completed/failed (when Lambda finishes)
 *
 * Changes:
 * - Add 'queued' value to stats_loading_status enum
 * - Position it before 'loading' for logical ordering
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Add 'queued' as a new value to the enum type
  // Position it before 'loading' for logical status progression
  await db.execute(`
    ALTER TYPE stats_loading_status ADD VALUE IF NOT EXISTS 'queued' BEFORE 'loading';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Remove 'queued' status by updating all queued records to 'not_started'
  await db.execute(sql`
    UPDATE matchups 
    SET stats_loading_status = 'not_started' 
    WHERE stats_loading_status = 'queued';
  `);

  // Note: PostgreSQL does not support dropping enum values directly
  // You would need to:
  // 1. Create a new enum without 'queued'
  // 2. Update all columns using the old enum to use the new enum
  // 3. Drop the old enum
  // 4. Rename the new enum to the old name
  //
  // Since this is a safe additive change and the value may be in use,
  // we don't provide an automatic rollback. Manual intervention required.

  throw new Error(
    'Rolling back enum value addition is not supported. ' +
      'If you must remove this value, ensure no rows use it, then manually recreate the enum type.',
  );
};
