import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add league_phase enum and column to leagues
 *
 * Purpose:
 * - Introduces a formal league lifecycle phase to distinguish pre-draft,
 *   active, and offseason states (LS-1393)
 * - Enables gating of actions (trades, FA claims, matchup generation)
 *   based on league phase rather than relying solely on draftStatus
 *
 * Changes:
 * - Creates league_phase enum ('pre-draft', 'active', 'offseason')
 * - Adds league_phase column to leagues table (default 'pre-draft')
 * - Backfills existing leagues based on current state:
 *   - frozenAt IS NOT NULL => leave as 'pre-draft' (retired, doesn't matter)
 *   - draftStatus = 'completed' AND currentWeek IS NOT NULL => 'active'
 *   - draftStatus = 'completed' AND currentWeek IS NULL => 'offseason'
 *   - otherwise => 'pre-draft'
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE league_phase AS ENUM ('pre-draft', 'active', 'offseason');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS league_phase league_phase NOT NULL DEFAULT 'pre-draft';
  `);

  // Backfill: active leagues with a completed draft and active matchups are 'active'
  await db.execute(`
    UPDATE leagues
    SET league_phase = 'active'
    WHERE draft_status = 'completed'
      AND current_week IS NOT NULL
      AND frozen_at IS NULL;
  `);

  // Backfill: completed draft but no current week (post-renewal carryover) => 'offseason'
  await db.execute(`
    UPDATE leagues
    SET league_phase = 'offseason'
    WHERE draft_status = 'completed'
      AND current_week IS NULL
      AND frozen_at IS NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE leagues DROP COLUMN IF EXISTS league_phase;
  `);

  await db.execute(`
    DROP TYPE IF EXISTS league_phase;
  `);
};
