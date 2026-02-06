import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type postgres from 'postgres';

/**
 * Migration: Add week_advance_status to leagues table
 *
 * Reason: Track the state of week advancement operations to prevent race conditions
 * and provide better user feedback. States: idle, queued, processing, success, failed.
 *
 * Related: LS-53 - Implement advanceLeagueWeek mutation
 */
export const up = async ({
  db,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔧 Adding week_advance_status to leagues table...');

  // Create the ENUM type
  await db.execute(
    sql`CREATE TYPE week_advance_status AS ENUM ('idle', 'queued', 'processing', 'success', 'failed')`,
  );

  // Add the week_advance_status column with default 'idle'
  await db.execute(
    sql`ALTER TABLE leagues ADD COLUMN week_advance_status week_advance_status NOT NULL DEFAULT 'idle'`,
  );

  console.log('✅ Added week_advance_status column to leagues table');
};

export const down = async ({
  db,
}: {
  db: PgDatabase<any>;
  sql: postgres.Sql;
}): Promise<void> => {
  console.log('🔧 Removing week_advance_status from leagues table...');

  // Remove the column
  await db.execute(sql`ALTER TABLE leagues DROP COLUMN week_advance_status`);

  // Drop the ENUM type
  await db.execute(sql`DROP TYPE week_advance_status`);

  console.log(
    '✅ Removed week_advance_status column and type from leagues table',
  );
};
