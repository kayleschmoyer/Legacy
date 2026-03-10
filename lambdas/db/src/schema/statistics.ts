import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { builder } from './builder';

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
  offensiveWar: number | null;
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
    /**
     * Offensive WAR — read from the career_batting view's computed column.
     * Formula: (wRAA + BsR + posAdj + replRuns) / 10, computed in SQL.
     */
    offensiveWAR: t.field({
      type: 'Float',
      nullable: true,
      description:
        'Approximate offensive WAR computed from career counting stats. ' +
        'Includes wOBA-based batting runs, SB/CS baserunning, positional adjustment, ' +
        'and replacement level. Excludes fielding value.',
      resolve: (stats) => stats.offensiveWar ?? null,
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

          // The positions played is already a JSON object from the database
          const positions = fieldingStats.positionsPlayed;
          if (typeof positions === 'object' && positions !== null) {
            const positionEntries = Object.entries(positions);
            if (positionEntries.length === 0) return null;

            // Find position with most games played
            const primaryPos = positionEntries.reduce((max, current) => {
              const currentGames = (current[1] as PositionGames)?.games || 0;
              const maxGames = (max[1] as PositionGames)?.games || 0;
              return currentGames > maxGames ? current : max;
            });

            return (primaryPos[1] as PositionGames)?.position || primaryPos[0];
          }

          // Fallback: try parsing as string if it somehow comes as a string
          if (typeof positions === 'string') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- JSON.parse returns any
            const parsedPositions = JSON.parse(positions);
            if (
              typeof parsedPositions === 'object' &&
              parsedPositions !== null
            ) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- JSON.parse result passed to Object.entries
              const positionEntries = Object.entries(parsedPositions);
              if (positionEntries.length === 0) return null;

              // Find position with most games played
              const primaryPos = positionEntries.reduce((max, current) => {
                const currentGames = (current[1] as PositionGames)?.games || 0;
                const maxGames = (max[1] as PositionGames)?.games || 0;
                return currentGames > maxGames ? current : max;
              });

              return (
                (primaryPos[1] as PositionGames)?.position || primaryPos[0]
              );
            }
          }

          return null;
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

          // Return the positions played as a JSON string
          const positions = fieldingStats.positionsPlayed;
          if (typeof positions === 'object' && positions !== null) {
            return JSON.stringify(positions);
          }

          // If it's already a string, return it
          if (typeof positions === 'string') {
            return positions;
          }

          return null;
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
    // Player relationship
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (stats, _args, context) => {
        if (!stats.playerId) return null;
        return context.loaders.players.load(stats.playerId);
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
      minBattingAvg: t.arg.float({ required: false }),
      searchTerm: t.arg.string({ required: false }),
    },
    resolve: async (root, args) => {
      // Convert relay pagination args to offset/limit
      const limit = args.first || 25;
      const offset = args.after
        ? parseInt(Buffer.from(args.after, 'base64').toString())
        : 0;

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
            minRBI: args.minRBI || undefined,
            minBattingAvg: args.minBattingAvg || undefined,
            searchTerm: args.searchTerm || undefined,
          },
        }),
        dbService.statistics.getCareerBattingStatsCount({
          filters: {
            minGames: args.minGames || undefined,
            minHomeRuns: args.minHomeRuns || undefined,
            minRBI: args.minRBI || undefined,
            minBattingAvg: args.minBattingAvg || undefined,
            searchTerm: args.searchTerm || undefined,
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
      minStrikeouts: t.arg.int({ required: false }),
      searchTerm: t.arg.string({ required: false }),
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
          searchTerm: args.searchTerm || undefined,
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
      minStrikeouts: t.arg.int({ required: false }),
      searchTerm: t.arg.string({ required: false }),
    },
    resolve: async (root, args) => {
      return dbService.statistics.countCareerPitchingStats({
        minGames: args.minGames || undefined,
        minWins: args.minWins || undefined,
        minStrikeouts: args.minStrikeouts || undefined,
        searchTerm: args.searchTerm || undefined,
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
    resolve: async (parent, { playerId, season }) => {
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
      return results;
    },
  }),
);
