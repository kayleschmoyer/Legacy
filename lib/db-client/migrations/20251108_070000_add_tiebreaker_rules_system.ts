/**
 * Migration: Add tiebreaker rules system
 * Created: 2025-11-08
 * Ticket: LS-36
 *
 * Adds configurable tiebreaker rules system:
 * - Tiebreaker method enum
 * - Tiebreaker rules table (per league)
 * - Tiebreaker history table (tracking decisions)
 * - Foreign key constraints and indexes
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Create tiebreaker method enum
  await db.execute(`
    CREATE TYPE tiebreaker_method AS ENUM (
      'highest_category',
      'total_season_points',
      'head_to_head_record',
      'random',
      'co_champion'
    );
  `);

  // Create tiebreaker rules table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tiebreaker_rules (
      id serial PRIMARY KEY NOT NULL,
      league_id integer NOT NULL,
      primary_method tiebreaker_method NOT NULL,
      secondary_method tiebreaker_method,
      tertiary_method tiebreaker_method,
      allow_commissioner_override boolean DEFAULT true NOT NULL,
      config jsonb,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT tiebreaker_rules_league_uk UNIQUE(league_id)
    );
  `);

  // Create tiebreaker history table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tiebreaker_history (
      id serial PRIMARY KEY NOT NULL,
      matchup_id integer NOT NULL,
      applied_method tiebreaker_method NOT NULL,
      was_commissioner_override boolean DEFAULT false NOT NULL,
      commissioner_user_id integer,
      winner_id integer,
      reason varchar(500),
      resolved_at timestamp DEFAULT now() NOT NULL
    );
  `);

  // Add foreign key constraints
  await db.execute(`
    ALTER TABLE tiebreaker_rules 
      ADD CONSTRAINT tiebreaker_rules_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE CASCADE 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE tiebreaker_history 
      ADD CONSTRAINT tiebreaker_history_matchup_fk 
        FOREIGN KEY (matchup_id) 
        REFERENCES matchups(id) 
        ON DELETE CASCADE 
        ON UPDATE NO ACTION;
  `);

  // Create indexes for performance
  await db.execute(`
    CREATE INDEX IF NOT EXISTS tiebreaker_rules_league_idx 
      ON tiebreaker_rules (league_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS tiebreaker_history_matchup_idx 
      ON tiebreaker_history (matchup_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS tiebreaker_history_resolved_at_idx 
      ON tiebreaker_history (resolved_at);
  `);

  // Add comment explaining the config JSONB field
  await db.execute(`
    COMMENT ON COLUMN tiebreaker_rules.config IS 
      'Flexible configuration for tiebreaker methods. Example: {"highestCategory": "total_score", "randomSeed": 12345}';
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop indexes
  await db.execute(`DROP INDEX IF EXISTS tiebreaker_history_resolved_at_idx;`);
  await db.execute(`DROP INDEX IF EXISTS tiebreaker_history_matchup_idx;`);
  await db.execute(`DROP INDEX IF EXISTS tiebreaker_rules_league_idx;`);

  // Drop tables (constraints will be dropped automatically)
  await db.execute(`DROP TABLE IF EXISTS tiebreaker_history;`);
  await db.execute(`DROP TABLE IF EXISTS tiebreaker_rules;`);

  // Drop enum
  await db.execute(`DROP TYPE IF EXISTS tiebreaker_method;`);
};
