import {
  char,
  foreignKey,
  integer,
  pgTable,
  serial,
  unique,
} from 'drizzle-orm/pg-core';
import { leagues } from './Leagues';
import { players } from './Players';

export const matchups = pgTable(
  'matchups',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    weekNumber: integer('week_number').notNull(),
  },
  (table) => {
    return {
      matchupsLeagueFk: foreignKey({
        columns: [table.id],
        foreignColumns: [leagues.id],
        name: 'matchups_league_fk',
      }),
      matchupsWeekUk: unique().on(table.leagueId, table.weekNumber),
    };
  }
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
  }
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
  },
  (table) => {
    return {
      matchupPlayerGamesMatchupPlayerFk: foreignKey({
        columns: [table.matchupPlayerId],
        foreignColumns: [matchupPlayers.id],
        name: 'matchup_player_games_matchup_player_fk',
      }),
    };
  }
);
