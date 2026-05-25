import {
  pgTable,
  integer,
  varchar,
  doublePrecision,
  smallint,
  numeric,
  unique,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { players } from './Players';

export const gameFootballPassing = pgTable(
  'game_football_passing',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }).notNull(),
    cmp: integer('cmp'),
    att: integer('att'),
    yds: integer('yds'),
    td: integer('td'),
    int: integer('int'),
    sacked: integer('sacked'),
    sackYds: integer('sack_yds'),
    rating: doublePrecision('rating'),
  },
  (table) => ({
    playerIdSeasonIdx: index('game_football_passing_player_id_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdSeasonGameNumIdx: index(
      'game_football_passing_player_id_season_game_num_idx',
    ).on(table.playerId, table.season, table.gameNum),
    gameIdentifierIdx: index('game_football_passing_game_identifier_idx').on(
      table.gameIdentifier,
    ),
    playerIdGameIdentifierIdx: index(
      'game_football_passing_player_id_game_identifier_idx',
    ).on(table.playerId, table.gameIdentifier),
    playerSeasonGameNumUnique: unique(
      'game_football_passing_player_season_game_num_unique',
    ).on(table.playerId, table.season, table.gameNum),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'game_football_passing_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const gameFootballRushing = pgTable(
  'game_football_rushing',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }).notNull(),
    att: integer('att'),
    yds: integer('yds'),
    td: integer('td'),
    lng: integer('lng'),
    fumbles: integer('fumbles'),
  },
  (table) => ({
    playerIdSeasonIdx: index('game_football_rushing_player_id_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdSeasonGameNumIdx: index(
      'game_football_rushing_player_id_season_game_num_idx',
    ).on(table.playerId, table.season, table.gameNum),
    gameIdentifierIdx: index('game_football_rushing_game_identifier_idx').on(
      table.gameIdentifier,
    ),
    playerIdGameIdentifierIdx: index(
      'game_football_rushing_player_id_game_identifier_idx',
    ).on(table.playerId, table.gameIdentifier),
    playerSeasonGameNumUnique: unique(
      'game_football_rushing_player_season_game_num_unique',
    ).on(table.playerId, table.season, table.gameNum),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'game_football_rushing_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const gameFootballReceiving = pgTable(
  'game_football_receiving',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }).notNull(),
    rec: integer('rec'),
    tgt: integer('tgt'),
    yds: integer('yds'),
    td: integer('td'),
    lng: integer('lng'),
    fumbles: integer('fumbles'),
  },
  (table) => ({
    playerIdSeasonIdx: index('game_football_receiving_player_id_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdSeasonGameNumIdx: index(
      'game_football_receiving_player_id_season_game_num_idx',
    ).on(table.playerId, table.season, table.gameNum),
    gameIdentifierIdx: index('game_football_receiving_game_identifier_idx').on(
      table.gameIdentifier,
    ),
    playerIdGameIdentifierIdx: index(
      'game_football_receiving_player_id_game_identifier_idx',
    ).on(table.playerId, table.gameIdentifier),
    playerSeasonGameNumUnique: unique(
      'game_football_receiving_player_season_game_num_unique',
    ).on(table.playerId, table.season, table.gameNum),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'game_football_receiving_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const gameFootballKicking = pgTable(
  'game_football_kicking',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }).notNull(),
    fgm: integer('fgm'),
    fga: integer('fga'),
    fg0_19m: integer('fg_0_19m'),
    fg0_19a: integer('fg_0_19a'),
    fg20_29m: integer('fg_20_29m'),
    fg20_29a: integer('fg_20_29a'),
    fg30_39m: integer('fg_30_39m'),
    fg30_39a: integer('fg_30_39a'),
    fg40_49m: integer('fg_40_49m'),
    fg40_49a: integer('fg_40_49a'),
    fg50m: integer('fg_50m'),
    fg50a: integer('fg_50a'),
    xpm: integer('xpm'),
    xpa: integer('xpa'),
    lng: integer('lng'),
  },
  (table) => ({
    playerIdSeasonIdx: index('game_football_kicking_player_id_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdSeasonGameNumIdx: index(
      'game_football_kicking_player_id_season_game_num_idx',
    ).on(table.playerId, table.season, table.gameNum),
    gameIdentifierIdx: index('game_football_kicking_game_identifier_idx').on(
      table.gameIdentifier,
    ),
    playerIdGameIdentifierIdx: index(
      'game_football_kicking_player_id_game_identifier_idx',
    ).on(table.playerId, table.gameIdentifier),
    playerSeasonGameNumUnique: unique(
      'game_football_kicking_player_season_game_num_unique',
    ).on(table.playerId, table.season, table.gameNum),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'game_football_kicking_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const gameFootballDefense = pgTable(
  'game_football_defense',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }).notNull(),
    sacks: integer('sacks'),
    int: integer('int'),
    fumblesRec: integer('fumbles_rec'),
    defTd: integer('def_td'),
    safeties: integer('safeties'),
    ptsAllowed: integer('pts_allowed'),
    ydsAllowed: integer('yds_allowed'),
    passYdsAllowed: integer('pass_yds_allowed'),
    rushYdsAllowed: integer('rush_yds_allowed'),
  },
  (table) => ({
    playerIdSeasonIdx: index('game_football_defense_player_id_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdSeasonGameNumIdx: index(
      'game_football_defense_player_id_season_game_num_idx',
    ).on(table.playerId, table.season, table.gameNum),
    gameIdentifierIdx: index('game_football_defense_game_identifier_idx').on(
      table.gameIdentifier,
    ),
    playerIdGameIdentifierIdx: index(
      'game_football_defense_player_id_game_identifier_idx',
    ).on(table.playerId, table.gameIdentifier),
    playerSeasonGameNumUnique: unique(
      'game_football_defense_player_season_game_num_unique',
    ).on(table.playerId, table.season, table.gameNum),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'game_football_defense_player_id_fk',
    }).onDelete('cascade'),
  }),
);

/**
 * Per-game individual defensive player (IDP) stats.
 * Distinct from game_football_defense (DST team-level aggregates).
 * sacks uses DECIMAL(4,1) to support half-sacks (LS-4155).
 */
export const gameFootballDefenseIdp = pgTable(
  'game_football_defense_idp',
  {
    playerId: integer('player_id').notNull(),
    season: smallint('season').notNull(),
    gameNum: smallint('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }).notNull(),
    soloTkl: smallint('solo_tkl'),
    astTkl: smallint('ast_tkl'),
    sacks: numeric('sacks', { precision: 4, scale: 1 }),
    int: smallint('int'),
    pd: smallint('pd'),
    ff: smallint('ff'),
    fr: smallint('fr'),
    defTd: smallint('def_td'),
    safeties: smallint('safeties'),
  },
  (table) => ({
    playerSeasonGameNumUnique: unique(
      'game_football_defense_idp_player_season_game_num_unique',
    ).on(table.playerId, table.season, table.gameNum),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'game_football_defense_idp_player_id_fk',
    }).onDelete('cascade'),
    playerIdSeasonIdx: index(
      'game_football_defense_idp_player_id_season_idx',
    ).on(table.playerId, table.season),
    gameIdentifierIdx: index(
      'game_football_defense_idp_game_identifier_idx',
    ).on(table.gameIdentifier),
  }),
);
