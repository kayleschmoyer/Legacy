import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix account_merge_log tables_updated default
 *
 * The initial migration (20260322_150000) used '{}' (object) as the default
 * for the tables_updated JSONB column, but it stores an array of strings.
 * This migration corrects the default to '[]'.
 *
 * (LS-1676)
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.account_merge_log
    ALTER COLUMN tables_updated SET DEFAULT '[]'::jsonb;
  `);
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  await db.execute(`
    ALTER TABLE app_internal.account_merge_log
    ALTER COLUMN tables_updated SET DEFAULT '{}'::jsonb;
  `);
};
