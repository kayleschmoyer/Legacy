import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix draft_teams cascade delete constraint
 *
 * The previous cascade delete migration (20260205_210000) missed the
 * draft_teams.team_id, league_id -> teams.id, league_id constraint.
 *
 * This constraint was still "ON DELETE no action" which prevented
 * team deletion when draft_teams records exist.
 *
 * This migration updates that constraint to CASCADE, allowing
 * league deletion to properly cascade through teams to draft_teams.
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔗 Fixing draft_teams CASCADE delete constraint...');

  // Fix draft_teams.team_id, league_id -> teams.id, league_id
  await db.execute(`
    ALTER TABLE draft_teams 
    DROP CONSTRAINT IF EXISTS draft_teams_teams_id_league_id_fk;
  `);

  await db.execute(`
    ALTER TABLE draft_teams 
    ADD CONSTRAINT draft_teams_teams_id_league_id_fk 
    FOREIGN KEY (team_id, league_id) REFERENCES teams(id, league_id) 
    ON DELETE CASCADE;
  `);

  console.log('✅ draft_teams CASCADE delete constraint fixed');
  console.log('   Now deleting teams will cascade to draft_teams records');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔄 Reverting draft_teams CASCADE delete constraint...');

  // Revert back to no action
  await db.execute(`
    ALTER TABLE draft_teams 
    DROP CONSTRAINT IF EXISTS draft_teams_teams_id_league_id_fk;
  `);

  await db.execute(`
    ALTER TABLE draft_teams 
    ADD CONSTRAINT draft_teams_teams_id_league_id_fk 
    FOREIGN KEY (team_id, league_id) REFERENCES teams(id, league_id) 
    ON DELETE NO ACTION;
  `);

  console.log('✅ draft_teams constraint reverted to NO ACTION');
};
