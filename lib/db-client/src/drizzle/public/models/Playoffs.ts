import {
  boolean,
  decimal,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { leagues, teams } from './Leagues';
import { users } from './Users';
import { tiebreakerMethod } from './Enums';

/**
 * Playoff System Database Tables (LS-28)
 *
 * Implements playoff bracket management with automatic seeding,
 * tournament progression, and championship determination.
 */

// Playoff format enum
export const playoffFormat = pgEnum('playoff_format', [
  '4-team',
  '6-team',
  '8-team',
]);

// Playoff round enum
export const playoffRound = pgEnum('playoff_round', [
  'wildcard',
  'semifinals',
  'finals',
]);

// Playoff matchup status enum
export const playoffMatchupStatus = pgEnum('playoff_matchup_status', [
  'scheduled',
  'in_progress',
  'completed',
]);

/**
 * Playoff Brackets - Top-level playoff configuration for a league season
 */
export const playoffBrackets = pgTable(
  'playoff_brackets',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    season: integer('season').notNull(),
    format: playoffFormat('format').notNull(),
    startWeek: integer('start_week').notNull(),
    endWeek: integer('end_week').notNull(),
    championTeamId: integer('champion_team_id'),
    status: playoffMatchupStatus('status').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      playoffBracketsLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'playoff_brackets_league_fk',
      }).onDelete('cascade'),
      playoffBracketsChampionFk: foreignKey({
        columns: [table.championTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_brackets_champion_fk',
      }).onDelete('cascade'),
      playoffBracketsLeagueSeasonUk: unique(
        'playoff_brackets_league_season_uk',
      ).on(table.leagueId, table.season),
    };
  },
);

/**
 * Playoff Matchups - Individual matchups within a playoff bracket
 */
export const playoffMatchups = pgTable(
  'playoff_matchups',
  {
    id: serial('id').primaryKey().notNull(),
    bracketId: integer('bracket_id').notNull(),
    round: playoffRound('round').notNull(),
    matchupNumber: integer('matchup_number').notNull(),
    highSeedTeamId: integer('high_seed_team_id'),
    lowSeedTeamId: integer('low_seed_team_id'),
    winnerTeamId: integer('winner_team_id'),
    highSeedScore: decimal('high_seed_score', { precision: 10, scale: 2 }),
    lowSeedScore: decimal('low_seed_score', { precision: 10, scale: 2 }),
    weekNumber: integer('week_number').notNull(),
    status: playoffMatchupStatus('status').notNull().default('scheduled'),
    isMultiWeek: boolean('is_multi_week').notNull().default(false),
  },
  (table) => {
    return {
      playoffMatchupsBracketFk: foreignKey({
        columns: [table.bracketId],
        foreignColumns: [playoffBrackets.id],
        name: 'playoff_matchups_bracket_fk',
      }).onDelete('cascade'),
      playoffMatchupsHighSeedFk: foreignKey({
        columns: [table.highSeedTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_matchups_high_seed_fk',
      }).onDelete('cascade'),
      playoffMatchupsLowSeedFk: foreignKey({
        columns: [table.lowSeedTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_matchups_low_seed_fk',
      }).onDelete('cascade'),
      playoffMatchupsWinnerFk: foreignKey({
        columns: [table.winnerTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_matchups_winner_fk',
      }).onDelete('cascade'),
    };
  },
);

/**
 * Playoff Seeds - Team seeding information for playoffs
 */
export const playoffSeeds = pgTable(
  'playoff_seeds',
  {
    id: serial('id').primaryKey().notNull(),
    bracketId: integer('bracket_id').notNull(),
    teamId: integer('team_id').notNull(),
    seedNumber: integer('seed_number').notNull(),
    regularSeasonWins: integer('regular_season_wins').notNull().default(0),
    regularSeasonLosses: integer('regular_season_losses').notNull().default(0),
    pointsFor: decimal('points_for', { precision: 10, scale: 2 }).notNull(),
  },
  (table) => {
    return {
      playoffSeedsBracketFk: foreignKey({
        columns: [table.bracketId],
        foreignColumns: [playoffBrackets.id],
        name: 'playoff_seeds_bracket_fk',
      }).onDelete('cascade'),
      playoffSeedsTeamFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'playoff_seeds_team_fk',
      }).onDelete('cascade'),
      playoffSeedsBracketTeamUk: unique('playoff_seeds_bracket_team_uk').on(
        table.bracketId,
        table.teamId,
      ),
    };
  },
);

/**
 * Champion Trophies - Historical championship records
 */
export const championTrophies = pgTable(
  'champion_trophies',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    season: integer('season').notNull(),
    teamId: integer('team_id').notNull(),
    championshipWeek: integer('championship_week').notNull(),
    finalScore: decimal('final_score', { precision: 10, scale: 2 }).notNull(),
    runnerUpTeamId: integer('runner_up_team_id'),
    runnerUpScore: decimal('runner_up_score', { precision: 10, scale: 2 }),
    awardedAt: timestamp('awarded_at', { mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      championTrophiesLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'champion_trophies_league_fk',
      }).onDelete('cascade'),
      championTrophiesChampionFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'champion_trophies_champion_fk',
      }).onDelete('cascade'),
      championTrophiesRunnerUpFk: foreignKey({
        columns: [table.runnerUpTeamId],
        foreignColumns: [teams.id],
        name: 'champion_trophies_runner_up_fk',
      }).onDelete('cascade'),
      championTrophiesLeagueSeasonUk: unique(
        'champion_trophies_league_season_uk',
      ).on(table.leagueId, table.season),
    };
  },
);

/**
 * Tiebreaker System (LS-39)
 *
 * Configurable tiebreaker rules and historical tracking for resolving
 * matchup ties in head-to-head fantasy baseball leagues.
 */

export const tiebreakerRules = pgTable(
  'tiebreaker_rules',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    primaryMethod: tiebreakerMethod('primary_method').notNull(),
    secondaryMethod: tiebreakerMethod('secondary_method'),
    tertiaryMethod: tiebreakerMethod('tertiary_method'),
    allowCommissionerOverride: boolean('allow_commissioner_override')
      .notNull()
      .default(true),
    config: jsonb('config'),
    createdAt: timestamp('created_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      tiebreakerRulesLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'tiebreaker_rules_league_fk',
      }).onDelete('cascade'),
      tiebreakerRulesLeagueUk: unique('tiebreaker_rules_league_uk').on(
        table.leagueId,
      ),
    };
  },
);

export const tiebreakerHistory = pgTable(
  'tiebreaker_history',
  {
    id: serial('id').primaryKey().notNull(),
    matchupId: integer('matchup_id').notNull(),
    appliedMethod: tiebreakerMethod('applied_method').notNull(),
    wasCommissionerOverride: boolean('was_commissioner_override')
      .notNull()
      .default(false),
    commissionerUserId: integer('commissioner_user_id'),
    winnerId: integer('winner_id'),
    reason: varchar('reason', { length: 500 }),
    resolvedAt: timestamp('resolved_at', { mode: 'string' })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      tiebreakerHistoryCommissionerFk: foreignKey({
        columns: [table.commissionerUserId],
        foreignColumns: [users.id],
        name: 'tiebreaker_history_commissioner_fk',
      }).onDelete('set null'),
      tiebreakerHistoryWinnerFk: foreignKey({
        columns: [table.winnerId],
        foreignColumns: [teams.id],
        name: 'tiebreaker_history_winner_fk',
      }).onDelete('set null'),
    };
  },
);
