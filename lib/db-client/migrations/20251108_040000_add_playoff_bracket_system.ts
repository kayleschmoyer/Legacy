/**
 * Migration: Add playoff bracket system
 * Created: 2025-11-08
 * Ticket: LS-28
 *
 * Adds comprehensive playoff bracket system:
 * - Playoff format, round, and status enums
 * - Playoff brackets table
 * - Playoff matchups table
 * - Playoff seeds table
 * - Champion trophies table
 * - Foreign key constraints and indexes
 */

import type { PgDatabase } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Create playoff format enum
  await db.execute(`
    CREATE TYPE playoff_format AS ENUM ('4-team', '6-team', '8-team');
  `);

  // Create playoff round enum
  await db.execute(`
    CREATE TYPE playoff_round AS ENUM ('wildcard', 'semifinals', 'finals');
  `);

  // Create playoff matchup status enum
  await db.execute(`
    CREATE TYPE playoff_matchup_status AS ENUM ('scheduled', 'in_progress', 'completed');
  `);

  // Create playoff brackets table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playoff_brackets (
      id serial PRIMARY KEY NOT NULL,
      league_id integer NOT NULL,
      season integer NOT NULL,
      format playoff_format NOT NULL,
      start_week integer NOT NULL,
      end_week integer NOT NULL,
      champion_team_id integer,
      status playoff_matchup_status DEFAULT 'scheduled' NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT playoff_brackets_league_season_uk UNIQUE(league_id, season)
    );
  `);

  // Create playoff matchups table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playoff_matchups (
      id serial PRIMARY KEY NOT NULL,
      bracket_id integer NOT NULL,
      round playoff_round NOT NULL,
      matchup_number integer NOT NULL,
      high_seed_team_id integer,
      low_seed_team_id integer,
      winner_team_id integer,
      high_seed_score numeric(10, 2),
      low_seed_score numeric(10, 2),
      week_number integer NOT NULL,
      status playoff_matchup_status DEFAULT 'scheduled' NOT NULL,
      is_multi_week boolean DEFAULT false NOT NULL
    );
  `);

  // Create playoff seeds table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playoff_seeds (
      id serial PRIMARY KEY NOT NULL,
      bracket_id integer NOT NULL,
      team_id integer NOT NULL,
      seed_number integer NOT NULL,
      regular_season_wins integer DEFAULT 0 NOT NULL,
      regular_season_losses integer DEFAULT 0 NOT NULL,
      points_for numeric(10, 2) NOT NULL,
      CONSTRAINT playoff_seeds_bracket_team_uk UNIQUE(bracket_id, team_id)
    );
  `);

  // Create champion trophies table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS champion_trophies (
      id serial PRIMARY KEY NOT NULL,
      league_id integer NOT NULL,
      season integer NOT NULL,
      team_id integer NOT NULL,
      championship_week integer NOT NULL,
      final_score numeric(10, 2) NOT NULL,
      runner_up_team_id integer,
      runner_up_score numeric(10, 2),
      awarded_at timestamp DEFAULT now() NOT NULL,
      CONSTRAINT champion_trophies_league_season_uk UNIQUE(league_id, season)
    );
  `);

  // Add foreign key constraints for playoff_brackets
  await db.execute(`
    ALTER TABLE playoff_brackets 
      ADD CONSTRAINT playoff_brackets_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE playoff_brackets 
      ADD CONSTRAINT playoff_brackets_champion_fk 
        FOREIGN KEY (champion_team_id) 
        REFERENCES teams(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  // Add foreign key constraints for playoff_matchups
  await db.execute(`
    ALTER TABLE playoff_matchups 
      ADD CONSTRAINT playoff_matchups_bracket_fk 
        FOREIGN KEY (bracket_id) 
        REFERENCES playoff_brackets(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE playoff_matchups 
      ADD CONSTRAINT playoff_matchups_high_seed_fk 
        FOREIGN KEY (high_seed_team_id) 
        REFERENCES teams(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE playoff_matchups 
      ADD CONSTRAINT playoff_matchups_low_seed_fk 
        FOREIGN KEY (low_seed_team_id) 
        REFERENCES teams(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE playoff_matchups 
      ADD CONSTRAINT playoff_matchups_winner_fk 
        FOREIGN KEY (winner_team_id) 
        REFERENCES teams(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  // Add foreign key constraints for playoff_seeds
  await db.execute(`
    ALTER TABLE playoff_seeds 
      ADD CONSTRAINT playoff_seeds_bracket_fk 
        FOREIGN KEY (bracket_id) 
        REFERENCES playoff_brackets(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE playoff_seeds 
      ADD CONSTRAINT playoff_seeds_team_fk 
        FOREIGN KEY (team_id) 
        REFERENCES teams(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  // Add foreign key constraints for champion_trophies
  await db.execute(`
    ALTER TABLE champion_trophies 
      ADD CONSTRAINT champion_trophies_league_fk 
        FOREIGN KEY (league_id) 
        REFERENCES leagues(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE champion_trophies 
      ADD CONSTRAINT champion_trophies_champion_fk 
        FOREIGN KEY (team_id) 
        REFERENCES teams(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  await db.execute(`
    ALTER TABLE champion_trophies 
      ADD CONSTRAINT champion_trophies_runner_up_fk 
        FOREIGN KEY (runner_up_team_id) 
        REFERENCES teams(id) 
        ON DELETE NO ACTION 
        ON UPDATE NO ACTION;
  `);

  // Create indexes for performance
  await db.execute(
    `CREATE INDEX IF NOT EXISTS playoff_brackets_league_idx ON playoff_brackets (league_id);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS playoff_brackets_season_idx ON playoff_brackets (season);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS playoff_matchups_bracket_idx ON playoff_matchups (bracket_id);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS playoff_matchups_round_idx ON playoff_matchups (round);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS playoff_seeds_bracket_idx ON playoff_seeds (bracket_id);`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS champion_trophies_league_idx ON champion_trophies (league_id);`,
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }): Promise<void> => {
  // Drop indexes
  await db.execute(`DROP INDEX IF EXISTS champion_trophies_league_idx;`);
  await db.execute(`DROP INDEX IF EXISTS playoff_seeds_bracket_idx;`);
  await db.execute(`DROP INDEX IF EXISTS playoff_matchups_round_idx;`);
  await db.execute(`DROP INDEX IF EXISTS playoff_matchups_bracket_idx;`);
  await db.execute(`DROP INDEX IF EXISTS playoff_brackets_season_idx;`);
  await db.execute(`DROP INDEX IF EXISTS playoff_brackets_league_idx;`);

  // Drop tables (constraints will be dropped automatically)
  await db.execute(`DROP TABLE IF EXISTS champion_trophies;`);
  await db.execute(`DROP TABLE IF EXISTS playoff_seeds;`);
  await db.execute(`DROP TABLE IF EXISTS playoff_matchups;`);
  await db.execute(`DROP TABLE IF EXISTS playoff_brackets;`);

  // Drop enums
  await db.execute(`DROP TYPE IF EXISTS playoff_matchup_status;`);
  await db.execute(`DROP TYPE IF EXISTS playoff_round;`);
  await db.execute(`DROP TYPE IF EXISTS playoff_format;`);
};
