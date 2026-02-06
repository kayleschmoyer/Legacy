import {
  char,
  decimal,
  foreignKey,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { leagues, teams } from './Leagues';
import { players } from './Players';

export const matchupStatus = pgEnum('matchup_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

export const statsLoadingStatus = pgEnum('stats_loading_status', [
  'not_started',
  'queued',
  'loading',
  'completed',
  'failed',
]);

export const matchups = pgTable(
  'matchups',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    weekNumber: integer('week_number').notNull(),
    team1Id: integer('team1_id'),
    team2Id: integer('team2_id'),
    team1Score: decimal('team1_score', { precision: 10, scale: 2 }),
    team2Score: decimal('team2_score', { precision: 10, scale: 2 }),
    status: matchupStatus('status').notNull().default('scheduled'),
    statsLoadingStatus: statsLoadingStatus('stats_loading_status')
      .notNull()
      .default('not_started'),
    gamesPerMatchup: integer('games_per_matchup'),
    startTime: timestamp('start_time', { mode: 'string' }),
    endTime: timestamp('end_time', { mode: 'string' }),
  },
  (table) => {
    return {
      matchupsLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'matchups_league_fk',
      }).onDelete('cascade'),
      matchupsTeam1Fk: foreignKey({
        columns: [table.team1Id],
        foreignColumns: [teams.id],
        name: 'matchups_team1_fk',
      }).onDelete('cascade'),
      matchupsTeam2Fk: foreignKey({
        columns: [table.team2Id],
        foreignColumns: [teams.id],
        name: 'matchups_team2_fk',
      }).onDelete('cascade'),
      // Note: Removed unique constraint on (leagueId, weekNumber) as a league
      // needs to support multiple matchups per week (one for each team pairing)
    };
  },
);

export const matchupPlayers = pgTable(
  'matchup_players',
  {
    id: serial('id').primaryKey().notNull(),
    matchupId: integer('matchup_id').notNull(),
    playerId: integer('player_id').notNull(),
    teamId: integer('team_id').notNull(),
  },
  (table) => {
    return {
      matchupPlayersMatchupFk: foreignKey({
        columns: [table.matchupId],
        foreignColumns: [matchups.id],
        name: 'matchup_players_matchup_fk',
      }),
      matchupPlayersPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'matchup_players_player_fk',
      }),
      matchupPlayersTeamFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'matchup_players_team_fk',
      }).onDelete('cascade'),
    };
  },
);

export const leagueWeekPlayerSeasons = pgTable(
  'league_week_player_seasons',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    weekNumber: integer('week_number').notNull(),
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  },
  (table) => {
    return {
      leagueWeekPlayerSeasonsLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_week_player_seasons_league_fk',
      }),
      leagueWeekPlayerSeasonsPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'league_week_player_seasons_player_fk',
      }),
      leagueWeekPlayerSeasonsUnique: unique(
        'league_week_player_seasons_unique',
      ).on(table.leagueId, table.weekNumber, table.playerId),
    };
  },
);

export const matchupPlayerGames = pgTable(
  'matchup_player_games',
  {
    id: serial('id').primaryKey().notNull(),
    matchupPlayerId: integer('matchup_player_id').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }),
    battingGameNum: integer('batting_game_num'),
    fieldingGameNum: integer('fielding_game_num'),
    pitchingGameNum: integer('pitching_game_num'),
    fieldingGamePos: char('fielding_game_pos', { length: 2 }),
    statsLoadingStatus: varchar('stats_loading_status', { length: 20 }).default(
      'pending',
    ),
    // NOTE: Scores are NOT stored in DB - they are calculated on the frontend
    // using the @legacy-sports/scoring package with league-specific settings
  },
  (table) => {
    return {
      matchupPlayerGamesMatchupPlayerFk: foreignKey({
        columns: [table.matchupPlayerId],
        foreignColumns: [matchupPlayers.id],
        name: 'matchup_player_games_matchup_player_fk',
      }),
    };
  },
);
