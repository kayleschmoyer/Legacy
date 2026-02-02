import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Migration: Remove selected_season column from matchups table
 *
 * Reason: The system uses per-player season assignments via league_week_player_seasons
 * table instead of a single season per matchup. This column was never populated
 * (all values are NULL) and is architecturally incorrect.
 *
 * Breaking Change: Yes - removes GraphQL field
 *
 * Related: LS-27 game selection fixes
 */
export default {
  version: 50,
  name: 'remove_selected_season',
  timestamp: '2026-02-01T19:25:00.000Z',

  up: async (db: NodePgDatabase<any>) => {
    // Drop the selected_season column from matchups table
    await db.execute(sql`
      ALTER TABLE matchups 
      DROP COLUMN IF EXISTS selected_season;
    `);
  },

  down: async (db: NodePgDatabase<any>) => {
    // Restore the column (as nullable integer)
    await db.execute(sql`
      ALTER TABLE matchups 
      ADD COLUMN selected_season INTEGER;
    `);
  },
};
