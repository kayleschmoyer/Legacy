import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// Career Batting type
const CareerBattingRef = builder.objectRef<{
  playerId: number | null;
  g: number | null;
  pa: number | null;
  ab: number | null;
  r: number | null;
  h: number | null;
  doubles: number | null;
  triples: number | null;
  hr: number | null;
  rbi: number | null;
  sb: number | null;
  cs: number | null;
  bb: number | null;
  so: number | null;
  tb: number | null;
  gidp: number | null;
  hbp: number | null;
  sh: number | null;
  ibb: number | null;
}>('CareerBatting');

CareerBattingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId', { nullable: true }),
    games: t.exposeInt('g', { nullable: true }),
    plateAppearances: t.exposeInt('pa', { nullable: true }),
    atBats: t.exposeInt('ab', { nullable: true }),
    runs: t.exposeInt('r', { nullable: true }),
    hits: t.exposeInt('h', { nullable: true }),
    doubles: t.exposeInt('doubles', { nullable: true }),
    triples: t.exposeInt('triples', { nullable: true }),
    homeRuns: t.exposeInt('hr', { nullable: true }),
    rbi: t.exposeInt('rbi', { nullable: true }),
    stolenBases: t.exposeInt('sb', { nullable: true }),
    caughtStealing: t.exposeInt('cs', { nullable: true }),
    baseOnBalls: t.exposeInt('bb', { nullable: true }),
    strikeouts: t.exposeInt('so', { nullable: true }),
    totalBases: t.exposeInt('tb', { nullable: true }),
    groundedIntoDoublePlays: t.exposeInt('gidp', { nullable: true }),
    hitByPitch: t.exposeInt('hbp', { nullable: true }),
    sacrificeHits: t.exposeInt('sh', { nullable: true }),
    intentionalBaseOnBalls: t.exposeInt('ibb', { nullable: true }),
    // Computed statistics
    battingAverage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.h || !stats.ab || stats.ab === 0) return null;
        return stats.h / stats.ab;
      },
    }),
    onBasePercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.h || !stats.bb || !stats.hbp || !stats.ab || !stats.sh)
          return null;
        const numerator = stats.h + stats.bb + stats.hbp;
        const denominator = stats.ab + stats.bb + stats.hbp + (stats.sh || 0);
        return denominator === 0 ? null : numerator / denominator;
      },
    }),
    sluggingPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.tb || !stats.ab || stats.ab === 0) return null;
        return stats.tb / stats.ab;
      },
    }),
  }),
});

// Career Pitching type
const CareerPitchingRef = builder.objectRef<{
  playerId: number | null;
  w: number | null;
  l: number | null;
  g: number | null;
  gs: number | null;
  gf: number | null;
  cg: number | null;
  sho: number | null;
  sv: number | null;
  h: number | null;
  r: number | null;
  er: number | null;
  hr: number | null;
  bb: number | null;
  ibb: number | null;
  so: number | null;
  hbp: number | null;
  bk: number | null;
  wp: number | null;
  battersFaced: number | null;
  outsRecorded: number | null;
  outRate: number | null;
  era: string | null;
}>('CareerPitching');

CareerPitchingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId', { nullable: true }),
    wins: t.exposeInt('w', { nullable: true }),
    losses: t.exposeInt('l', { nullable: true }),
    games: t.exposeInt('g', { nullable: true }),
    gamesStarted: t.exposeInt('gs', { nullable: true }),
    gamesFinished: t.exposeInt('gf', { nullable: true }),
    completeGames: t.exposeInt('cg', { nullable: true }),
    shutouts: t.exposeInt('sho', { nullable: true }),
    saves: t.exposeInt('sv', { nullable: true }),
    hits: t.exposeInt('h', { nullable: true }),
    runs: t.exposeInt('r', { nullable: true }),
    earnedRuns: t.exposeInt('er', { nullable: true }),
    homeRuns: t.exposeInt('hr', { nullable: true }),
    baseOnBalls: t.exposeInt('bb', { nullable: true }),
    intentionalBaseOnBalls: t.exposeInt('ibb', { nullable: true }),
    strikeouts: t.exposeInt('so', { nullable: true }),
    hitByPitch: t.exposeInt('hbp', { nullable: true }),
    balks: t.exposeInt('bk', { nullable: true }),
    wildPitches: t.exposeInt('wp', { nullable: true }),
    battersFaced: t.exposeInt('battersFaced', { nullable: true }),
    outsRecorded: t.exposeInt('outsRecorded', { nullable: true }),
    outRate: t.exposeInt('outRate', { nullable: true }),
    era: t.exposeString('era', { nullable: true }),
    // Computed statistics
    winPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.w || !stats.l) return null;
        const totalDecisions = stats.w + stats.l;
        return totalDecisions === 0 ? null : stats.w / totalDecisions;
      },
    }),
  }),
});

// Career Fielding type
const CareerFieldingRef = builder.objectRef<{
  playerId: number | null;
  g: number | null;
  gs: number | null;
  cg: number | null;
  innDef: number | null;
  chances: number | null;
  po: number | null;
  a: number | null;
  eDef: number | null;
  dpDef: number | null;
  sb: number | null;
  cs: number | null;
  pickoffs: number | null;
  wp: number | null;
  pos: string | null;
}>('CareerFielding');

CareerFieldingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId', { nullable: true }),
    games: t.exposeInt('g', { nullable: true }),
    gamesStarted: t.exposeInt('gs', { nullable: true }),
    completeGames: t.exposeInt('cg', { nullable: true }),
    inningsDefended: t.exposeFloat('innDef', { nullable: true }),
    chances: t.exposeFloat('chances', { nullable: true }),
    putouts: t.exposeInt('po', { nullable: true }),
    assists: t.exposeInt('a', { nullable: true }),
    errors: t.exposeInt('eDef', { nullable: true }),
    doublePlays: t.exposeInt('dpDef', { nullable: true }),
    stolenBases: t.exposeInt('sb', { nullable: true }),
    caughtStealing: t.exposeInt('cs', { nullable: true }),
    pickoffs: t.exposeInt('pickoffs', { nullable: true }),
    wildPitches: t.exposeInt('wp', { nullable: true }),
    positions: t.exposeString('pos', { nullable: true }),
    // Computed statistics
    fieldingPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.po || !stats.a || !stats.eDef) return null;
        const totalChances = stats.po + stats.a + stats.eDef;
        return totalChances === 0 ? null : (stats.po + stats.a) / totalChances;
      },
    }),
  }),
});

// Season Batting type - matches database schema
const SeasonBattingRef = builder.objectRef<{
  playerId: number;
  season: number;
  team: string;
  lgId: string | null;
  g: number | null;
  pa: number | null;
  ab: number | null;
  r: number | null;
  h: number | null;
  doubles: number | null;
  triples: number | null;
  hr: number | null;
  rbi: number | null;
  sb: number | null;
  cs: number | null;
  bb: number | null;
  so: number | null;
  tb: number | null;
  gidp: number | null;
  hbp: number | null;
  sh: number | null;
  ibb: number | null;
  battingAvg: number | null;
  onbasePerc: number | null;
  sluggingPerc: number | null;
  onbasePlusSlugging: number | null;
  onbasePlusSluggingPlus: number | null;
  sf: string | null;
  posSeason: string | null;
  awardSummary: string | null;
  rowId: string;
}>('SeasonBatting');

SeasonBattingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    league: t.exposeString('lgId', { nullable: true }),
    games: t.exposeInt('g', { nullable: true }),
    plateAppearances: t.exposeInt('pa', { nullable: true }),
    atBats: t.exposeInt('ab', { nullable: true }),
    runs: t.exposeInt('r', { nullable: true }),
    hits: t.exposeInt('h', { nullable: true }),
    doubles: t.exposeInt('doubles', { nullable: true }),
    triples: t.exposeInt('triples', { nullable: true }),
    homeRuns: t.exposeInt('hr', { nullable: true }),
    rbi: t.exposeInt('rbi', { nullable: true }),
    stolenBases: t.exposeInt('sb', { nullable: true }),
    caughtStealing: t.exposeInt('cs', { nullable: true }),
    baseOnBalls: t.exposeInt('bb', { nullable: true }),
    strikeouts: t.exposeInt('so', { nullable: true }),
    totalBases: t.exposeInt('tb', { nullable: true }),
    groundedIntoDoublePlays: t.exposeInt('gidp', { nullable: true }),
    hitByPitch: t.exposeInt('hbp', { nullable: true }),
    sacrificeHits: t.exposeInt('sh', { nullable: true }),
    intentionalBaseOnBalls: t.exposeInt('ibb', { nullable: true }),
    // Computed statistics
    battingAverage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.h || !stats.ab || stats.ab === 0) return null;
        return stats.h / stats.ab;
      },
    }),
    onBasePercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.h || !stats.bb || !stats.hbp || !stats.ab || !stats.sh)
          return null;
        const numerator = stats.h + stats.bb + stats.hbp;
        const denominator = stats.ab + stats.bb + stats.hbp + (stats.sh || 0);
        return denominator === 0 ? null : numerator / denominator;
      },
    }),
    sluggingPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.tb || !stats.ab || stats.ab === 0) return null;
        return stats.tb / stats.ab;
      },
    }),
  }),
});

// Season Pitching type - matches database schema
const SeasonPitchingRef = builder.objectRef<{
  playerId: number;
  season: number;
  team: string;
  lgId: string | null;
  w: number | null;
  l: number | null;
  winLossPerc: string | null;
  earnedRunAvg: string | null;
  g: number | null;
  gs: number | null;
  gf: number | null;
  cg: number | null;
  sho: number | null;
  sv: number | null;
  ip: number | null;
  h: number | null;
  r: number | null;
  er: number | null;
  hr: number | null;
  bb: number | null;
  ibb: number | null;
  so: number | null;
  hbp: number | null;
  bk: number | null;
  wp: number | null;
  rowId: string;
  battersFaced: number | null;
  earnedRunAvgPlus: number | null;
  fip: number | null;
  whip: number | null;
  hitsPerNine: number | null;
  homeRunsPerNine: number | null;
  basesOnBallsPerNine: number | null;
  strikeoutsPerNine: number | null;
  strikeoutsPerBaseOnBalls: number | null;
  awardSummary: string | null;
  outsRecorded: number | null;
}>('SeasonPitching');

SeasonPitchingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season'),
    team: t.exposeString('team'),
    league: t.exposeString('lgId', { nullable: true }),
    wins: t.exposeInt('w', { nullable: true }),
    losses: t.exposeInt('l', { nullable: true }),
    winLossPercentage: t.exposeString('winLossPerc', { nullable: true }),
    earnedRunAverage: t.exposeString('earnedRunAvg', { nullable: true }),
    games: t.exposeInt('g', { nullable: true }),
    gamesStarted: t.exposeInt('gs', { nullable: true }),
    gamesFinished: t.exposeInt('gf', { nullable: true }),
    completeGames: t.exposeInt('cg', { nullable: true }),
    shutouts: t.exposeInt('sho', { nullable: true }),
    saves: t.exposeInt('sv', { nullable: true }),
    inningsPitched: t.exposeFloat('ip', { nullable: true }),
    hits: t.exposeInt('h', { nullable: true }),
    runs: t.exposeInt('r', { nullable: true }),
    earnedRuns: t.exposeInt('er', { nullable: true }),
    homeRuns: t.exposeInt('hr', { nullable: true }),
    baseOnBalls: t.exposeInt('bb', { nullable: true }),
    intentionalBaseOnBalls: t.exposeInt('ibb', { nullable: true }),
    strikeouts: t.exposeInt('so', { nullable: true }),
    hitByPitch: t.exposeInt('hbp', { nullable: true }),
    balks: t.exposeInt('bk', { nullable: true }),
    wildPitches: t.exposeInt('wp', { nullable: true }),
    rowId: t.exposeString('rowId'),
    battersFaced: t.exposeInt('battersFaced', { nullable: true }),
    earnedRunAveragePlus: t.exposeFloat('earnedRunAvgPlus', { nullable: true }),
    fip: t.exposeFloat('fip', { nullable: true }),
    whip: t.exposeFloat('whip', { nullable: true }),
    hitsPerNine: t.exposeFloat('hitsPerNine', { nullable: true }),
    homeRunsPerNine: t.exposeFloat('homeRunsPerNine', { nullable: true }),
    basesOnBallsPerNine: t.exposeFloat('basesOnBallsPerNine', {
      nullable: true,
    }),
    strikeoutsPerNine: t.exposeFloat('strikeoutsPerNine', { nullable: true }),
    strikeoutsPerBaseOnBalls: t.exposeFloat('strikeoutsPerBaseOnBalls', {
      nullable: true,
    }),
    awardSummary: t.exposeString('awardSummary', { nullable: true }),
    outsRecorded: t.exposeInt('outsRecorded', { nullable: true }),
    // Computed statistics
    winPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.w || !stats.l) return null;
        const totalDecisions = stats.w + stats.l;
        return totalDecisions === 0 ? null : stats.w / totalDecisions;
      },
    }),
  }),
});

// Season Fielding type - matches database schema
const SeasonFieldingRef = builder.objectRef<{
  playerId: number;
  season: number;
  pos: string;
  lgId: string | null;
  g: number | null;
  gs: number | null;
  cg: number | null;
  innDef: number | null;
  chances: number | null;
  po: number | null;
  a: number | null;
  eDef: number | null;
  dpDef: number | null;
  fieldingPerc: number | null;
  rangeFactorPerNine: number | null;
  rangeFactorPerGame: number | null;
  fieldingPercLg: number | null;
  rangeFactorPerNineLg: number | null;
  rangeFactorPerGameLg: number | null;
  gOfParts: number | null;
  sb: number | null;
  cs: number | null;
  caughtStealingPerc: number | null;
  caughtStealingPercLg: number | null;
  pickoffs: number | null;
  awardSummary: string | null;
  wp: number | null;
  team: string;
  rowId: string;
}>('SeasonFielding');

SeasonFieldingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season'),
    position: t.exposeString('pos'),
    league: t.exposeString('lgId', { nullable: true }),
    games: t.exposeInt('g', { nullable: true }),
    gamesStarted: t.exposeInt('gs', { nullable: true }),
    completeGames: t.exposeInt('cg', { nullable: true }),
    inningsDefended: t.exposeFloat('innDef', { nullable: true }),
    chances: t.exposeFloat('chances', { nullable: true }),
    putouts: t.exposeInt('po', { nullable: true }),
    assists: t.exposeInt('a', { nullable: true }),
    errors: t.exposeInt('eDef', { nullable: true }),
    doublePlays: t.exposeInt('dpDef', { nullable: true }),
    fieldingPercentage: t.exposeFloat('fieldingPerc', { nullable: true }),
    rangeFactorPerNine: t.exposeFloat('rangeFactorPerNine', { nullable: true }),
    rangeFactorPerGame: t.exposeFloat('rangeFactorPerGame', { nullable: true }),
    fieldingPercentageLeague: t.exposeFloat('fieldingPercLg', {
      nullable: true,
    }),
    rangeFactorPerNineLeague: t.exposeFloat('rangeFactorPerNineLg', {
      nullable: true,
    }),
    rangeFactorPerGameLeague: t.exposeFloat('rangeFactorPerGameLg', {
      nullable: true,
    }),
    gamesOfParts: t.exposeInt('gOfParts', { nullable: true }),
    stolenBases: t.exposeInt('sb', { nullable: true }),
    caughtStealing: t.exposeInt('cs', { nullable: true }),
    caughtStealingPercentage: t.exposeFloat('caughtStealingPerc', {
      nullable: true,
    }),
    caughtStealingPercentageLeague: t.exposeFloat('caughtStealingPercLg', {
      nullable: true,
    }),
    pickoffs: t.exposeInt('pickoffs', { nullable: true }),
    awardSummary: t.exposeString('awardSummary', { nullable: true }),
    wildPitches: t.exposeInt('wp', { nullable: true }),
    team: t.exposeString('team'),
    rowId: t.exposeString('rowId'),
  }),
});

// Add career batting statistics query
builder.queryField('careerBattingStats', (t) =>
  t.field({
    type: [CareerBattingRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      minGames: t.arg.int({ required: false }),
      minHomeRuns: t.arg.int({ required: false }),
      minRBI: t.arg.int({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.getCareerBattingStats({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: args.orderBy || undefined,
        orderDirection: args.orderDirection as 'asc' | 'desc' | undefined,
        filters: {
          minGames: args.minGames || undefined,
          minHomeRuns: args.minHomeRuns || undefined,
          minRBI: args.minRBI || undefined,
        },
      });
    },
  }),
);

// Add career pitching statistics query
builder.queryField('careerPitchingStats', (t) =>
  t.field({
    type: [CareerPitchingRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      minGames: t.arg.int({ required: false }),
      minWins: t.arg.int({ required: false }),
      minStrikeouts: t.arg.int({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.getCareerPitchingStats({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: args.orderBy || undefined,
        orderDirection: args.orderDirection as 'asc' | 'desc' | undefined,
        filters: {
          minGames: args.minGames || undefined,
          minWins: args.minWins || undefined,
          minStrikeouts: args.minStrikeouts || undefined,
        },
      });
    },
  }),
);

// Add career fielding statistics query
builder.queryField('careerFieldingStats', (t) =>
  t.field({
    type: [CareerFieldingRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      minGames: t.arg.int({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.getCareerFieldingStats({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: args.orderBy || undefined,
        orderDirection: args.orderDirection as 'asc' | 'desc' | undefined,
        filters: {
          minGames: args.minGames || undefined,
        },
      });
    },
  }),
);

// Add individual player career statistics queries
builder.queryField('playerCareerBatting', (t) =>
  t.field({
    type: CareerBattingRef,
    nullable: true,
    args: {
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (parent, { playerId }) => {
      return dbService.statistics.getPlayerCareerBatting(playerId);
    },
  }),
);

builder.queryField('playerCareerPitching', (t) =>
  t.field({
    type: CareerPitchingRef,
    nullable: true,
    args: {
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (parent, { playerId }) => {
      return dbService.statistics.getPlayerCareerPitching(playerId);
    },
  }),
);

builder.queryField('playerCareerFielding', (t) =>
  t.field({
    type: CareerFieldingRef,
    nullable: true,
    args: {
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (parent, { playerId }) => {
      return dbService.statistics.getPlayerCareerFielding(playerId);
    },
  }),
);

// Season-level statistics queries
builder.queryField('seasonBattingStats', (t) =>
  t.field({
    type: [SeasonBattingRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      playerId: t.arg.int({ required: false }),
      season: t.arg.int({ required: false }),
      team: t.arg.string({ required: false }),
      minGames: t.arg.int({ required: false }),
      minHomeRuns: t.arg.int({ required: false }),
      minRBI: t.arg.int({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.getSeasonBattingStats({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: args.orderBy || undefined,
        orderDirection: args.orderDirection as 'asc' | 'desc' | undefined,
        filters: {
          playerId: args.playerId || undefined,
          season: args.season || undefined,
          team: args.team || undefined,
          minGames: args.minGames || undefined,
          minHomeRuns: args.minHomeRuns || undefined,
          minRBI: args.minRBI || undefined,
        },
      });
    },
  }),
);

builder.queryField('seasonPitchingStats', (t) =>
  t.field({
    type: [SeasonPitchingRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      playerId: t.arg.int({ required: false }),
      season: t.arg.int({ required: false }),
      team: t.arg.string({ required: false }),
      minGames: t.arg.int({ required: false }),
      minWins: t.arg.int({ required: false }),
      minStrikeouts: t.arg.int({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.getSeasonPitchingStats({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: args.orderBy || undefined,
        orderDirection: args.orderDirection as 'asc' | 'desc' | undefined,
        filters: {
          playerId: args.playerId || undefined,
          season: args.season || undefined,
          team: args.team || undefined,
          minGames: args.minGames || undefined,
          minWins: args.minWins || undefined,
          minStrikeouts: args.minStrikeouts || undefined,
        },
      });
    },
  }),
);

builder.queryField('seasonFieldingStats', (t) =>
  t.field({
    type: [SeasonFieldingRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      playerId: t.arg.int({ required: false }),
      season: t.arg.int({ required: false }),
      team: t.arg.string({ required: false }),
      minGames: t.arg.int({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.getSeasonFieldingStats({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: args.orderBy || undefined,
        orderDirection: args.orderDirection as 'asc' | 'desc' | undefined,
        filters: {
          playerId: args.playerId || undefined,
          season: args.season || undefined,
          team: args.team || undefined,
          minGames: args.minGames || undefined,
        },
      });
    },
  }),
);

// Player-specific season statistics queries
builder.queryField('playerSeasonBatting', (t) =>
  t.field({
    type: [SeasonBattingRef],
    args: {
      playerId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, { playerId, season }) => {
      return dbService.statistics.getSeasonBattingStats({
        filters: {
          playerId,
          season: season || undefined,
        },
      });
    },
  }),
);

builder.queryField('playerSeasonPitching', (t) =>
  t.field({
    type: [SeasonPitchingRef],
    args: {
      playerId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, { playerId, season }) => {
      return dbService.statistics.getSeasonPitchingStats({
        filters: {
          playerId,
          season: season || undefined,
        },
      });
    },
  }),
);

builder.queryField('playerSeasonFielding', (t) =>
  t.field({
    type: [SeasonFieldingRef],
    args: {
      playerId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, { playerId, season }) => {
      return dbService.statistics.getSeasonFieldingStats({
        filters: {
          playerId,
          season: season || undefined,
        },
      });
    },
  }),
);
