import {
  pgTable,
  unique,
  serial,
  text,
  varchar,
  foreignKey,
  integer,
  date,
  index,
  timestamp,
  bigint,
  numeric,
  doublePrecision,
  primaryKey,
  char,
  pgEnum,
  pgView,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { players } from './Players';

export const seasonFielding = pgTable(
  'season_fielding',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    pos: varchar('pos', { length: 10 }).notNull(),
    lgId: varchar('lg_id', { length: 20 }),
    g: integer('g'),
    gs: integer('gs'),
    cg: integer('cg'),
    innDef: doublePrecision('inn_def'),
    chances: doublePrecision('chances'),
    po: integer('po'),
    a: integer('a'),
    eDef: integer('e_def'),
    dpDef: integer('dp_def'),
    fieldingPerc: doublePrecision('fielding_perc'),
    rangeFactorPerNine: doublePrecision('range_factor_per_nine'),
    rangeFactorPerGame: doublePrecision('range_factor_per_game'),
    fieldingPercLg: doublePrecision('fielding_perc_lg'),
    rangeFactorPerNineLg: doublePrecision('range_factor_per_nine_lg'),
    rangeFactorPerGameLg: doublePrecision('range_factor_per_game_lg'),
    gOfParts: integer('g_of_parts'),
    sb: integer('sb'),
    cs: integer('cs'),
    caughtStealingPerc: doublePrecision('caught_stealing_perc'),
    caughtStealingPercLg: doublePrecision('caught_stealing_perc_lg'),
    pickoffs: integer('pickoffs'),
    awardSummary: text('award_summary'),
    wp: integer('wp'),
    team: varchar('team', { length: 20 }).notNull(),
    rowId: varchar('row_id', { length: 10 }).notNull(),
  },
  (table) => {
    return {
      playerIdIdx: index().using('btree', table.playerId.asc().nullsLast()),
      playerIdPosIdx: index().using(
        'btree',
        table.playerId.asc().nullsLast(),
        table.pos.asc().nullsLast()
      ),
      poIdx: index().using('btree', table.po.asc().nullsLast()),
      seasonFieldingPlayersIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'season_fielding_players_id_fk',
      }),
      seasonFieldingPk: primaryKey({
        columns: [
          table.playerId,
          table.season,
          table.pos,
          table.team,
          table.rowId,
        ],
        name: 'season_fielding_pk',
      }),
    };
  }
);

export const seasonBatting = pgTable(
  'season_batting',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    g: integer('g'),
    pa: integer('pa'),
    ab: integer('ab'),
    r: integer('r'),
    h: integer('h'),
    doubles: integer('doubles'),
    triples: integer('triples'),
    hr: integer('hr'),
    rbi: integer('rbi'),
    sb: integer('sb'),
    cs: integer('cs'),
    bb: integer('bb'),
    so: integer('so'),
    battingAvg: doublePrecision('batting_avg'),
    onbasePerc: doublePrecision('onbase_perc'),
    sluggingPerc: doublePrecision('slugging_perc'),
    onbasePlusSlugging: doublePrecision('onbase_plus_slugging'),
    onbasePlusSluggingPlus: doublePrecision('onbase_plus_slugging_plus'),
    tb: integer('tb'),
    gidp: integer('gidp'),
    hbp: integer('hbp'),
    sh: integer('sh'),
    sf: varchar('sf', { length: 10 }),
    ibb: integer('ibb'),
    posSeason: varchar('pos_season', { length: 50 }),
    awardSummary: text('award_summary'),
    lgId: varchar('lg_id', { length: 20 }),
    team: varchar('team', { length: 20 }).notNull(),
    rowId: varchar('row_id', { length: 10 }).notNull(),
  },
  (table) => {
    return {
      hrIdx: index().using('btree', table.hr.asc().nullsLast()),
      playerIdIdx: index().using('btree', table.playerId.asc().nullsLast()),
      seasonBattingPlayersIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'season_batting_players_id_fk',
      }),
      seasonBattingPk: primaryKey({
        columns: [table.playerId, table.season, table.team, table.rowId],
        name: 'season_batting_pk',
      }),
    };
  }
);

export const seasonPitching = pgTable(
  'season_pitching',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    w: integer('w'),
    l: integer('l'),
    winLossPerc: numeric('win_loss_perc'),
    earnedRunAvg: numeric('earned_run_avg'),
    g: integer('g'),
    gs: integer('gs'),
    gf: integer('gf'),
    cg: integer('cg'),
    sho: integer('sho'),
    sv: integer('sv'),
    ip: doublePrecision('ip'),
    h: integer('h'),
    r: integer('r'),
    er: integer('er'),
    hr: integer('hr'),
    bb: integer('bb'),
    ibb: integer('ibb'),
    so: integer('so'),
    hbp: integer('hbp'),
    bk: integer('bk'),
    wp: integer('wp'),
    rowId: varchar('row_id', { length: 10 }).notNull(),
    battersFaced: integer('batters_faced'),
    earnedRunAvgPlus: doublePrecision('earned_run_avg_plus'),
    fip: doublePrecision('fip'),
    whip: doublePrecision('whip'),
    hitsPerNine: doublePrecision('hits_per_nine'),
    homeRunsPerNine: doublePrecision('home_runs_per_nine'),
    basesOnBallsPerNine: doublePrecision('bases_on_balls_per_nine'),
    strikeoutsPerNine: doublePrecision('strikeouts_per_nine'),
    strikeoutsPerBaseOnBalls: doublePrecision('strikeouts_per_base_on_balls'),
    awardSummary: text('award_summary'),
    team: varchar('team', { length: 20 }).notNull(),
    lgId: varchar('lg_id', { length: 20 }),
    outsRecorded: integer('outs_recorded').generatedAlwaysAs(
      sql`((floor(ip) * (3)::double precision) + ((ip - floor(ip)) * (10)::double precision))`
    ),
  },
  (table) => {
    return {
      playerIdIdx: index().using('btree', table.playerId.asc().nullsLast()),
      wIdx: index().using('btree', table.w.asc().nullsLast()),
      seasonPitchingPlayersIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'season_pitching_players_id_fk',
      }),
      seasonPitchingPk: primaryKey({
        columns: [table.playerId, table.season, table.team, table.rowId],
        name: 'season_pitching_pk',
      }),
    };
  }
);

export const careerBatting = pgView('career_batting', {
  playerId: integer('player_id').references(() => players.id),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  g: bigint('g', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  pa: bigint('pa', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  ab: bigint('ab', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  r: bigint('r', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  h: bigint('h', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  doubles: bigint('doubles', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  triples: bigint('triples', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  hr: bigint('hr', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  rbi: bigint('rbi', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  sb: bigint('sb', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  cs: bigint('cs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  bb: bigint('bb', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  so: bigint('so', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  tb: bigint('tb', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  gidp: bigint('gidp', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  hbp: bigint('hbp', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  sh: bigint('sh', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  ibb: bigint('ibb', { mode: 'number' }),
}).as(sql`SELECT player_id,
       sum(g)       AS g,
       sum(pa)      AS pa,
       sum(ab)      AS ab,
       sum(r)       AS r,
       sum(h)       AS h,
       sum(doubles) AS doubles,
       sum(triples) AS triples,
       sum(hr)      AS hr,
       sum(rbi)     AS rbi,
       sum(sb)      AS sb,
       sum(cs)      AS cs,
       sum(bb)      AS bb,
       sum(so)      AS so,
       sum(tb)      AS tb,
       sum(gidp)    AS gidp,
       sum(hbp)     AS hbp,
       sum(sh)      AS sh,
       sum(ibb)     AS ibb
FROM season_batting
WHERE ((SELECT count(1) AS count
        FROM regexp_split_to_table(season_batting.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
        WHERE
            season_batting.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) >
      0
GROUP BY player_id`);

export const careerPitching = pgView('career_pitching', {
  playerId: integer('player_id').references(() => players.id),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  w: bigint('w', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  l: bigint('l', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  g: bigint('g', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  gs: bigint('gs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  gf: bigint('gf', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  cg: bigint('cg', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  sho: bigint('sho', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  sv: bigint('sv', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  h: bigint('h', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  r: bigint('r', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  er: bigint('er', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  hr: bigint('hr', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  bb: bigint('bb', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  ibb: bigint('ibb', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  so: bigint('so', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  hbp: bigint('hbp', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  bk: bigint('bk', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  wp: bigint('wp', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  battersFaced: bigint('batters_faced', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  outsRecorded: bigint('outs_recorded', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  outRate: bigint('out_rate', { mode: 'number' }),
  era: numeric('era'),
}).as(sql`SELECT player_id,
       w,
       l,
       g,
       gs,
       gf,
       cg,
       sho,
       sv,
       h,
       r,
       er,
       hr,
       bb,
       ibb,
       so,
       hbp,
       bk,
       wp,
       batters_faced,
       outs_recorded,
       out_rate,
       era
FROM (SELECT season_pitching.player_id,
             sum(season_pitching.w)             AS w,
             sum(season_pitching.l)             AS l,
             sum(season_pitching.g)             AS g,
             sum(season_pitching.gs)            AS gs,
             sum(season_pitching.gf)            AS gf,
             sum(season_pitching.cg)            AS cg,
             sum(season_pitching.sho)           AS sho,
             sum(season_pitching.sv)            AS sv,
             sum(season_pitching.h)             AS h,
             sum(season_pitching.r)             AS r,
             sum(season_pitching.er)            AS er,
             sum(season_pitching.hr)            AS hr,
             sum(season_pitching.bb)            AS bb,
             sum(season_pitching.ibb)           AS ibb,
             sum(season_pitching.so)            AS so,
             sum(season_pitching.hbp)           AS hbp,
             sum(season_pitching.bk)            AS bk,
             sum(season_pitching.wp)            AS wp,
             sum(season_pitching.batters_faced) AS batters_faced,
             sum(season_pitching.outs_recorded) AS outs_recorded,
             sum(season_pitching.outs_recorded) /
             CASE sum(season_pitching.batters_faced)
                 WHEN 0 THEN 1::bigint
                 ELSE sum(season_pitching.batters_faced)
                 END                            AS out_rate,
             sum(season_pitching.er)::numeric /
             CASE sum(season_pitching.outs_recorded)
                 WHEN 0 THEN 1::bigint::numeric
                 ELSE sum(season_pitching.outs_recorded)::numeric / 27.0
                 END                            AS era
      FROM season_pitching
      WHERE ((SELECT count(1) AS count
              FROM regexp_split_to_table(season_pitching.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
              WHERE season_pitching.lg_id::text = ANY
                    (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) > 0
      GROUP BY season_pitching.player_id) unnamed_subquery;`);

export const careerFieldingByPosition = pgView('career_fielding_by_position', {
  playerId: integer('player_id').references(() => players.id),
  pos: varchar('pos', { length: 10 }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  g: bigint('g', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  gs: bigint('gs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  cg: bigint('cg', { mode: 'number' }),
  innDef: doublePrecision('inn_def'),
  chances: doublePrecision('chances'),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  po: bigint('po', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  a: bigint('a', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  eDef: bigint('e_def', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  dpDef: bigint('dp_def', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  sb: bigint('sb', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  cs: bigint('cs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  pickoffs: bigint('pickoffs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  wp: bigint('wp', { mode: 'number' }),
}).as(sql`SELECT player_id,
       pos,
       sum(g)        AS g,
       sum(gs)       AS gs,
       sum(cg)       AS cg,
       sum(inn_def)  AS inn_def,
       sum(chances)  AS chances,
       sum(po)       AS po,
       sum(a)        AS a,
       sum(e_def)    AS e_def,
       sum(dp_def)   AS dp_def,
       sum(sb)       AS sb,
       sum(cs)       AS cs,
       sum(pickoffs) AS pickoffs,
       sum(wp)       AS wp
FROM season_fielding
WHERE ((SELECT count(1) AS count
        FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
        WHERE
            season_fielding.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) >
      0
GROUP BY player_id, pos`);

export const careerFielding = pgView('career_fielding', {
  playerId: integer('player_id').references(() => players.id),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  g: bigint('g', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  gs: bigint('gs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  cg: bigint('cg', { mode: 'number' }),
  innDef: doublePrecision('inn_def'),
  chances: doublePrecision('chances'),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  po: bigint('po', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  a: bigint('a', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  eDef: bigint('e_def', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  dpDef: bigint('dp_def', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  sb: bigint('sb', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  cs: bigint('cs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  pickoffs: bigint('pickoffs', { mode: 'number' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  wp: bigint('wp', { mode: 'number' }),
  pos: text('pos'),
}).as(sql`SELECT player_id,
       sum(g)        AS g,
       sum(gs)       AS gs,
       sum(cg)       AS cg,
       sum(inn_def)  AS inn_def,
       sum(chances)  AS chances,
       sum(po)       AS po,
       sum(a)        AS a,
       sum(e_def)    AS e_def,
       sum(dp_def)   AS dp_def,
       sum(sb)       AS sb,
       sum(cs)       AS cs,
       sum(pickoffs) AS pickoffs,
       sum(wp)       AS wp
FROM season_fielding
WHERE ((SELECT count(1) AS count
        FROM regexp_split_to_table(season_fielding.lg_id::text, ','::text) regexp_split_to_table(regexp_split_to_table)
        WHERE
            season_fielding.lg_id::text = ANY (ARRAY ['AL'::character varying::text, 'NL'::character varying::text]))) >
      0
GROUP BY player_id`);

export const gameBatting = pgTable(
  'game_batting',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_number').notNull(),
    gameIdentifier: char('game_identifier', { length: 12 }).notNull(),
    pa: integer('pa'),
    ab: integer('ab'),
    r: integer('r'),
    h: integer('h'),
    doubles: integer('doubles'),
    triples: integer('triples'),
    hr: integer('hr'),
    rbi: integer('rbi'),
    sb: integer('sb'),
    cs: integer('cs'),
    bb: integer('bb'),
    so: integer('so'),
    gidp: integer('gidp'),
    hbp: integer('hbp'),
    sh: integer('sh'),
    sf: varchar('sf', { length: 10 }),
    ibb: integer('ibb'),
  },
  (table) => {
    return {};
  }
);

export const gamePitching = pgTable(
  'game_pitching',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: char('game_identifier', { length: 12 }).notNull(),
    w: integer('w'),
    l: integer('l'),
    gs: integer('gs'),
    gf: integer('gf'),
    cg: integer('cg'),
    sho: integer('sho'),
    sv: integer('sv'),
    ip: doublePrecision('ip'),
    h: integer('h'),
    r: integer('r'),
    er: integer('er'),
    hr: integer('hr'),
    bb: integer('bb'),
    ibb: integer('ibb'),
    so: integer('so'),
    hbp: integer('hbp'),
    battersFaced: integer('batters_faced'),
    outsRecorded: integer('outs_recorded').generatedAlwaysAs(
      sql`((floor(ip) * (3)::double precision) + ((ip - floor(ip)) * (10)::double precision))`
    ),
  },
  (table) => {
    return {};
  }
);

export const gameFielding = pgTable(
  'game_fielding',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    gameNum: integer('game_num').notNull(),
    gameIdentifier: char('game_identifier', { length: 12 }).notNull(),
    innDef: doublePrecision('inn_def'),
    chances: doublePrecision('chances'),
    po: integer('po'),
    a: integer('a'),
    eDef: integer('e_def'),
    dpDef: integer('dp_def'),
  },
  (table) => {
    return {};
  }
);

export const aggregateSeasonPitching = pgView('aggregate_season_pitching', {
  playerId: integer('player_id').notNull(),
  season: integer('season').notNull(),
  w: bigint('w', { mode: 'number' }),
  l: bigint('l', { mode: 'number' }),
  g: bigint('g', { mode: 'number' }),
  gs: bigint('gs', { mode: 'number' }),
  gf: bigint('gf', { mode: 'number' }),
  cg: bigint('cg', { mode: 'number' }),
  sho: bigint('sho', { mode: 'number' }),
  sv: bigint('sv', { mode: 'number' }),
  h: bigint('h', { mode: 'number' }),
  r: bigint('r', { mode: 'number' }),
  er: bigint('er', { mode: 'number' }),
  hr: bigint('hr', { mode: 'number' }),
  bb: bigint('bb', { mode: 'number' }),
  ibb: bigint('ibb', { mode: 'number' }),
  so: bigint('so', { mode: 'number' }),
  hbp: bigint('hbp', { mode: 'number' }),
  bk: bigint('bk', { mode: 'number' }),
  wp: bigint('wp', { mode: 'number' }),
  battersFaced: bigint('batters_faced', { mode: 'number' }),
  outsRecorded: bigint('outs_recorded', { mode: 'number' }),
}).as(sql``);

export const aggregateSeasonFielding = pgView('aggregate_season_fielding', {
  playerId: integer('player_id').notNull(),
  season: integer('season').notNull(),
  g: integer('g'),
  gs: integer('gs'),
  cg: integer('cg'),
  innDef: doublePrecision('inn_def'),
  chances: doublePrecision('chances'),
  po: integer('po'),
  a: integer('a'),
  eDef: integer('e_def'),
  dpDef: integer('dp_def'),
  sb: integer('sb'),
  cs: integer('cs'),
  pickoffs: integer('pickoffs'),
  wp: integer('wp'),
}).as(sql``);

export const aggregateSeasonFieldingByPos = pgView(
  'aggregate_season_fielding_by_pos',
  {
    playerId: integer('player_id').notNull(),
    season: integer('season').notNull(),
    pos: char('pos', { length: 2 }).notNull(),
    g: integer('g'),
    gs: integer('gs'),
    cg: integer('cg'),
    innDef: doublePrecision('inn_def'),
    chances: doublePrecision('chances'),
    po: integer('po'),
    a: integer('a'),
    eDef: integer('e_def'),
    dpDef: integer('dp_def'),
    sb: integer('sb'),
    cs: integer('cs'),
    pickoffs: integer('pickoffs'),
    wp: integer('wp'),
  }
).as(sql``);

export const aggregateSeasonBatting = pgView('aggregate_season_batting', {
  playerId: integer('player_id').notNull(),
  season: integer('season').notNull(),
  g: integer('g'),
  pa: integer('pa'),
  ab: integer('ab'),
  r: integer('r'),
  h: integer('h'),
  doubles: integer('doubles'),
  triples: integer('triples'),
  hr: integer('hr'),
  rbi: integer('rbi'),
  sb: integer('sb'),
  cs: integer('cs'),
  bb: integer('bb'),
  so: integer('so'),
  tb: integer('tb'),
  gidp: integer('gidp'),
  hbp: integer('hbp'),
  sh: integer('sh'),
  sf: varchar('sf', { length: 10 }),
  ibb: integer('ibb'),
}).as(sql``);
