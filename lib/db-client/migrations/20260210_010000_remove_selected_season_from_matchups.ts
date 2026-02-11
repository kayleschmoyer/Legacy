import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Remove selected_season from matchups table
 *
 * The selected_season column was added in migration 20251108_010000 but was
 * later made obsolete by migration 20251112_190000 which moved season selection
 * to the league_week_player_seasons table (allowing per-player seasons).
 *
 * This migration drops the unused column from the database to match the schema.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up({ db }: { db: PgDatabase<any> }) {
  console.log('[Migration] Removing selected_season column from matchups...');

  await db.execute(`
    ALTER TABLE matchups 
    DROP COLUMN IF EXISTS selected_season
  `);

  console.log('[Migration] ✅ Removed selected_season column');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down({ db }: { db: PgDatabase<any> }) {
  console.log('[Migration] Re-adding selected_season column to matchups...');

  await db.execute(`
    ALTER TABLE matchups 
    ADD COLUMN selected_season INTEGER
  `);

  console.log('[Migration] ✅ Re-added selected_season column');
}
