import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add draft_forfeited_picks (LS-8674)
 *
 * Purpose:
 * - Records the round a team forfeits in a given draft because a locked
 *   keeper_designation used the 'round-penalty' cost model. Draft order
 *   generation (getCurrentDraftPickInfo) consults this table to skip the
 *   team for that round in both snake and linear order.
 *
 * Changes:
 * - Creates `draft_forfeited_picks` table (draft_id, team_id, round), unique
 *   per (draft_id, team_id, round)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner passes an untyped PgDatabase; matches every other migration in this directory
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."draft_forfeited_picks" (
      id SERIAL PRIMARY KEY,
      draft_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      keeper_designation_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      CONSTRAINT draft_forfeited_picks_draft_fk
        FOREIGN KEY (draft_id) REFERENCES "public"."drafts"(id) ON DELETE CASCADE,
      CONSTRAINT draft_forfeited_picks_team_fk
        FOREIGN KEY (team_id) REFERENCES "public"."teams"(id) ON DELETE CASCADE,
      CONSTRAINT draft_forfeited_picks_keeper_designation_fk
        FOREIGN KEY (keeper_designation_id) REFERENCES "public"."keeper_designations"(id) ON DELETE CASCADE,
      CONSTRAINT draft_forfeited_picks_uk
        UNIQUE (draft_id, team_id, round)
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS draft_forfeited_picks_draft_id_idx
      ON "public"."draft_forfeited_picks"(draft_id);
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration runner passes an untyped PgDatabase; matches every other migration in this directory
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS "public"."draft_forfeited_picks";
  `);
};
