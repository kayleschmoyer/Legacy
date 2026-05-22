import { pgTable, varchar, index, timestamp } from 'drizzle-orm/pg-core';

/**
 * NFL team reference data (LS-4156).
 *
 * One row per franchise keyed by abbreviation (e.g. 'KC', 'SF', 'NE'). Used to
 * resolve display names, conference/division metadata, and team colors for
 * football leagues. `players.nfl_team` references this table via a FK added
 * by LS-246.
 *
 * `conference` is constrained to ('AFC', 'NFC') and `division` to
 * ('North', 'South', 'East', 'West') by CHECK constraints in the migration.
 */
export const nflTeams = pgTable(
  'nfl_teams',
  {
    abbreviation: varchar('abbreviation', { length: 10 }).primaryKey(),
    fullName: varchar('full_name', { length: 60 }).notNull(),
    city: varchar('city', { length: 40 }).notNull(),
    conference: varchar('conference', { length: 3 }).notNull(),
    division: varchar('division', { length: 10 }).notNull(),
    primaryColor: varchar('primary_color', { length: 7 }),
    secondaryColor: varchar('secondary_color', { length: 7 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      conferenceDivisionIdx: index('nfl_teams_conference_division_idx').on(
        table.conference,
        table.division,
      ),
    };
  },
);
