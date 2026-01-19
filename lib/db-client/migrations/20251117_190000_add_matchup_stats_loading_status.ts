import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add stats_loading_status to matchups table
 *
 * Purpose:
 * - Track whether game stats are currently being loaded from Baseball Reference
 * - Allow UI to show loading states for matchups
 * - Distinguish between not_started, loading, and completed states
 *
 * Changes:
 * - Add stats_loading_status ENUM column to matchups table
 * - Default to 'not_started' for new matchups
 * - Set existing matchups to 'completed' (assume already processed)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // Create enum type for stats loading status
  await db.execute(`
    CREATE TYPE stats_loading_status AS ENUM (
      'not_started',
      'loading',
      'completed',
      'failed'
    );
  `);

  // Add column to matchups table with default 'not_started'
  await db.execute(`
    ALTER TABLE matchups
    ADD COLUMN stats_loading_status stats_loading_status NOT NULL DEFAULT 'not_started';
  `);

  // Set existing matchups to 'completed' (assume they've been processed)
  await db.execute(`
    UPDATE matchups
    SET stats_loading_status = 'completed'
    WHERE stats_loading_status = 'not_started';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Remove column
  await db.execute(`
    ALTER TABLE matchups
    DROP COLUMN stats_loading_status;
  `);

  // Drop enum type
  await db.execute(`
    DROP TYPE stats_loading_status;
  `);
};
