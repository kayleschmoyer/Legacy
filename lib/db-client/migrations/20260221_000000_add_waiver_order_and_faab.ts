import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Add waiver order and FAAB (Free Agent Acquisition Budget) support
 *
 * Purpose:
 * - Allow leagues to choose between standard waiver order or FAAB bidding
 * - Track per-team waiver priority and remaining FAAB budget
 * - Store FAAB bids on individual waiver claims
 *
 * Changes:
 * - Creates waiver_type enum ('standard', 'faab')
 * - Adds waiver_type, waiver_enabled, faab_budget_default to leagues
 * - Adds waiver_order, faab_budget to teams
 * - Adds faab_bid to waiver_claims
 * - Initializes waiver_order for existing teams (ranked by id within league)
 * - Initializes faab_budget for existing teams to 100
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Create the waiver_type enum
  await db.execute(`
    DO $$ BEGIN
      CREATE TYPE waiver_type AS ENUM ('standard', 'faab');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Add columns to leagues table
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN IF NOT EXISTS waiver_type waiver_type NOT NULL DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS waiver_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS faab_budget_default INTEGER NOT NULL DEFAULT 100;
  `);

  // 3. Add columns to teams table
  await db.execute(`
    ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS waiver_order INTEGER,
      ADD COLUMN IF NOT EXISTS faab_budget INTEGER;
  `);

  // 4. Add faab_bid column to waiver_claims table
  await db.execute(`
    ALTER TABLE waiver_claims
      ADD COLUMN IF NOT EXISTS faab_bid INTEGER;
  `);

  // 5. Initialize waiver_order for existing teams (ranked by id within each league)
  await db.execute(`
    WITH ranked AS (
      SELECT id, league_id,
             ROW_NUMBER() OVER (PARTITION BY league_id ORDER BY id) AS rn
      FROM teams
    )
    UPDATE teams
    SET waiver_order = ranked.rn
    FROM ranked
    WHERE teams.id = ranked.id AND teams.waiver_order IS NULL;
  `);

  // 6. Initialize faab_budget for existing teams to the league default (100)
  await db.execute(`
    UPDATE teams
    SET faab_budget = 100
    WHERE faab_budget IS NULL;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    ALTER TABLE waiver_claims DROP COLUMN IF EXISTS faab_bid;
    ALTER TABLE teams DROP COLUMN IF EXISTS waiver_order;
    ALTER TABLE teams DROP COLUMN IF EXISTS faab_budget;
    ALTER TABLE leagues DROP COLUMN IF EXISTS waiver_type;
    ALTER TABLE leagues DROP COLUMN IF EXISTS waiver_enabled;
    ALTER TABLE leagues DROP COLUMN IF EXISTS faab_budget_default;
    DROP TYPE IF EXISTS waiver_type;
  `);
};
