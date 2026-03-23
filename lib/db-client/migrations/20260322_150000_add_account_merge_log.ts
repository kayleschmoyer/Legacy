import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add account_merge_log table for audit trail
 *
 * Purpose:
 * - Records account merge events for support/debugging
 * - Stores which user was merged into which, and what data was transferred
 * - (LS-1676: Merge Discord and Google accounts)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('📝 Creating account_merge_log table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_internal.account_merge_log (
      id SERIAL PRIMARY KEY,
      target_user_id INTEGER NOT NULL,
      source_user_id INTEGER NOT NULL,
      source_email VARCHAR(100) NOT NULL,
      target_email VARCHAR(100) NOT NULL,
      merged_by_user_id INTEGER NOT NULL,
      tables_updated JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_merge_log_target_user
    ON app_internal.account_merge_log (target_user_id);

    CREATE INDEX IF NOT EXISTS idx_merge_log_source_user
    ON app_internal.account_merge_log (source_user_id);
  `);

  console.log('✅ account_merge_log table created');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    DROP TABLE IF EXISTS app_internal.account_merge_log;
  `);
};
