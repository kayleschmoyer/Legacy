import {
  pgTable,
  smallint,
  primaryKey,
  index,
  foreignKey,
  varchar,
} from 'drizzle-orm/pg-core';
import { nflTeams } from './FootballTeams';
import { sosTier } from './Enums';

/**
 * Per-team, per-season bye week and strength-of-schedule tier (LS-8043).
 *
 * Keyed by season year + NFL team abbreviation. Provides queryable,
 * season-aware metadata for the football team filter badges (umbrella LS-6496).
 *
 * sos_tier is stored as seeded data (easy | medium | hard) — not derived.
 * bye_week stores the NFL regular-season week number (5–14) when the team
 * has no game.
 */
export const footballTeamSeasonMetadata = pgTable(
  'football_team_season_metadata',
  {
    season: smallint('season').notNull(),
    teamAbbreviation: varchar('team_abbreviation', { length: 10 }).notNull(),
    byeWeek: smallint('bye_week').notNull(),
    tier: sosTier('sos_tier').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.season, table.teamAbbreviation],
      name: 'football_team_season_metadata_pk',
    }),
    teamAbbreviationFk: foreignKey({
      columns: [table.teamAbbreviation],
      foreignColumns: [nflTeams.abbreviation],
      name: 'football_team_season_metadata_team_abbreviation_fk',
    }),
    seasonIdx: index('football_team_season_metadata_season_idx').on(
      table.season,
    ),
  }),
);
