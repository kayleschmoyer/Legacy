import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core';

/**
 * MLB team reference data (LS-8597).
 *
 * One row per franchise keyed by abbreviation (e.g. 'NYY', 'LAD', 'ATL').
 * Used to resolve display names and colors for the team-affiliation chip on
 * baseball player rows. `players.mlb_team` references this table via a FK
 * added by the companion migration.
 */
export const mlbTeams = pgTable('mlb_teams', {
  abbreviation: varchar('abbreviation', { length: 3 }).primaryKey(),
  fullName: varchar('full_name', { length: 60 }).notNull(),
  city: varchar('city', { length: 40 }).notNull(),
  primaryColor: varchar('primary_color', { length: 7 }),
  secondaryColor: varchar('secondary_color', { length: 7 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
