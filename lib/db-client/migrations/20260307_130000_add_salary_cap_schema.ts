import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Salary cap schema foundations (LS-634)
 *
 * Purpose:
 * - Add salary cap configuration columns to leagues
 * - Add bid_amount column to draft_picks for auction draft support
 * - Add salary column to team_members for cap hit tracking
 * - Create player_salaries table (authoritative salary per player per league)
 * - Create auction_state table (live auction draft state)
 * - Create auction_budgets table (per-team budget during auction draft)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  // 1. Add salary cap columns to leagues
  await db.execute(`
    ALTER TABLE leagues
      ADD COLUMN salary_cap_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN salary_cap INTEGER,
      ADD COLUMN salary_floor INTEGER,
      ADD COLUMN luxury_tax_threshold INTEGER,
      ADD COLUMN min_salary INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN salary_escalation_pct INTEGER NOT NULL DEFAULT 10,
      ADD COLUMN salary_decay_pct INTEGER NOT NULL DEFAULT 25,
      ADD COLUMN auction_budget INTEGER NOT NULL DEFAULT 260,
      ADD COLUMN auction_min_bid INTEGER NOT NULL DEFAULT 1;
  `);

  // 2. Add bid_amount to draft_picks
  await db.execute(`
    ALTER TABLE draft_picks
      ADD COLUMN bid_amount INTEGER;
  `);

  // 3. Add salary to team_members
  await db.execute(`
    ALTER TABLE team_members
      ADD COLUMN salary INTEGER;
  `);

  // 4. Create player_salaries table
  await db.execute(`
    CREATE TABLE player_salaries (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      current_salary INTEGER NOT NULL,
      initial_salary INTEGER NOT NULL,
      acquisition_type VARCHAR(20) NOT NULL,
      year_acquired INTEGER NOT NULL,
      last_rostered_season INTEGER,
      free_agent_years INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

      CONSTRAINT player_salaries_league_fk
        FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      CONSTRAINT player_salaries_player_fk
        FOREIGN KEY (player_id) REFERENCES players(id),
      CONSTRAINT player_salaries_uk_league_player
        UNIQUE (league_id, player_id)
    );
  `);

  await db.execute(`
    CREATE INDEX player_salaries_league_id_idx ON player_salaries(league_id);
    CREATE INDEX player_salaries_player_id_idx ON player_salaries(player_id);
    CREATE INDEX player_salaries_league_salary_idx ON player_salaries(league_id, current_salary);
  `);

  await db.execute(`
    CREATE TRIGGER player_salaries_updated_at_trigger
    BEFORE UPDATE ON public.player_salaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // 5. Create auction_state table
  await db.execute(`
    CREATE TABLE auction_state (
      id SERIAL PRIMARY KEY,
      draft_id INTEGER NOT NULL,
      nominator_team_id INTEGER NOT NULL,
      nominated_player_id INTEGER,
      current_bid INTEGER,
      current_bidder_team_id INTEGER,
      nomination_deadline TIMESTAMP WITH TIME ZONE,
      bid_deadline TIMESTAMP WITH TIME ZONE,
      nomination_order INTEGER NOT NULL,

      CONSTRAINT auction_state_draft_fk
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      CONSTRAINT auction_state_uk_draft
        UNIQUE (draft_id)
    );
  `);

  // 6. Create auction_budgets table
  await db.execute(`
    CREATE TABLE auction_budgets (
      id SERIAL PRIMARY KEY,
      draft_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      remaining_budget INTEGER NOT NULL,
      players_won INTEGER NOT NULL DEFAULT 0,

      CONSTRAINT auction_budgets_draft_fk
        FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
      CONSTRAINT auction_budgets_team_fk
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      CONSTRAINT auction_budgets_uk_draft_team
        UNIQUE (draft_id, team_id)
    );
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DROP TABLE IF EXISTS auction_budgets;
    DROP TABLE IF EXISTS auction_state;
    DROP TRIGGER IF EXISTS player_salaries_updated_at_trigger ON public.player_salaries;
    DROP TABLE IF EXISTS player_salaries;
    ALTER TABLE team_members DROP COLUMN IF EXISTS salary;
    ALTER TABLE draft_picks DROP COLUMN IF EXISTS bid_amount;
    ALTER TABLE leagues
      DROP COLUMN IF EXISTS salary_cap_enabled,
      DROP COLUMN IF EXISTS salary_cap,
      DROP COLUMN IF EXISTS salary_floor,
      DROP COLUMN IF EXISTS luxury_tax_threshold,
      DROP COLUMN IF EXISTS min_salary,
      DROP COLUMN IF EXISTS salary_escalation_pct,
      DROP COLUMN IF EXISTS salary_decay_pct,
      DROP COLUMN IF EXISTS auction_budget,
      DROP COLUMN IF EXISTS auction_min_bid;
  `);
};
