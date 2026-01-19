import {
  decimal,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';
import { leagues, teams } from './Leagues';

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
  },
  (table) => {
    return {
      playoffBracketsLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'playoff_brackets_league_fk',
      }),
      playoffBracketsChampionFk: foreignKey({
        columns: [table.championTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_brackets_champion_fk',
      }),
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
      }),
      playoffMatchupsHighSeedFk: foreignKey({
        columns: [table.highSeedTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_matchups_high_seed_fk',
      }),
      playoffMatchupsLowSeedFk: foreignKey({
        columns: [table.lowSeedTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_matchups_low_seed_fk',
      }),
      playoffMatchupsWinnerFk: foreignKey({
        columns: [table.winnerTeamId],
        foreignColumns: [teams.id],
        name: 'playoff_matchups_winner_fk',
      }),
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
      }),
      playoffSeedsTeamFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'playoff_seeds_team_fk',
      }),
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
  },
  (table) => {
    return {
      championTrophiesLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'champion_trophies_league_fk',
      }),
      championTrophiesChampionFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'champion_trophies_champion_fk',
      }),
      championTrophiesRunnerUpFk: foreignKey({
        columns: [table.runnerUpTeamId],
        foreignColumns: [teams.id],
        name: 'champion_trophies_runner_up_fk',
      }),
      championTrophiesLeagueSeasonUk: unique(
        'champion_trophies_league_season_uk',
      ).on(table.leagueId, table.season),
    };
  },
);
