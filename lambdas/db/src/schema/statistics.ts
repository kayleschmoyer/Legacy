import {
  computeOnBasePercentage,
  createDatabaseService,
  normalizeSearchTerm,
} from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';
import { hasEntitlement } from './authorization';
import { ENTITLEMENTS } from './entitlements';

/**
 * Mirrors DEFAULT_BATTING_SCORING / DEFAULT_PITCHING_SCORING from
 * lib/scoring/src/baseball/DefaultScoring.ts. Inlined rather than imported —
 * `@legacy-sports/scoring` depends on `@legacy-sports/db-client`, and this
 * module is required early in schema/index.ts's registration order; pulling
 * scoring in here left `PublicSchema` (from db-client) partially initialized
 * by the time football.ts's module-level FOOTBALL_STAT_SORTS map ran later,
 * breaking unrelated football resolver tests (LS-8569).
 */
function computeLinearScore<T extends Record<string, number | null>>(
  stats: T,
  weights: Partial<Record<keyof T, number>>,
): number {
  let sum = 0;
  for (const key in weights) {
    const weight = weights[key];
    const value = stats[key];
    if (weight != null && value != null) {
      sum += weight * value;
    }
  }
  return sum;
}

/** Mirrors DEFAULT_BATTING_SCORING (lib/scoring/src/baseball/DefaultScoring.ts). */
const BATTING_SCORING_WEIGHTS = {
  cs: -1,
  doubles: 2,
  h: 1,
  hbp: 1,
  hr: 4,
  r: 1,
  rbi: 1,
  sb: 2,
  so: -0.5,
  triples: 3,
};

/** Mirrors DEFAULT_PITCHING_SCORING (lib/scoring/src/baseball/DefaultScoring.ts). */
const PITCHING_SCORING_WEIGHTS = {
  bb: -1,
  er: -2,
  h: -1,
  l: -2,
  outsRecorded: 1,
  so: 1,
  sv: 5,
  w: 5,
};

/** Picks the numeric fields BATTING_SCORING_WEIGHTS needs off a CareerBatting row. */
function battingScoringRecord(stats: {
  h: number | null;
  doubles: number | null;
  triples: number | null;
  hr: number | null;
  r: number | null;
  rbi: number | null;
  sb: number | null;
  cs: number | null;
  hbp: number | null;
  so: number | null;
}) {
  return stats;
}

/** Picks the numeric fields PITCHING_SCORING_WEIGHTS needs off a CareerPitching row. */
function pitchingScoringRecord(stats: {
  bb: number | null;
  er: number | null;
  h: number | null;
  l: number | null;
  outsRecorded: number | null;
  so: number | null;
  sv: number | null;
  w: number | null;
}) {
  return stats;
}

/**
 * Statistics Schema - Connection-Based Pagination
 *
 * All statistics queries use relay-style connections with:
 * - Cursor-based pagination (first/after args)
 * - Built-in totalCount for UI display
 * - Standard pageInfo with hasNextPage/hasPreviousPage
 * - Proper edge/node structure
 *
 * Example query:
 * careerBattingStats(first: 25, minGames: 10) {
 *   totalCount
 *   pageInfo { hasNextPage hasPreviousPage }
 *   edges { node { homeRuns playerId } cursor }
 * }
 */

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// Type definitions for statistics
interface PositionGames {
  games: number;
  position?: string;
}

/** Safely parse positionsPlayed (may be object or JSON string) into entries. */
function parsePositionEntries(positions: unknown): [string, unknown][] | null {
  if (typeof positions === 'object' && positions !== null) {
    const entries = Object.entries(positions);
    return entries.length > 0 ? entries : null;
  }

  if (typeof positions === 'string') {
    const parsed: unknown = JSON.parse(positions);
    if (typeof parsed === 'object' && parsed !== null) {
      const entries = Object.entries(parsed);
      return entries.length > 0 ? entries : null;
    }
  }

  return null;
}

/** Find the position with the most games played from position entries. */
function findPrimaryPosition(entries: [string, unknown][]): string | null {
  const primaryPos = entries.reduce((max, current) => {
    const currentGames = (current[1] as PositionGames)?.games || 0;
    const maxGames = (max[1] as PositionGames)?.games || 0;
    return currentGames > maxGames ? current : max;
  });
  return (primaryPos[1] as PositionGames)?.position || primaryPos[0];
}

/** Resolve the positionsPlayed field to a JSON string. */
function resolvePositionsPlayed(positions: unknown): string | null {
  if (typeof positions === 'object' && positions !== null) {
    return JSON.stringify(positions);
  }
  if (typeof positions === 'string') {
    return positions;
  }
  return null;
}

// Game Batting type - stats from a single game
export const GameBattingRef = builder.objectRef<{
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
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
  gidp: number | null;
  hbp: number | null;
  sh: number | null;
  sf: string | null;
  ibb: number | null;
}>('GameBatting');

GameBattingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season'),
    gameNum: t.exposeInt('gameNum'),
    gameIdentifier: t.exposeString('gameIdentifier'),
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
    groundedIntoDoublePlays: t.exposeInt('gidp', { nullable: true }),
    hitByPitch: t.exposeInt('hbp', { nullable: true }),
    sacrificeHits: t.exposeInt('sh', { nullable: true }),
    sacrificeFlies: t.exposeString('sf', { nullable: true }),
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
  }),
});

// Game Pitching type - stats from a single game
export const GamePitchingRef = builder.objectRef<{
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  w: number | null;
  l: number | null;
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
  battersFaced: number | null;
  outsRecorded: number | null;
}>('GamePitching');

GamePitchingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season'),
    gameNum: t.exposeInt('gameNum'),
    gameIdentifier: t.exposeString('gameIdentifier'),
    wins: t.exposeInt('w', { nullable: true }),
    losses: t.exposeInt('l', { nullable: true }),
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
    battersFaced: t.exposeInt('battersFaced', { nullable: true }),
    outsRecorded: t.exposeInt('outsRecorded', { nullable: true }),
    // Computed statistics
    era: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.er || !stats.ip || stats.ip === 0) return null;
        return (stats.er * 9) / stats.ip;
      },
    }),
  }),
});

// Game Fielding type - stats from a single game
export const GameFieldingRef = builder.objectRef<{
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  pos: string;
  g: number | null;
  gs: number | null;
  inn: number | null;
  po: number | null;
  a: number | null;
  e: number | null;
  dp: number | null;
  pb: number | null;
  sb: number | null;
  cs: number | null;
}>('GameFielding');

GameFieldingRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId'),
    season: t.exposeInt('season'),
    gameNum: t.exposeInt('gameNum'),
    gameIdentifier: t.exposeString('gameIdentifier'),
    position: t.exposeString('pos'),
    games: t.exposeInt('g', { nullable: true }),
    gamesStarted: t.exposeInt('gs', { nullable: true }),
    inningsPlayed: t.exposeFloat('inn', { nullable: true }),
    putouts: t.exposeInt('po', { nullable: true }),
    assists: t.exposeInt('a', { nullable: true }),
    errors: t.exposeInt('e', { nullable: true }),
    doublePlays: t.exposeInt('dp', { nullable: true }),
    passedBalls: t.exposeInt('pb', { nullable: true }),
    stolenBasesAllowed: t.exposeInt('sb', { nullable: true }),
    caughtStealing: t.exposeInt('cs', { nullable: true }),
    // Computed statistics
    fieldingPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.po || !stats.a || !stats.e) return null;
        const total = stats.po + stats.a + stats.e;
        return total === 0 ? null : (stats.po + stats.a) / total;
      },
    }),
  }),
});

// Career Batting type
export const CareerBattingRef = builder.objectRef<{
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
  sf: number | null;
  offensiveWar: number | null;
  defensiveWar: number | null;
  totalWar: number | null;
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
      // Same formula the OBP/OPS sort uses (LS-10846).
      resolve: (stats) => computeOnBasePercentage(stats),
    }),
    sluggingPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.tb || !stats.ab || stats.ab === 0) return null;
        return stats.tb / stats.ab;
      },
    }),
    /**
     * Offensive WAR — summed from Baseball Reference's per-season bwar values
     * stored in season_batting.
     */
    offensiveWAR: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Offensive WAR (oWAR) from Baseball Reference. ' +
        'Career total is the sum of per-season bwar values, rounded to one decimal.',
      resolve: (stats) => stats.offensiveWar ?? null,
    }),
    defensiveWAR: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Defensive WAR (dWAR) from Baseball Reference. ' +
        'Career total is the sum of per-season dwar values, rounded to one decimal. ' +
        'Null until dwar data is imported.',
      resolve: (stats) => stats.defensiveWar ?? null,
    }),
    totalWAR: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Total WAR (oWAR + dWAR) from Baseball Reference. ' +
        'Non-null only when both offensive and defensive WAR data are available.',
      resolve: (stats) => stats.totalWar ?? null,
    }),
    /**
     * Career fantasy points using DEFAULT_BATTING_SCORING (LS-8569). A real
     * weighted-sum SQL expression backs sorting on this field (see
     * `totalScore` in TypeSafeQueryBuilder.ts) — unlike football, MLB default
     * scoring is a linear combination of stored career columns.
     */
    fantasyPoints: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Career fantasy points using default scoring settings ' +
        '(lib/scoring/src/baseball/DefaultScoring.ts).',
      resolve: (stats) =>
        computeLinearScore(
          battingScoringRecord(stats),
          BATTING_SCORING_WEIGHTS,
        ),
    }),
    fantasyPointsPerGame: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Average fantasy points per game using default scoring settings. ' +
        '0 for players with no recorded games.',
      resolve: (stats) =>
        stats.g
          ? computeLinearScore(
              battingScoringRecord(stats),
              BATTING_SCORING_WEIGHTS,
            ) / stats.g
          : 0,
    }),
    // Player relationship
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (stats, _args, context) => {
        if (!stats.playerId) return null;
        return context.loaders.players.load(stats.playerId);
      },
    }),
    // Primary position based on fielding statistics
    primaryPosition: t.field({
      type: 'String',
      nullable: true,
      resolve: async (stats, _args, context) => {
        if (!stats.playerId) return null;

        try {
          const fieldingStats = await context.loaders.careerFielding.load(
            stats.playerId,
          );
          if (!fieldingStats?.positionsPlayed) return null;

          const entries = parsePositionEntries(fieldingStats.positionsPlayed);
          return entries ? findPrimaryPosition(entries) : null;
        } catch (error) {
          LOGGER.warn('Error getting primary position for player', {
            playerId: stats.playerId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    }),
    // All positions played with games count
    positionsPlayed: t.field({
      type: 'String',
      nullable: true,
      resolve: async (stats, _args, context) => {
        if (!stats.playerId) return null;

        try {
          const fieldingStats = await context.loaders.careerFielding.load(
            stats.playerId,
          );
          if (!fieldingStats?.positionsPlayed) return null;

          return resolvePositionsPlayed(fieldingStats.positionsPlayed);
        } catch (error) {
          LOGGER.warn('Error getting positions played for player', {
            playerId: stats.playerId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    }),
  }),
});

// Career Batting Connection type for relay-style pagination with totalCount
const CareerBattingConnection = builder.connectionObject({
  type: CareerBattingRef,
  name: 'CareerBattingConnection',
  fields: (t) => ({
    totalCount: t.int({
      description:
        'Total number of career batting records matching the filters',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- Pothos connection totalCount typing gap
      resolve: (connection: any) => connection.totalCount || 0,
    }),
  }),
});

// Career Pitching type
export const CareerPitchingRef = builder.objectRef<{
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
  pitchingWar: number | null;
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
    /**
     * Pitching WAR — read from the career_pitching view's computed column.
     * Formula: FIP-based runs above average + replacement level, per season, summed.
     */
    pitchingWAR: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Approximate pitching WAR computed from career counting stats. ' +
        'Uses FIP-based run estimation with season-specific cFIP constants, ' +
        'league ERA baseline, and replacement level (20 runs per 200 IP).',
      resolve: (stats) => stats.pitchingWar ?? null,
    }),
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
    whip: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (stats.h == null || stats.bb == null || !stats.outsRecorded)
          return null;
        const ip = stats.outsRecorded / 3;
        return ip === 0 ? null : (stats.h + stats.bb) / ip;
      },
    }),
    // Strikeouts per nine innings (K/9 = 9 * SO / IP), with IP derived from
    // outsRecorded (IP = outsRecorded / 3). Guards against division by zero
    // when no outs have been recorded (IP = 0). Mirrors SeasonPitching's
    // precomputed strikeoutsPerNine so career and season views agree.
    strikeoutsPerNine: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (stats.so == null || !stats.outsRecorded) return null;
        const ip = stats.outsRecorded / 3;
        return ip === 0 ? null : (9 * stats.so) / ip;
      },
    }),
    // Walks per nine innings (BB/9 = 9 * BB / IP), with IP derived from
    // outsRecorded (IP = outsRecorded / 3). Guards against division by zero
    // when no outs have been recorded (IP = 0). Mirrors SeasonPitching's
    // precomputed basesOnBallsPerNine so career and season views agree.
    basesOnBallsPerNine: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (stats.bb == null || !stats.outsRecorded) return null;
        const ip = stats.outsRecorded / 3;
        return ip === 0 ? null : (9 * stats.bb) / ip;
      },
    }),
    /**
     * Career fantasy points using DEFAULT_PITCHING_SCORING (LS-8569). A real
     * weighted-sum SQL expression backs sorting on this field (see the
     * `fantasyPoints` case in getCareerPitchingOrderByClause).
     */
    fantasyPoints: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Career fantasy points using default scoring settings ' +
        '(lib/scoring/src/baseball/DefaultScoring.ts).',
      resolve: (stats) =>
        computeLinearScore(
          pitchingScoringRecord(stats),
          PITCHING_SCORING_WEIGHTS,
        ),
    }),
    fantasyPointsPerGame: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Average fantasy points per game using default scoring settings. ' +
        '0 for players with no recorded games.',
      resolve: (stats) =>
        stats.g
          ? computeLinearScore(
              pitchingScoringRecord(stats),
              PITCHING_SCORING_WEIGHTS,
            ) / stats.g
          : 0,
    }),
    // Player relationship
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (stats, _args, context) => {
        if (!stats.playerId) return null;
        return context.loaders.players.load(stats.playerId);
      },
    }),
    // Primary position based on fielding statistics
    primaryPosition: t.field({
      type: 'String',
      nullable: true,
      resolve: async (stats, _args, context) => {
        if (!stats.playerId) return null;

        try {
          const fieldingStats = await context.loaders.careerFielding.load(
            stats.playerId,
          );
          if (!fieldingStats?.positionsPlayed) return null;

          const entries = parsePositionEntries(fieldingStats.positionsPlayed);
          return entries ? findPrimaryPosition(entries) : null;
        } catch (error) {
          LOGGER.warn('Error getting primary position for pitcher', {
            playerId: stats.playerId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    }),
    // All positions played with games count
    positionsPlayed: t.field({
      type: 'String',
      nullable: true,
      resolve: async (stats, _args, context) => {
        if (!stats.playerId) return null;

        try {
          const fieldingStats = await context.loaders.careerFielding.load(
            stats.playerId,
          );
          if (!fieldingStats?.positionsPlayed) return null;

          return resolvePositionsPlayed(fieldingStats.positionsPlayed);
        } catch (error) {
          LOGGER.warn('Error getting positions played for pitcher', {
            playerId: stats.playerId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
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
  positionsPlayed: unknown; // JSON data for positions and games played
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
    // Position breakdown with games played at each position
    positionsPlayed: t.field({
      type: 'String',
      nullable: true,
      resolve: (stats) => {
        if (!stats.positionsPlayed) return null;
        return JSON.stringify(stats.positionsPlayed);
      },
    }),
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
// Exported for use in other schemas (e.g., matchups)
export const SeasonBattingRef = builder.objectRef<{
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
  bwar: number | null;
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
      // Same formula the OBP/OPS sort uses (LS-10846).
      resolve: (stats) => computeOnBasePercentage(stats),
    }),
    sluggingPercentage: t.field({
      type: 'Float',
      nullable: true,
      resolve: (stats) => {
        if (!stats.tb || !stats.ab || stats.ab === 0) return null;
        return stats.tb / stats.ab;
      },
    }),
    onBasePlusSlugging: t.exposeFloat('onbasePlusSlugging', { nullable: true }),
    onBasePlusSluggingPlus: t.exposeFloat('onbasePlusSluggingPlus', {
      nullable: true,
    }),
    awardSummary: t.exposeString('awardSummary', { nullable: true }),
    bwar: t.exposeFloat('bwar', {
      nullable: true,
      description: 'Baseball Reference WAR (bWAR) for this season',
    }),
  }),
});

// Season Pitching type - matches database schema
// Exported for use in other schemas (e.g., matchups)
export const SeasonPitchingRef = builder.objectRef<{
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
  pwar: number | null;
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
    pwar: t.exposeFloat('pwar', {
      nullable: true,
      description:
        'Baseball Reference pitching WAR for this season (distinct from position-player bWAR)',
    }),
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
// Exported for use in other schemas (e.g., matchups)
export const SeasonFieldingRef = builder.objectRef<{
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
  drs: number | null;
  uzr: number | null;
  oaa: number | null;
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
    drs: t.exposeFloat('drs', { nullable: true }),
    uzr: t.exposeFloat('uzr', { nullable: true }),
    oaa: t.exposeFloat('oaa', { nullable: true }),
  }),
});

// Maximum number of rows the careerBattingStats resolver will return per request.
// Without this cap a client can request tens-of-thousands of rows, triggering
// expensive DataLoader calls (WHERE id IN (...)) that exhaust the Lambda timeout
// and return a 502 (LS-3113).
const MAX_CAREER_BATTING_LIMIT = 5_000;
// Free / unauthenticated callers are capped at 100 rows — the premium UI upsell
// offers 250/500 options only to large_player_stats_page_size holders (PST-032 /
// LS-7119). A hand-crafted request from a free user sending first=500 is silently
// clamped here so the server remains the real enforcement boundary.
const FREE_MAX_CAREER_BATTING_LIMIT = 100;

// Maximum length of the free-text `searchTerm` filter. The value flows into an
// `ILIKE '%term%'` pattern, so an oversized term wastes DB compute for no benefit
// (matches longer than any player name can never gain new results). The web
// client already caps at 64 chars, but the resolver must not trust the client —
// a crafted request could forward a multi-megabyte term straight into the LIKE
// scan (PST-063 / LS-7129). Cap (don't reject) so an over-long paste still
// returns sensible matches on its leading 64 chars.
const MAX_SEARCH_TERM_LENGTH = 64;

/**
 * Bound the free-text `searchTerm` resolver argument before it reaches the
 * database `ILIKE '%term%'` query. Trims and collapses internal whitespace so a
 * padded or pasted term matches like its clean form (LS-10657), returns
 * `undefined` for empty/absent/whitespace-only input (no search), and truncates
 * anything longer than MAX_SEARCH_TERM_LENGTH. Exported for unit testing.
 */
export function capSearchTerm(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeSearchTerm(value);
  if (!normalized) return undefined;
  return normalized.slice(0, MAX_SEARCH_TERM_LENGTH).trimEnd();
}

// Career batting statistics with relay-style pagination and totalCount
builder.queryField('careerBattingStats', (t) =>
  t.field({
    type: CareerBattingConnection,
    args: {
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      minGames: t.arg.int({ required: false }),
      minHomeRuns: t.arg.int({ required: false }),
      minRBI: t.arg.int({ required: false }),
      maxRBI: t.arg.int({ required: false }),
      minBattingAvg: t.arg.float({ required: false }),
      maxBattingAvg: t.arg.float({ required: false }),
      maxHomeRuns: t.arg.int({ required: false }),
      searchTerm: t.arg.string({ required: false }),
      position: t.arg.string({ required: false }),
      team: t.arg.string({ required: false }),
      playerType: t.arg.string({ required: false }),
    },
    resolve: async (root, args, context) => {
      // Enforce the premium page-size cap server-side (PST-032 / LS-7119).
      // Premium holders may request up to MAX_CAREER_BATTING_LIMIT rows;
      // free / unauthenticated callers are silently capped at FREE_MAX_CAREER_BATTING_LIMIT
      // so a hand-crafted request cannot bypass the UI gate.
      const canRequestLargePageSize =
        context.user !== null &&
        context.user !== undefined &&
        (await hasEntitlement(
          context,
          ENTITLEMENTS.large_player_stats_page_size,
        ));
      const effectiveCap = canRequestLargePageSize
        ? MAX_CAREER_BATTING_LIMIT
        : FREE_MAX_CAREER_BATTING_LIMIT;

      // Convert relay pagination args to offset/limit, capping at effectiveCap
      // to prevent runaway queries that cause Lambda timeouts (LS-3113).
      // Math.max(0, ...) guards against a negative `first` value (GraphQL Int allows it)
      // which would otherwise produce an invalid LIMIT in the SQL query.
      const requestedLimit = args.first ?? 25;
      const limit = Math.max(0, Math.min(requestedLimit, effectiveCap));
      const offset = args.after
        ? parseInt(Buffer.from(args.after, 'base64').toString())
        : 0;

      // Bound the free-text term length before it reaches the ILIKE scan (PST-063).
      const searchTerm = capSearchTerm(args.searchTerm);

      // Get data and total count in parallel
      const [data, totalCount] = await Promise.all([
        dbService.statistics.getCareerBattingStats({
          limit,
          offset,
          orderBy: args.orderBy || undefined,
          orderDirection: args.orderDirection as 'asc' | 'desc' | undefined,
          filters: {
            minGames: args.minGames || undefined,
            minHomeRuns: args.minHomeRuns || undefined,
            maxHomeRuns: args.maxHomeRuns || undefined,
            minRBI: args.minRBI || undefined,
            maxRBI: args.maxRBI || undefined,
            minBattingAvg: args.minBattingAvg || undefined,
            maxBattingAvg: args.maxBattingAvg || undefined,
            searchTerm,
            position: args.position || undefined,
            team: args.team || undefined,
            playerType: args.playerType || undefined,
          },
        }),
        dbService.statistics.getCareerBattingStatsCount({
          filters: {
            minGames: args.minGames || undefined,
            minHomeRuns: args.minHomeRuns || undefined,
            maxHomeRuns: args.maxHomeRuns || undefined,
            minRBI: args.minRBI || undefined,
            maxRBI: args.maxRBI || undefined,
            minBattingAvg: args.minBattingAvg || undefined,
            maxBattingAvg: args.maxBattingAvg || undefined,
            searchTerm,
            position: args.position || undefined,
            team: args.team || undefined,
            playerType: args.playerType || undefined,
          },
        }),
      ]);

      return {
        edges: data.map((item, index) => ({
          node: item,
          cursor: Buffer.from((offset + index).toString()).toString('base64'),
        })),
        pageInfo: {
          hasNextPage: offset + data.length < totalCount,
          hasPreviousPage: offset > 0,
          startCursor:
            data.length > 0
              ? Buffer.from(offset.toString()).toString('base64')
              : null,
          endCursor:
            data.length > 0
              ? Buffer.from((offset + data.length - 1).toString()).toString(
                  'base64',
                )
              : null,
        },
        totalCount,
      };
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
      maxWins: t.arg.int({ required: false }),
      minStrikeouts: t.arg.int({ required: false }),
      maxStrikeouts: t.arg.int({ required: false }),
      minERA: t.arg.float({ required: false }),
      maxERA: t.arg.float({ required: false }),
      searchTerm: t.arg.string({ required: false }),
      position: t.arg.string({ required: false }),
      team: t.arg.string({ required: false }),
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
          maxWins: args.maxWins || undefined,
          minStrikeouts: args.minStrikeouts || undefined,
          maxStrikeouts: args.maxStrikeouts || undefined,
          minERA: args.minERA || undefined,
          maxERA: args.maxERA || undefined,
          // Bound the free-text term length before the ILIKE scan (PST-063).
          searchTerm: capSearchTerm(args.searchTerm),
          position: args.position || undefined,
          team: args.team || undefined,
        },
      });
    },
  }),
);

// Count career pitching records (used by PitchingStatsDataGrid for pagination)
builder.queryField('careerPitchingStatsCount', (t) =>
  t.field({
    type: 'Int',
    args: {
      minGames: t.arg.int({ required: false }),
      minWins: t.arg.int({ required: false }),
      maxWins: t.arg.int({ required: false }),
      minStrikeouts: t.arg.int({ required: false }),
      maxStrikeouts: t.arg.int({ required: false }),
      minERA: t.arg.float({ required: false }),
      maxERA: t.arg.float({ required: false }),
      searchTerm: t.arg.string({ required: false }),
      position: t.arg.string({ required: false }),
      team: t.arg.string({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.countCareerPitchingStats({
        minGames: args.minGames || undefined,
        minWins: args.minWins || undefined,
        maxWins: args.maxWins || undefined,
        minStrikeouts: args.minStrikeouts || undefined,
        maxStrikeouts: args.maxStrikeouts || undefined,
        minERA: args.minERA || undefined,
        maxERA: args.maxERA || undefined,
        // Bound the free-text term length before the ILIKE scan (PST-063).
        searchTerm: capSearchTerm(args.searchTerm),
        position: args.position || undefined,
        team: args.team || undefined,
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
    // Open to every viewer, like playerSeasonFielding and the playerCareer*
    // queries: it backs the /players player-detail modal, which is free
    // (LS-10546). Premium columns are nulled per field below.
    resolve: async (parent, { playerId, season }, context) => {
      LOGGER.debug(
        `[playerSeasonBatting] Query for playerId=${playerId}, season=${season}`,
      );
      const results = await dbService.statistics.getSeasonBattingStats({
        filters: {
          playerId,
          season: season || undefined,
        },
      });
      LOGGER.debug(
        `[playerSeasonBatting] Returned ${results.length} records for playerId=${playerId}`,
      );
      const premium = await hasEntitlement(
        context,
        ENTITLEMENTS.advanced_batting_stats,
      );
      if (!premium) {
        return results.map((r) => ({ ...r, onbasePlusSluggingPlus: null }));
      }
      return results;
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
    // Open to every viewer, like playerSeasonBatting (LS-10546). Advanced
    // pitching analytics are UI-gated on advanced_pitching_stats.
    resolve: async (parent, { playerId, season }) => {
      LOGGER.debug(
        `[playerSeasonPitching] Query for playerId=${playerId}, season=${season}`,
      );
      const results = await dbService.statistics.getSeasonPitchingStats({
        filters: {
          playerId,
          season: season || undefined,
        },
      });
      LOGGER.debug(
        `[playerSeasonPitching] Returned ${results.length} records for playerId=${playerId}`,
      );
      return results;
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
    resolve: async (parent, { playerId, season }, context) => {
      LOGGER.debug(
        `[playerSeasonFielding] Query for playerId=${playerId}, season=${season}`,
      );
      const results = await dbService.statistics.getSeasonFieldingStats({
        filters: {
          playerId,
          season: season || undefined,
        },
      });
      LOGGER.debug(
        `[playerSeasonFielding] Returned ${results.length} records for playerId=${playerId}`,
      );
      const premium = await hasEntitlement(
        context,
        ENTITLEMENTS.defensive_sabermetrics,
      );
      if (!premium) {
        return results.map((r) => ({ ...r, drs: null, uzr: null, oaa: null }));
      }
      return results;
    },
  }),
);
