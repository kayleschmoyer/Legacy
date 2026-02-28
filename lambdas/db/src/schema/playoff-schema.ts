import { PublicSchema } from '@legacy-sports/db-client';
import { and, asc, desc, eq } from 'drizzle-orm';
import { builder } from './builder';
import { requireAuth, verifyCommissionerAccess } from './authorization';
import { Team } from './leagues/types';

/**
 * Playoff System Schema (LS-28)
 *
 * Implements playoff bracket management with automatic seeding,
 * tournament progression, and championship determination.
 */

// ============================================================================
// ENUMS
// ============================================================================

const PlayoffRound = builder.enumType('PlayoffRound', {
  values: ['wildcard', 'semifinals', 'finals'] as const,
  description: 'Playoff round designation',
});

const PlayoffMatchupStatus = builder.enumType('PlayoffMatchupStatus', {
  values: ['scheduled', 'in_progress', 'completed'] as const,
  description: 'Status of a playoff matchup',
});

// ============================================================================
// OBJECT TYPES
// ============================================================================

/**
 * Playoff Bracket - Top-level playoff configuration for a league
 */
const PlayoffBracket = builder.objectRef<{
  id: number;
  leagueId: number;
  season: number;
  format: '4-team' | '6-team' | '8-team';
  startWeek: number;
  endWeek: number;
  championTeamId: number | null;
  status: 'scheduled' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}>('PlayoffBracket');

builder.objectType(PlayoffBracket, {
  description: 'Playoff bracket configuration and status for a league season',
  fields: (t) => ({
    id: t.exposeID('id'),
    leagueId: t.exposeInt('leagueId'),
    season: t.exposeInt('season'),
    format: t.exposeString('format'),
    startWeek: t.exposeInt('startWeek'),
    endWeek: t.exposeInt('endWeek'),
    championTeamId: t.exposeInt('championTeamId', { nullable: true }),
    status: t.field({
      type: PlayoffMatchupStatus,
      resolve: (bracket) => bracket.status,
    }),
    updatedAt: t.exposeString('updatedAt'),
    createdAt: t.exposeString('createdAt'),
    // Relational field: champion team
    championTeam: t.field({
      type: Team,
      nullable: true,
      resolve: async (bracket, _args, context) => {
        if (!bracket.championTeamId) return null;
        return context.loaders.teams.load(bracket.championTeamId);
      },
    }),
    // Relational field: all matchups in this bracket
    matchups: t.field({
      type: [PlayoffMatchup],
      resolve: async (bracket, _args, context) => {
        return context.loaders.playoffMatchupsByBracket.load(bracket.id);
      },
    }),
  }),
});

/**
 * Playoff Matchup - Individual matchup within a playoff bracket
 */
const PlayoffMatchup = builder.objectRef<{
  id: number;
  bracketId: number;
  round: 'wildcard' | 'semifinals' | 'finals';
  matchupNumber: number;
  highSeedTeamId: number | null;
  lowSeedTeamId: number | null;
  winnerTeamId: number | null;
  highSeedScore: string | null; // Decimal
  lowSeedScore: string | null; // Decimal
  weekNumber: number;
  status: 'scheduled' | 'in_progress' | 'completed';
  isMultiWeek: boolean;
}>('PlayoffMatchup');

builder.objectType(PlayoffMatchup, {
  description: 'Individual playoff matchup within a bracket',
  fields: (t) => ({
    id: t.exposeID('id'),
    bracketId: t.exposeInt('bracketId'),
    round: t.field({
      type: PlayoffRound,
      resolve: (matchup) => matchup.round,
    }),
    matchupNumber: t.exposeInt('matchupNumber'),
    highSeedTeamId: t.exposeInt('highSeedTeamId', { nullable: true }),
    lowSeedTeamId: t.exposeInt('lowSeedTeamId', { nullable: true }),
    winnerTeamId: t.exposeInt('winnerTeamId', { nullable: true }),
    highSeedScore: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.highSeedScore ? parseFloat(matchup.highSeedScore) : null,
    }),
    lowSeedScore: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.lowSeedScore ? parseFloat(matchup.lowSeedScore) : null,
    }),
    weekNumber: t.exposeInt('weekNumber'),
    status: t.field({
      type: PlayoffMatchupStatus,
      resolve: (matchup) => matchup.status,
    }),
    isMultiWeek: t.exposeBoolean('isMultiWeek'),
    // Relational fields
    highSeedTeam: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup, _args, context) => {
        if (!matchup.highSeedTeamId) return null;
        return context.loaders.teams.load(matchup.highSeedTeamId);
      },
    }),
    lowSeedTeam: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup, _args, context) => {
        if (!matchup.lowSeedTeamId) return null;
        return context.loaders.teams.load(matchup.lowSeedTeamId);
      },
    }),
    winnerTeam: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup, _args, context) => {
        if (!matchup.winnerTeamId) return null;
        return context.loaders.teams.load(matchup.winnerTeamId);
      },
    }),
  }),
});

/**
 * Playoff Seed - Team seeding information
 */
const PlayoffSeed = builder.objectRef<{
  id: number;
  bracketId: number;
  teamId: number;
  seedNumber: number;
  regularSeasonWins: number;
  regularSeasonLosses: number;
  pointsFor: string; // Decimal
}>('PlayoffSeed');

builder.objectType(PlayoffSeed, {
  description: 'Team seeding and qualification info for playoffs',
  fields: (t) => ({
    id: t.exposeID('id'),
    bracketId: t.exposeInt('bracketId'),
    teamId: t.exposeInt('teamId'),
    seedNumber: t.exposeInt('seedNumber'),
    regularSeasonWins: t.exposeInt('regularSeasonWins'),
    regularSeasonLosses: t.exposeInt('regularSeasonLosses'),
    pointsFor: t.float({
      resolve: (seed) => parseFloat(seed.pointsFor),
    }),
    // Relational field
    team: t.field({
      type: Team,
      resolve: async (seed, _args, context) => {
        return context.loaders.teams.load(seed.teamId);
      },
    }),
  }),
});

/**
 * Champion Trophy - Historical championship records
 */
const ChampionTrophy = builder.objectRef<{
  id: number;
  leagueId: number;
  season: number;
  teamId: number;
  championshipWeek: number;
  finalScore: string; // Decimal
  runnerUpTeamId: number | null;
  runnerUpScore: string | null; // Decimal
  awardedAt: string;
  createdAt: string;
  updatedAt: string;
}>('ChampionTrophy');

builder.objectType(ChampionTrophy, {
  description: 'Championship trophy and historical record',
  fields: (t) => ({
    id: t.exposeID('id'),
    leagueId: t.exposeInt('leagueId'),
    season: t.exposeInt('season'),
    teamId: t.exposeInt('teamId'),
    championshipWeek: t.exposeInt('championshipWeek'),
    finalScore: t.float({
      resolve: (trophy) => parseFloat(trophy.finalScore),
    }),
    runnerUpTeamId: t.exposeInt('runnerUpTeamId', { nullable: true }),
    runnerUpScore: t.float({
      nullable: true,
      resolve: (trophy) =>
        trophy.runnerUpScore ? parseFloat(trophy.runnerUpScore) : null,
    }),
    awardedAt: t.exposeString('awardedAt'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
    // Relational fields
    championTeam: t.field({
      type: Team,
      resolve: async (trophy, _args, context) => {
        return context.loaders.teams.load(trophy.teamId);
      },
    }),
    runnerUpTeam: t.field({
      type: Team,
      nullable: true,
      resolve: async (trophy, _args, context) => {
        if (!trophy.runnerUpTeamId) return null;
        return context.loaders.teams.load(trophy.runnerUpTeamId);
      },
    }),
  }),
});

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get playoff bracket for a league season
 */
builder.queryField('getPlayoffBracket', (t) =>
  t.field({
    type: PlayoffBracket,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      const query = context.db
        .select()
        .from(PublicSchema.playoffBrackets)
        .where(eq(PublicSchema.playoffBrackets.leagueId, args.leagueId));

      if (args.season !== null && args.season !== undefined) {
        const results = await context.db
          .select()
          .from(PublicSchema.playoffBrackets)
          .where(
            and(
              eq(PublicSchema.playoffBrackets.leagueId, args.leagueId),
              eq(PublicSchema.playoffBrackets.season, args.season),
            ),
          )
          .orderBy(desc(PublicSchema.playoffBrackets.season))
          .limit(1);
        const bracket = results[0];
        if (!bracket) return null;
        return bracket;
      }

      const results = await query
        .orderBy(desc(PublicSchema.playoffBrackets.season))
        .limit(1);

      return results[0] || null;
    },
  }),
);

/**
 * Get playoff seeds for a bracket
 */
builder.queryField('getPlayoffSeeds', (t) =>
  t.field({
    type: [PlayoffSeed],
    args: {
      bracketId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      const results = await context.db
        .select()
        .from(PublicSchema.playoffSeeds)
        .where(eq(PublicSchema.playoffSeeds.bracketId, args.bracketId))
        .orderBy(asc(PublicSchema.playoffSeeds.seedNumber));
      return results;
    },
  }),
);

/**
 * Get championship trophies for a league
 */
builder.queryField('getChampionshipTrophies', (t) =>
  t.field({
    type: [ChampionTrophy],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      const results = await context.db
        .select()
        .from(PublicSchema.championTrophies)
        .where(eq(PublicSchema.championTrophies.leagueId, args.leagueId))
        .orderBy(desc(PublicSchema.championTrophies.season));
      return results.map((trophy) => ({
        ...trophy,
        createdAt: trophy.createdAt.toISOString(),
        updatedAt: trophy.updatedAt.toISOString(),
      }));
    },
  }),
);

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a playoff bracket with automatic seeding
 */
builder.mutationField('createPlayoffBracket', (t) =>
  t.field({
    type: PlayoffBracket,
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
      format: t.arg.string({ required: true }),
      startWeek: t.arg.int({ required: true }),
      multiWeekMatchups: t.arg.boolean({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      const user = requireAuth(context);

      // Admin users can create playoffs for any league; commissioners can only
      // create playoffs for leagues they manage.
      if (!user.isAdmin) {
        await verifyCommissionerAccess(context.db, args.leagueId, user.id);
      }

      const { PlayoffService } = await import('../services/playoff-service');
      const bracket = await PlayoffService.createBracket(context.db, {
        leagueId: args.leagueId,
        season: args.season,
        format: args.format as '4-team' | '6-team' | '8-team',
        startWeek: args.startWeek,
        multiWeekMatchups: args.multiWeekMatchups ?? false,
      });
      return bracket;
    },
  }),
);

/**
 * Advance playoff bracket (move winners to next round)
 */
builder.mutationField('advancePlayoffBracket', (t) =>
  t.field({
    type: PlayoffBracket,
    args: {
      bracketId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      const user = requireAuth(context);

      if (!user.isAdmin) {
        // Look up the bracket to get the league id for access verification
        const [bracketRow] = await context.db
          .select({ leagueId: PublicSchema.playoffBrackets.leagueId })
          .from(PublicSchema.playoffBrackets)
          .where(eq(PublicSchema.playoffBrackets.id, args.bracketId))
          .limit(1);

        if (!bracketRow) {
          throw new Error('Playoff bracket not found');
        }

        await verifyCommissionerAccess(
          context.db,
          bracketRow.leagueId,
          user.id,
        );
      }

      const { PlayoffService } = await import('../services/playoff-service');
      const bracket = await PlayoffService.advanceBracket(
        context.db,
        args.bracketId,
      );
      return bracket;
    },
  }),
);

/**
 * Update playoff matchup score
 */
builder.mutationField('updatePlayoffMatchup', (t) =>
  t.field({
    type: PlayoffMatchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      highSeedScore: t.arg.float({ required: false }),
      lowSeedScore: t.arg.float({ required: false }),
      status: t.arg({ type: PlayoffMatchupStatus, required: false }),
    },
    resolve: async (_parent, args, context) => {
      const user = requireAuth(context);

      if (!user.isAdmin) {
        // Look up the matchup → bracket to get the league id
        const [matchupRow] = await context.db
          .select({ bracketId: PublicSchema.playoffMatchups.bracketId })
          .from(PublicSchema.playoffMatchups)
          .where(eq(PublicSchema.playoffMatchups.id, args.matchupId))
          .limit(1);

        if (!matchupRow) {
          throw new Error('Playoff matchup not found');
        }

        const [bracketRow] = await context.db
          .select({ leagueId: PublicSchema.playoffBrackets.leagueId })
          .from(PublicSchema.playoffBrackets)
          .where(eq(PublicSchema.playoffBrackets.id, matchupRow.bracketId))
          .limit(1);

        if (!bracketRow) {
          throw new Error('Playoff bracket not found');
        }

        await verifyCommissionerAccess(
          context.db,
          bracketRow.leagueId,
          user.id,
        );
      }

      const updateData: {
        highSeedScore?: string;
        lowSeedScore?: string;
        status?: 'scheduled' | 'in_progress' | 'completed';
        winnerTeamId?: number | null;
      } = {};

      if (args.highSeedScore !== undefined && args.highSeedScore !== null) {
        updateData.highSeedScore = args.highSeedScore.toString();
      }
      if (args.lowSeedScore !== undefined && args.lowSeedScore !== null) {
        updateData.lowSeedScore = args.lowSeedScore.toString();
      }
      if (args.status) {
        updateData.status = args.status;
      }

      // Determine winner if both scores provided
      if (args.highSeedScore !== undefined && args.lowSeedScore !== undefined) {
        const matchup = await context.db
          .select()
          .from(PublicSchema.playoffMatchups)
          .where(eq(PublicSchema.playoffMatchups.id, args.matchupId))
          .limit(1);

        if (matchup[0]) {
          if ((args.highSeedScore ?? 0) > (args.lowSeedScore ?? 0)) {
            updateData.winnerTeamId = matchup[0].highSeedTeamId;
          } else if ((args.lowSeedScore ?? 0) > (args.highSeedScore ?? 0)) {
            updateData.winnerTeamId = matchup[0].lowSeedTeamId;
          }
          updateData.status = 'completed';
        }
      }

      const results = await context.db
        .update(PublicSchema.playoffMatchups)
        .set(updateData)
        .where(eq(PublicSchema.playoffMatchups.id, args.matchupId))
        .returning();

      return results[0];
    },
  }),
);

/**
 * Award championship trophy
 */
builder.mutationField('awardChampionship', (t) =>
  t.field({
    type: ChampionTrophy,
    args: {
      bracketId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      const user = requireAuth(context);

      if (!user.isAdmin) {
        // Look up the bracket to get the league id for access verification
        const [bracketRow] = await context.db
          .select({ leagueId: PublicSchema.playoffBrackets.leagueId })
          .from(PublicSchema.playoffBrackets)
          .where(eq(PublicSchema.playoffBrackets.id, args.bracketId))
          .limit(1);

        if (!bracketRow) {
          throw new Error('Playoff bracket not found');
        }

        await verifyCommissionerAccess(
          context.db,
          bracketRow.leagueId,
          user.id,
        );
      }

      const { PlayoffService } = await import('../services/playoff-service');
      const trophy = await PlayoffService.awardChampionship(
        context.db,
        args.bracketId,
      );
      return {
        ...trophy,
        createdAt: trophy.createdAt.toISOString(),
        updatedAt: trophy.updatedAt.toISOString(),
      };
    },
  }),
);
