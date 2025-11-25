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
} from 'drizzle-orm/pg-core';
import { leagues, teams } from './Leagues';
import { players } from './Players';

export const matchupStatus = pgEnum('matchup_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
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
    selectedSeason: integer('selected_season'),
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
      }),
      matchupsTeam1Fk: foreignKey({
        columns: [table.team1Id],
        foreignColumns: [teams.id],
        name: 'matchups_team1_fk',
      }),
      matchupsTeam2Fk: foreignKey({
        columns: [table.team2Id],
        foreignColumns: [teams.id],
        name: 'matchups_team2_fk',
      }),
      matchupsWeekUk: unique().on(table.leagueId, table.weekNumber),
    };
  },
);

export const matchupPlayers = pgTable(
  'matchup_players',
  {
    id: serial('id').primaryKey().notNull(),
    matchupId: integer('matchup_id').notNull(),
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
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
    };
  },
);

export const matchupPlayerGames = pgTable(
  'matchup_player_games',
  {
    id: serial('id').primaryKey().notNull(),
    matchupPlayerId: integer('matchup_player_id').notNull(),
    gameNum: integer('game_num').notNull(),
    battingGameNum: integer('batting_game_num'),
    fieldingGameNum: integer('fielding_game_num'),
    pitchingGameNum: integer('pitching_game_num'),
    fieldingGamePos: char('fielding_game_pos', { length: 2 }).notNull(),
    battingScore: numeric('batting_score', { precision: 10, scale: 3 }),
    fieldingScore: numeric('fielding_score', { precision: 10, scale: 3 }),
    pitchingScore: numeric('pitching_score', { precision: 10, scale: 3 }),
    totalScore: numeric('total_score', { precision: 10, scale: 3 }),
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
