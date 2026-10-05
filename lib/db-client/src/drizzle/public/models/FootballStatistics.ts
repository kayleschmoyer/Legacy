import {
  pgTable,
  pgView,
  pgMaterializedView,
  integer,
  varchar,
  doublePrecision,
  smallint,
  numeric,
  bigint,
  unique,
  index,
  foreignKey,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
    interceptions: integer('interceptions'),
    sacked: integer('sacked'),
    sackYds: integer('sack_yds'),
    rating: doublePrecision('rating'),
  },
  (table) => ({
    playerIdSeasonIdx: index('game_football_passing_player_id_season_idx').on(
      table.playerId,
      table.season,
    ),
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
    sacks: doublePrecision('sacks'),
    interceptions: integer('interceptions'),
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

export const gameFootballPlayerOffenseStats = pgView(
  'game_football_player_offense_stats',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: varchar('game_identifier', { length: 20 }).notNull(),
    // passing
    cmp: integer('cmp'),
    passAtt: integer('pass_att'),
    passYds: integer('pass_yds'),
    passTd: integer('pass_td'),
    interceptions: integer('interceptions'),
    sacked: integer('sacked'),
    sackYds: integer('sack_yds'),
    rating: doublePrecision('rating'),
    // rushing
    rushAtt: integer('rush_att'),
    rushYds: integer('rush_yds'),
    rushTd: integer('rush_td'),
    rushLng: integer('rush_lng'),
    rushFumbles: integer('rush_fumbles'),
    // receiving
    rec: integer('rec'),
    tgt: integer('tgt'),
    recYds: integer('rec_yds'),
    recTd: integer('rec_td'),
    recLng: integer('rec_lng'),
    recFumbles: integer('rec_fumbles'),
    // kicking
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
    kLng: integer('k_lng'),
  },
).as(sql``);

/**
 * Per-game individual defensive player (IDP) stats.
 * Distinct from game_football_defense (DST team-level aggregates).
 * sacks uses DECIMAL(4,1) to support half-sacks.
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
    // Physical column is `int` (20260525_050000_create_game_football_defense_idp.ts),
    // matching footballSeasonDefenseIdp — the model name was never a real column.
    interceptions: smallint('int'),
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

// ── Football season stat tables (LS-247) ────────────────────────────────────
//
// Column types below are re-derived from the winning (non-no-op) migration,
// 20260524_000000_create_football_season_stats.ts, not from
// 20260524_100200_create_football_season_stats_tables.ts — the latter's
// `CREATE TABLE IF NOT EXISTS` runs against tables the earlier migration
// already created and is a silent no-op (LS-8573). Migrations are immutable
// once applied (the CI migration-immutability check enforces this), so that
// file is intentionally left unannotated; treat it as dead, not authoritative
// — re-derive column types from information_schema.columns, not from it.

export const footballSeasonPassing = pgTable(
  'football_season_passing',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    team: varchar('team', { length: 50 }).notNull(),
    g: integer('g'),
    gs: integer('gs'),
    cmp: integer('cmp'),
    att: integer('att'),
    yds: integer('yds'),
    td: integer('td'),
    int: integer('int'),
    firstDowns: integer('first_downs'),
    sacked: integer('sacked'),
    sackYds: integer('sack_yds'),
    lng: integer('lng'),
    rating: doublePrecision('rating'),
    pfrRowId: varchar('pfr_row_id', { length: 50 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.playerId, table.season, table.team, table.pfrRowId],
      name: 'football_season_passing_pk',
    }),
    playerIdIdx: index('football_season_passing_player_id_idx').on(
      table.playerId,
    ),
    playerSeasonIdx: index('football_season_passing_player_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'football_season_passing_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const footballSeasonRushing = pgTable(
  'football_season_rushing',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    team: varchar('team', { length: 50 }).notNull(),
    g: integer('g'),
    gs: integer('gs'),
    att: integer('att'),
    yds: integer('yds'),
    td: integer('td'),
    lng: integer('lng'),
    firstDowns: integer('first_downs'),
    fumbles: integer('fumbles'),
    ydsPerAtt: doublePrecision('yds_per_att'),
    pfrRowId: varchar('pfr_row_id', { length: 50 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.playerId, table.season, table.team, table.pfrRowId],
      name: 'football_season_rushing_pk',
    }),
    playerIdIdx: index('football_season_rushing_player_id_idx').on(
      table.playerId,
    ),
    playerSeasonIdx: index('football_season_rushing_player_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'football_season_rushing_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const footballSeasonReceiving = pgTable(
  'football_season_receiving',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    team: varchar('team', { length: 50 }).notNull(),
    g: integer('g'),
    gs: integer('gs'),
    rec: integer('rec'),
    tgt: integer('tgt'),
    yds: integer('yds'),
    td: integer('td'),
    lng: integer('lng'),
    firstDowns: integer('first_downs'),
    fumbles: integer('fumbles'),
    ydsPerRec: doublePrecision('yds_per_rec'),
    pfrRowId: varchar('pfr_row_id', { length: 50 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.playerId, table.season, table.team, table.pfrRowId],
      name: 'football_season_receiving_pk',
    }),
    playerIdIdx: index('football_season_receiving_player_id_idx').on(
      table.playerId,
    ),
    playerSeasonIdx: index('football_season_receiving_player_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'football_season_receiving_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const footballSeasonKicking = pgTable(
  'football_season_kicking',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    team: varchar('team', { length: 50 }).notNull(),
    g: integer('g'),
    fgm: integer('fgm'),
    fga: integer('fga'),
    fgPct: doublePrecision('fg_pct'),
    fg019m: integer('fg_0_19m'),
    fg019a: integer('fg_0_19a'),
    fg2029m: integer('fg_20_29m'),
    fg2029a: integer('fg_20_29a'),
    fg3039m: integer('fg_30_39m'),
    fg3039a: integer('fg_30_39a'),
    fg4049m: integer('fg_40_49m'),
    fg4049a: integer('fg_40_49a'),
    fg50m: integer('fg_50m'),
    fg50a: integer('fg_50a'),
    xpm: integer('xpm'),
    xpa: integer('xpa'),
    lng: integer('lng'),
    pfrRowId: varchar('pfr_row_id', { length: 50 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.playerId, table.season, table.team, table.pfrRowId],
      name: 'football_season_kicking_pk',
    }),
    playerIdIdx: index('football_season_kicking_player_id_idx').on(
      table.playerId,
    ),
    playerSeasonIdx: index('football_season_kicking_player_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'football_season_kicking_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const footballSeasonDefense = pgTable(
  'football_season_defense',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    team: varchar('team', { length: 50 }).notNull(),
    g: integer('g'),
    // Physical column is `integer`, not `numeric` — half-sack precision
    // (e.g. 4.5) is not representable at the season grain and is dropped on
    // insert. Documented as intended (LS-8573): the DB is authoritative and
    // this ticket does not migrate the column to numeric.
    sacks: integer('sacks'),
    int: integer('int'),
    // Physical column is `fumbles_rec` (PFR's native stat name) — created by
    // 20260524_000000_create_football_season_stats.ts, which wins over the later
    // no-op `CREATE TABLE IF NOT EXISTS` in 20260524_100200 that used `fum_rec`.
    fumRec: integer('fumbles_rec'),
    defTd: integer('def_td'),
    safeties: integer('safeties'),
    ptsAllowed: integer('pts_allowed'),
    ydsAllowed: integer('yds_allowed'),
    passYdsAllowed: integer('pass_yds_allowed'),
    rushYdsAllowed: integer('rush_yds_allowed'),
    pfrRowId: varchar('pfr_row_id', { length: 50 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.playerId, table.season, table.team, table.pfrRowId],
      name: 'football_season_defense_pk',
    }),
    playerIdIdx: index('football_season_defense_player_id_idx').on(
      table.playerId,
    ),
    playerSeasonIdx: index('football_season_defense_player_season_idx').on(
      table.playerId,
      table.season,
    ),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'football_season_defense_player_id_fk',
    }).onDelete('cascade'),
  }),
);

// ── IDP season stats (LS-4155) ───────────────────────────────────────────────

export const footballSeasonDefenseIdp = pgTable(
  'football_season_defense_idp',
  {
    playerId: integer('player_id').notNull(),
    season: smallint('season').notNull(),
    team: varchar('team', { length: 10 }).notNull(),
    g: smallint('g'),
    gs: smallint('gs'),
    soloTkl: smallint('solo_tkl'),
    astTkl: smallint('ast_tkl'),
    totalTkl: smallint('total_tkl'),
    sacks: numeric('sacks', { precision: 5, scale: 1 }),
    int: smallint('int'),
    pd: smallint('pd'),
    ff: smallint('ff'),
    fr: smallint('fr'),
    defTd: smallint('def_td'),
    safeties: smallint('safeties'),
    pfrRowId: varchar('pfr_row_id', { length: 30 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.playerId, table.season, table.team, table.pfrRowId],
      name: 'football_season_defense_idp_pk',
    }),
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'football_season_defense_idp_player_id_fk',
    }).onDelete('cascade'),
    playerIdIdx: index('football_season_defense_idp_player_id_idx').on(
      table.playerId,
    ),
    playerIdSeasonIdx: index(
      'football_season_defense_idp_player_id_season_idx',
    ).on(table.playerId, table.season),
  }),
);

// ── Football career stat tables (LS-250) ────────────────────────────────────
//
// Same dead-migration situation as the season tables above: column types are
// re-derived from the winning 20260524_000000_create_career_football_tables.ts,
// not from the no-op 20260524_100400_create_career_football_tables.ts (LS-8573).

export const careerFootballPassing = pgTable(
  'career_football_passing',
  {
    playerId: integer('player_id').primaryKey().notNull(),
    g: integer('g'),
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
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'career_football_passing_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const careerFootballRushing = pgTable(
  'career_football_rushing',
  {
    playerId: integer('player_id').primaryKey().notNull(),
    g: integer('g'),
    att: integer('att'),
    yds: integer('yds'),
    td: integer('td'),
    lng: integer('lng'),
    fumbles: integer('fumbles'),
  },
  (table) => ({
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'career_football_rushing_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const careerFootballReceiving = pgTable(
  'career_football_receiving',
  {
    playerId: integer('player_id').primaryKey().notNull(),
    g: integer('g'),
    rec: integer('rec'),
    tgt: integer('tgt'),
    yds: integer('yds'),
    td: integer('td'),
    lng: integer('lng'),
    fumbles: integer('fumbles'),
  },
  (table) => ({
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'career_football_receiving_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const careerFootballKicking = pgTable(
  'career_football_kicking',
  {
    playerId: integer('player_id').primaryKey().notNull(),
    g: integer('g'),
    fgm: integer('fgm'),
    fga: integer('fga'),
    fg019m: integer('fg_0_19m'),
    fg019a: integer('fg_0_19a'),
    fg2029m: integer('fg_20_29m'),
    fg2029a: integer('fg_20_29a'),
    fg3039m: integer('fg_30_39m'),
    fg3039a: integer('fg_30_39a'),
    fg4049m: integer('fg_40_49m'),
    fg4049a: integer('fg_40_49a'),
    fg50m: integer('fg_50m'),
    fg50a: integer('fg_50a'),
    xpm: integer('xpm'),
    xpa: integer('xpa'),
    lng: integer('lng'),
  },
  (table) => ({
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'career_football_kicking_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const careerFootballDefense = pgTable(
  'career_football_defense',
  {
    playerId: integer('player_id').primaryKey().notNull(),
    g: integer('g'),
    // Physical column is `double precision`, unlike the `integer` season-level
    // sacks column — it can hold fractional totals, but since
    // footballSeasonDefense.sacks is already integer-truncated per-season,
    // half-sacks are lost before they ever reach this aggregate. Documented as
    // intended (LS-8573); no migration to numeric on either table.
    sacks: doublePrecision('sacks'),
    int: integer('int'),
    // Physical column is `fumbles_rec` — see the note on footballSeasonDefense;
    // 20260524_000000_create_career_football_tables.ts wins over 20260524_100400.
    fumRec: integer('fumbles_rec'),
    defTd: integer('def_td'),
    safeties: integer('safeties'),
    ptsAllowedPerG: doublePrecision('pts_allowed_per_g'),
    ydsAllowedPerG: doublePrecision('yds_allowed_per_g'),
  },
  (table) => ({
    playerIdFk: foreignKey({
      columns: [table.playerId],
      foreignColumns: [players.id],
      name: 'career_football_defense_player_id_fk',
    }).onDelete('cascade'),
  }),
);

export const careerFootballDefenseIdp = pgView('career_football_defense_idp', {
  playerId: integer('player_id'),
  // SUM(SMALLINT) returns BIGINT in Postgres
  g: bigint('g', { mode: 'number' }),
  soloTkl: bigint('solo_tkl', { mode: 'number' }),
  astTkl: bigint('ast_tkl', { mode: 'number' }),
  totalTkl: bigint('total_tkl', { mode: 'number' }),
  sacks: numeric('sacks'),
  int: bigint('int', { mode: 'number' }),
  pd: bigint('pd', { mode: 'number' }),
  ff: bigint('ff', { mode: 'number' }),
  fr: bigint('fr', { mode: 'number' }),
  defTd: bigint('def_td', { mode: 'number' }),
  safeties: bigint('safeties', { mode: 'number' }),
}).as(sql`
  SELECT
    player_id,
    SUM(g)         AS g,
    SUM(solo_tkl)  AS solo_tkl,
    SUM(ast_tkl)   AS ast_tkl,
    SUM(total_tkl) AS total_tkl,
    SUM(sacks)     AS sacks,
    SUM(int)       AS int,
    SUM(pd)        AS pd,
    SUM(ff)        AS ff,
    SUM(fr)        AS fr,
    SUM(def_td)    AS def_td,
    SUM(safeties)  AS safeties
  FROM football_season_defense_idp
  GROUP BY player_id
`);

/**
 * Derives eligible fantasy positions for each football player (LS-250).
 * Requires: players.is_dst (LS-246) and players.position (LS-250) columns.
 *
 * Branches 1–3 use authoritative position data; branches 4–5 are stat-inferred
 * fallbacks for players with no canonical position. QB takes priority over K —
 * the K branch excludes any player who also has career passing attempts.
 *   1. is_dst=true → 'DST' (synthetic team-defense player)
 *   2. players.position IN ('DL','LB','DB') → IDP position (authoritative from PFR)
 *   3. players.position IN ('QB','RB','WR','TE','K') → offensive position (authoritative from PFR)
 *   4. career_football_passing.att > 0, position IS NULL → 'QB' (stat-inferred fallback)
 *   5. career_football_kicking.fga > 0, position IS NULL, no passing att → 'K' (stat-inferred fallback)
 *
 * MATERIALIZED (LS-10553) with a unique (player_id, position) index so id
 * lookups seek instead of scanning every branch. Refresh via
 * refreshFootballPlayerEligiblePositions() after writing players.position /
 * is_dst or career_football_passing / career_football_kicking.
 */
export const footballPlayerEligiblePositions = pgMaterializedView(
  'football_player_eligible_positions',
  {
    playerId: integer('player_id').notNull(),
    position: text('position').notNull(),
  },
).as(sql`
  SELECT p.id AS player_id, 'DST'::text AS position
  FROM "public"."players" p
  WHERE p.is_dst = true
  UNION ALL
  SELECT p.id AS player_id, p.position::text AS position
  FROM "public"."players" p
  WHERE p.position::text IN ('DL', 'LB', 'DB')
    AND p.is_dst = false
  UNION ALL
  SELECT p.id AS player_id, p.position::text AS position
  FROM "public"."players" p
  WHERE p.position::text IN ('QB', 'RB', 'WR', 'TE', 'K')
    AND p.is_dst = false
  UNION ALL
  SELECT cfp.player_id, 'QB'::text AS position
  FROM "public"."career_football_passing" cfp
  JOIN "public"."players" p ON p.id = cfp.player_id
  WHERE cfp.att > 0
    AND p.position IS NULL
    AND p.is_dst = false
  UNION ALL
  SELECT cfk.player_id, 'K'::text AS position
  FROM "public"."career_football_kicking" cfk
  JOIN "public"."players" p ON p.id = cfk.player_id
  WHERE cfk.fga > 0
    AND p.position IS NULL
    AND p.is_dst = false
    AND NOT EXISTS (
      SELECT 1 FROM "public"."career_football_passing" cfp
      WHERE cfp.player_id = cfk.player_id AND cfp.att > 0
    )
`);
