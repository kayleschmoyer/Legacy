/**
 * Migration: Add scheduling_strategy to leagues table
 * Created: 2025-11-11
 *
 * Adds scheduling_strategy enum and column to support different
 * matchup scheduling algorithms (round-robin, divisional, random).
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Create scheduling_strategy enum type
  await db.execute(`
    CREATE TYPE scheduling_strategy AS ENUM ('round-robin', 'divisional', 'random');
  `);

  // 2. Add scheduling_strategy column to leagues table with default 'round-robin'
  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN scheduling_strategy scheduling_strategy NOT NULL DEFAULT 'round-robin';
  `);

  console.log('✅ Added scheduling_strategy enum and column to leagues table');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // 1. Drop the column
  await db.execute(`
    ALTER TABLE leagues
    DROP COLUMN IF EXISTS scheduling_strategy;
  `);

  // 2. Drop the enum type
  await db.execute(`
    DROP TYPE IF EXISTS scheduling_strategy;
  `);

  console.log(
    '✅ Removed scheduling_strategy column and enum from leagues table',
  );
};
