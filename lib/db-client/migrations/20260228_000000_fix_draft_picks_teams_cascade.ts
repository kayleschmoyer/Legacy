import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Fix missing CASCADE delete on draft_picks.team_id → teams.id
 *
 * The draft_picks.team_id foreign key was missing ON DELETE CASCADE.
 * When a league is deleted, teams are cascade-deleted, but draft_picks rows
 * referencing those teams were blocking the delete with a FK violation:
 *   "update or delete on table 'teams' violates foreign key constraint
 *    'draft_picks_teams_id_fk' on table 'draft_picks'"
 *
 * Full cascade chain fix:
 *   leagues → teams → draft_picks (was NO ACTION, now CASCADE)
 */

export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('🔗 Fixing CASCADE delete on draft_picks.team_id → teams.id...');

  await db.execute(`
    ALTER TABLE draft_picks DROP CONSTRAINT IF EXISTS draft_picks_teams_id_fk;
    ALTER TABLE draft_picks ADD CONSTRAINT draft_picks_teams_id_fk
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
  `);

  console.log('✅ draft_picks_teams_id_fk now has ON DELETE CASCADE');
};

export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  console.log('↩️  Reverting CASCADE delete on draft_picks.team_id...');

  await db.execute(`
    ALTER TABLE draft_picks DROP CONSTRAINT IF EXISTS draft_picks_teams_id_fk;
    ALTER TABLE draft_picks ADD CONSTRAINT draft_picks_teams_id_fk
      FOREIGN KEY (team_id) REFERENCES teams(id);
  `);

  console.log('✅ draft_picks_teams_id_fk reverted to NO ACTION');
};
