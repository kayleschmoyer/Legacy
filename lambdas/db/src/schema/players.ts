import { createDatabaseService } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';
import { CareerBattingRef } from './statistics';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// Player type
const PlayerRef = builder.objectRef<{
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  statsLastFetchedAt: Date | null;
}>('Player');

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

PlayerRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    firstName: t.exposeString('firstName'),
    lastName: t.exposeString('lastName'),
    brefId: t.exposeString('brefId'),
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
  }),
});

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
      excludeEmptyNames: t.arg.boolean({
        required: false,
        defaultValue: false,
      }),
    },
    resolve: async (root, args) => {
      const orderBy = args.orderBy as
        | 'id'
        | 'firstName'
        | 'lastName'
        | 'brefId'
        | 'careerGames'
        | 'careerHits'
        | 'careerHomeRuns'
        | 'careerRBI'
        | 'careerRuns'
        | 'careerStolenBases'
        | undefined;
      const orderDirection = args.orderDirection as 'asc' | 'desc' | undefined;

      return dbService.players.getPlayers({
        limit: args.limit || undefined,
        offset: args.offset || undefined,
        orderBy: orderBy || 'careerGames', // Default sort by career games for relevance
        orderDirection: orderDirection || 'desc',
        filters: {
          excludeEmptyNames: args.excludeEmptyNames ?? false,
          position: args.position || undefined,
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
    },
    resolve: async (parent, args) => {
      return dbService.players.searchPlayers(args.searchTerm, args.limit || 10);
    },
  }),
);
