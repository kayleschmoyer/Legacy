import {
  createDatabaseService,
  type PlayerCareerScore,
} from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import type { PlayerOrderBy } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';
import { getDbOptions } from '@legacy-sports/utils/node';
import { builder } from './builder';
import { UserInputError } from './graphql-errors';
import { SportKindEnum } from './leagues/types';
import { CareerBattingRef, CareerPitchingRef } from './statistics';

/** Map a career midpoint year to a human-readable baseball era label. */
function getEraFromYear(midpointYear: number): string {
  if (midpointYear < 1920) return 'Dead Ball Era';
  if (midpointYear <= 1960) return 'Golden Age';
  if (midpointYear <= 1976) return 'Expansion Era';
  if (midpointYear <= 1993) return 'Free Agency Era';
  if (midpointYear <= 2005) return 'Steroid Era';
  return 'Modern Era';
}

const ALLOWED_SPORTS = ['baseball', 'football'] as const;

function validateSportArg(sport: unknown): 'baseball' | 'football' | undefined {
  if (sport == null) return undefined;
  if (!(ALLOWED_SPORTS as readonly unknown[]).includes(sport)) {
    throw UserInputError(
      `Invalid sport. Allowed values: ${ALLOWED_SPORTS.join(', ')}.`,
    );
  }
  return sport as 'baseball' | 'football';
}

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// Player type
interface PlayerShape {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  mlbPlayerId?: number | null;
  statsLastFetchedAt: Date | null;
  scoring?: PlayerCareerScore | null;
  // Career achievement fields (from DB columns)
  allStarSelections?: number | null;
  goldGloves?: number | null;
  silverSluggers?: number | null;
  mvpAwards?: number | null;
  cyYoungAwards?: number | null;
  worldSeriesRings?: number | null;
  hallOfFame?: boolean | null;
  rookieOfTheYear?: boolean | null;
}

/** Nested career-achievements sub-type on a Player. */
const CareerAchievementsRef = builder.objectRef<{
  allStarSelections: number;
  goldGloves: number;
  silverSluggers: number;
  mvpAwards: number;
  cyYoungAwards: number;
  worldSeriesRings: number;
  hallOfFame: boolean;
  rookieOfTheYear: boolean;
}>('CareerAchievements');

CareerAchievementsRef.implement({
  description: 'Career honours and awards sourced from Baseball Reference',
  fields: (t) => ({
    allStarSelections: t.exposeInt('allStarSelections', {
      description: 'Number of All-Star game selections',
    }),
    goldGloves: t.exposeInt('goldGloves', {
      description: 'Number of Gold Glove Awards',
    }),
    silverSluggers: t.exposeInt('silverSluggers', {
      description: 'Number of Silver Slugger Awards',
    }),
    mvpAwards: t.exposeInt('mvpAwards', {
      description: 'Number of Most Valuable Player Awards (AL or NL)',
    }),
    cyYoungAwards: t.exposeInt('cyYoungAwards', {
      description: 'Number of Cy Young Awards',
    }),
    worldSeriesRings: t.exposeInt('worldSeriesRings', {
      description: 'Number of World Series Championship rings',
    }),
    hallOfFame: t.exposeBoolean('hallOfFame', {
      description: 'Whether the player is in the Baseball Hall of Fame',
    }),
    rookieOfTheYear: t.exposeBoolean('rookieOfTheYear', {
      description: 'Whether the player won the Rookie of the Year Award',
    }),
  }),
});

export const PlayerRef = builder.objectRef<PlayerShape>('Player');

// Average per-season stats type
const AverageSeasonBattingRef = builder.objectRef<{
  seasons: number;
  games: number;
  atBats: number;
  runs: number;
  hits: number;
  homeRuns: number;
  rbi: number;
  stolenBases: number;
  battingAverage: number;
  onBasePercentage: number;
  sluggingPercentage: number;
}>('AverageSeasonBatting');

AverageSeasonBattingRef.implement({
  fields: (t) => ({
    seasons: t.exposeInt('seasons'),
    games: t.exposeFloat('games'),
    atBats: t.exposeFloat('atBats'),
    runs: t.exposeFloat('runs'),
    hits: t.exposeFloat('hits'),
    homeRuns: t.exposeFloat('homeRuns'),
    rbi: t.exposeFloat('rbi'),
    stolenBases: t.exposeFloat('stolenBases'),
    battingAverage: t.exposeFloat('battingAverage'),
    onBasePercentage: t.exposeFloat('onBasePercentage'),
    sluggingPercentage: t.exposeFloat('sluggingPercentage'),
  }),
});

// Player scoring type — returned by DB-level compute_career_scores()
const PlayerScoringRef = builder.objectRef<PlayerCareerScore>('PlayerScoring');

PlayerScoringRef.implement({
  fields: (t) => ({
    battingScore: t.exposeFloat('battingScore'),
    pitchingScore: t.exposeFloat('pitchingScore'),
    fieldingScore: t.exposeFloat('fieldingScore'),
    /** battingScore + fieldingScore — useful for sorting/displaying hitter-only value */
    hitterScore: t.exposeFloat('hitterScore'),
    totalScore: t.exposeFloat('totalScore'),
    careerGames: t.exposeInt('careerGames'),
    avgPointsPerGame: t.exposeFloat('avgPpg'),
    /** hitterScore / careerGames — per-game hitter average */
    hitterAvgPointsPerGame: t.exposeFloat('hitterAvgPpg'),
    /** pitchingScore / careerGames — per-game pitching average */
    pitchingAvgPointsPerGame: t.exposeFloat('pitchingAvgPpg'),
  }),
});

PlayerRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    firstName: t.exposeString('firstName'),
    lastName: t.exposeString('lastName'),
    brefId: t.exposeString('brefId'),
    mlbPlayerId: t.exposeInt('mlbPlayerId', {
      nullable: true,
      description:
        'MLB Stats API player ID for cross-referencing with the external data provider. Null for players without a known mapping.',
    }),
    statsLastFetchedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.statsLastFetchedAt
          ? parent.statsLastFetchedAt.toISOString()
          : null,
    }),
    eligiblePositions: t.stringList({
      description:
        'List of positions this player is eligible to play (e.g. SP, RP, 1B, SS)',
      resolve: async (parent, _args, context) => {
        return context.loaders.eligiblePositions.load(parent.id);
      },
    }),
    careerBatting: t.field({
      description: 'Career batting statistics for the player',
      type: CareerBattingRef,
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.careerBatting.load(parent.id);
      },
    }),
    careerPitching: t.field({
      description: 'Career pitching statistics for the player',
      type: CareerPitchingRef,
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.careerPitching.load(parent.id);
      },
    }),
    averageSeasonBatting: t.field({
      type: AverageSeasonBattingRef,
      nullable: true,
      resolve: async (parent, _args, context) => {
        const [careerData, seasonsData] = await Promise.all([
          context.loaders.careerBatting.load(parent.id),
          context.loaders.battingSeasonsPlayed.load(parent.id),
        ]);

        const career = careerData;
        const seasons = seasonsData;

        if (!career || !seasons || seasons === 0) return null;

        // Helper to average a stat
        const avg = (val: number | null | undefined) => (val || 0) / seasons;

        // Helper to calculate rate stat
        // For rate stats, we want career average, not average of averages
        const rate = (
          num: number | null | undefined,
          denom: number | null | undefined,
        ) => (denom && denom > 0 ? (num || 0) / denom : 0);

        return {
          seasons,
          games: avg(career.g),
          atBats: avg(career.ab),
          runs: avg(career.r),
          hits: avg(career.h),
          homeRuns: avg(career.hr),
          rbi: avg(career.rbi),
          stolenBases: avg(career.sb),
          // Rate stats are calculated over career totals, which represents the weighted average
          battingAverage: rate(career.h, career.ab),
          onBasePercentage:
            career.pa && career.pa > 0
              ? ((career.h || 0) + (career.bb || 0) + (career.hbp || 0)) /
                (career.pa - (career.sh || 0))
              : 0,
          sluggingPercentage: rate(career.tb, career.ab),
        };
      },
    }),
    scoring: t.field({
      description:
        'Fantasy scoring data (only populated when using scoring-based sort)',
      type: PlayerScoringRef,
      nullable: true,
      resolve: (parent) => {
        return parent.scoring ?? null;
      },
    }),
    seasonsPlayed: t.int({
      description:
        'Number of distinct MLB seasons the player has batting stats for (AL/NL only)',
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.battingSeasonsPlayed.load(parent.id);
      },
    }),
    careerAchievements: t.field({
      description:
        'Career honours and awards sourced from Baseball Reference (All-Star, Gold Glove, etc.)',
      type: CareerAchievementsRef,
      nullable: true,
      resolve: (parent) => {
        // All achievement columns default to 0/false in the DB so they are
        // always present on rows from the players table after the migration.
        return {
          allStarSelections: parent.allStarSelections ?? 0,
          goldGloves: parent.goldGloves ?? 0,
          silverSluggers: parent.silverSluggers ?? 0,
          mvpAwards: parent.mvpAwards ?? 0,
          cyYoungAwards: parent.cyYoungAwards ?? 0,
          worldSeriesRings: parent.worldSeriesRings ?? 0,
          hallOfFame: parent.hallOfFame ?? false,
          rookieOfTheYear: parent.rookieOfTheYear ?? false,
        };
      },
    }),
    primaryEra: t.string({
      description:
        "The player's primary historical baseball era, derived from the midpoint of their MLB career. " +
        'Values: Dead Ball Era | Golden Age | Expansion Era | Free Agency Era | Steroid Era | Modern Era',
      nullable: true,
      resolve: async (parent, _args, context) => {
        const yearRange = await context.loaders.careerYearRange.load(parent.id);
        if (!yearRange) return null;
        const midpoint = Math.round(
          (yearRange.minYear + yearRange.maxYear) / 2,
        );
        return getEraFromYear(midpoint);
      },
    }),
  }),
});

// Total number of players in the database (unauthenticated — used on the login page)
builder.queryField('playerCount', (t) =>
  t.int({
    description: 'Total number of players in the database',
    resolve: async () => {
      return dbService.players.countPlayers();
    },
  }),
);

// Add players query
builder.queryField('players', (t) =>
  t.field({
    type: [PlayerRef],
    args: {
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
      orderBy: t.arg.string({ required: false }),
      orderDirection: t.arg.string({ required: false }),
      position: t.arg.string({ required: false }),
      search: t.arg.string({ required: false }),
      excludeEmptyNames: t.arg.boolean({
        required: false,
        defaultValue: false,
      }),
      leagueId: t.arg.int({
        required: false,
        description:
          'League ID for scoring-based sorting and player pool filtering (career minimums, sport). Uses league-specific scoring multipliers when provided, system defaults otherwise.',
      }),
      sport: t.arg({
        type: SportKindEnum,
        required: false,
        description:
          'Filter by sport. When leagueId is provided, the league sport takes precedence.',
      }),
    },
    resolve: async (root, args, context) => {
      const orderBy = (args.orderBy || 'careerGames') as PlayerOrderBy;
      const orderDirection = args.orderDirection as 'asc' | 'desc' | undefined;

      let minCareerGames: number | undefined;
      let minCareerSeasons: number | undefined;
      let leagueEraFilter: string | undefined;
      let leagueHofOnly: boolean | undefined;
      let leagueCustomEraStartYear: number | undefined;
      let leagueCustomEraEndYear: number | undefined;
      let sportFilter = validateSportArg(args.sport);

      // When a leagueId is provided, fetch the league's career minimums and sport
      if (args.leagueId != null) {
        const [leagueSettings] = await context.db
          .select({
            minCareerGames: PublicSchema.leagues.minCareerGames,
            minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
            eraFilter: PublicSchema.leagues.baseballEraFilter,
            baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
            sport: PublicSchema.leagues.sport,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId))
          .limit(1);

        if (leagueSettings) {
          minCareerGames = leagueSettings.minCareerGames ?? 50;
          minCareerSeasons = leagueSettings.minCareerSeasons ?? 3;
          leagueEraFilter = leagueSettings.eraFilter ?? 'all';
          leagueHofOnly = leagueSettings.baseballHofOnly ?? false;
          leagueCustomEraStartYear =
            leagueSettings.customEraStartYear ?? undefined;
          leagueCustomEraEndYear = leagueSettings.customEraEndYear ?? undefined;
          sportFilter = leagueSettings.sport ?? 'baseball';
        }
      }

      return dbService.players.getPlayers({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy,
        orderDirection: orderDirection || 'desc',
        leagueId: args.leagueId ?? undefined,
        filters: {
          excludeEmptyNames: args.excludeEmptyNames ?? false,
          position: args.position || undefined,
          fullNameLike: args.search || undefined,
          minCareerGames,
          minCareerSeasons,
          baseballEraFilter: leagueEraFilter,
          baseballHofOnly: leagueHofOnly,
          customEraStartYear: leagueCustomEraStartYear,
          customEraEndYear: leagueCustomEraEndYear,
          sport: sportFilter,
        },
      });
    },
  }),
);

builder.queryField('player', (t) =>
  t.field({
    type: PlayerRef,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (parent, { id }) => {
      return dbService.players.getPlayerById(id);
    },
  }),
);

builder.queryField('playerByBrefId', (t) =>
  t.field({
    type: PlayerRef,
    nullable: true,
    args: {
      brefId: t.arg.string({ required: true }),
    },
    resolve: async (parent, { brefId }) => {
      return dbService.players.getPlayerByBrefId(brefId);
    },
  }),
);

builder.queryField('searchPlayers', (t) =>
  t.field({
    type: [PlayerRef],
    args: {
      searchTerm: t.arg.string({ required: true }),
      limit: t.arg.int({ required: false }),
      sport: t.arg({
        type: SportKindEnum,
        required: false,
        description: 'Filter results to players of this sport.',
      }),
    },
    resolve: async (parent, args) => {
      return dbService.players.searchPlayers(
        args.searchTerm,
        args.limit || 10,
        validateSportArg(args.sport),
      );
    },
  }),
);

// ─── MLB Stats Integration ────────────────────────────────────────────────────

builder.queryField('playerByMlbId', (t) =>
  t.field({
    type: PlayerRef,
    nullable: true,
    description:
      'Look up a player by their MLB Stats API player ID. Returns null if no mapping exists.',
    args: {
      mlbPlayerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, { mlbPlayerId }) => {
      return dbService.players.getPlayerByMlbId(mlbPlayerId);
    },
  }),
);

builder.queryField('playerMlbStats', (t) =>
  t.field({
    type: 'String',
    nullable: true,
    description:
      'Fetch MLB season stats for a player from the external data provider. ' +
      'Stub resolver — full implementation added in LS-1864 via MlbDataProvider.',
    args: {
      mlbPlayerId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
    },
    resolve: () => {
      // Stub resolver — returns null until LS-1864 wires up MlbDataProvider.
      return null;
    },
  }),
);
