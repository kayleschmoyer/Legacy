import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, gte, lte } from 'drizzle-orm';
import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';

/**
 * Team Statistics Type for Analytics
 */
const TeamStatistics = builder.objectRef<{
  teamId: number;
  teamName: string;
  totalPoints: number;
  averagePoints: number;
  matchupsPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  currentStreak: string;
  currentStreakCount: number;
  longestWinStreak: number;
  longestLoseStreak: number;
}>('TeamStatistics');

builder.objectType(TeamStatistics, {
  description: 'Statistical analytics for a team',
  fields: (t) => ({
    teamId: t.exposeInt('teamId'),
    teamName: t.exposeString('teamName'),
    totalPoints: t.exposeFloat('totalPoints'),
    averagePoints: t.exposeFloat('averagePoints'),
    matchupsPlayed: t.exposeInt('matchupsPlayed'),
    wins: t.exposeInt('wins'),
    losses: t.exposeInt('losses'),
    ties: t.exposeInt('ties'),
    winPercentage: t.exposeFloat('winPercentage'),
    currentStreak: t.exposeString('currentStreak'),
    currentStreakCount: t.exposeInt('currentStreakCount'),
    longestWinStreak: t.exposeInt('longestWinStreak'),
    longestLoseStreak: t.exposeInt('longestLoseStreak'),
  }),
});

/**
 * Power Ranking Type
 */
const PowerRanking = builder.objectRef<{
  rank: number;
  teamId: number;
  teamName: string;
  powerScore: number;
  recentFormScore: number;
  pointDifferential: number;
}>('PowerRanking');

builder.objectType(PowerRanking, {
  description: 'Power ranking for a team',
  fields: (t) => ({
    rank: t.exposeInt('rank'),
    teamId: t.exposeInt('teamId'),
    teamName: t.exposeString('teamName'),
    powerScore: t.exposeFloat('powerScore'),
    recentFormScore: t.exposeFloat('recentFormScore'),
    pointDifferential: t.exposeFloat('pointDifferential'),
  }),
});

/**
 * Playoff Projection Type
 */
const PlayoffProjection = builder.objectRef<{
  teamId: number;
  teamName: string;
  currentRecord: string;
  playoffProbability: number;
  projectedWins: number;
  projectedLosses: number;
  strengthOfSchedule: number;
  remainingMatchups: number;
  magicNumber: number | null;
  eliminationNumber: number | null;
}>('PlayoffProjection');

builder.objectType(PlayoffProjection, {
  description: 'Playoff projection for a team',
  fields: (t) => ({
    teamId: t.exposeInt('teamId'),
    teamName: t.exposeString('teamName'),
    currentRecord: t.exposeString('currentRecord'),
    playoffProbability: t.exposeFloat('playoffProbability'),
    projectedWins: t.exposeFloat('projectedWins'),
    projectedLosses: t.exposeFloat('projectedLosses'),
    strengthOfSchedule: t.exposeFloat('strengthOfSchedule'),
    remainingMatchups: t.exposeInt('remainingMatchups'),
    magicNumber: t.exposeInt('magicNumber', { nullable: true }),
    eliminationNumber: t.exposeInt('eliminationNumber', { nullable: true }),
  }),
});

/**
 * League Analytics Type
 */
const LeagueAnalytics = builder.objectRef<{
  leagueId: number;
  leagueName: string;
  currentWeek: number;
  totalTeams: number;
  averagePointsPerMatchup: number;
  teamStats: (typeof TeamStatistics.$inferType)[];
  powerRankings: (typeof PowerRanking.$inferType)[];
  playoffProjections: (typeof PlayoffProjection.$inferType)[];
}>('LeagueAnalytics');

builder.objectType(LeagueAnalytics, {
  description: 'Comprehensive analytics for a league',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    leagueName: t.exposeString('leagueName'),
    currentWeek: t.exposeInt('currentWeek'),
    totalTeams: t.exposeInt('totalTeams'),
    averagePointsPerMatchup: t.exposeFloat('averagePointsPerMatchup'),
    teamStats: t.field({
      type: [TeamStatistics],
      resolve: (parent) => parent.teamStats,
    }),
    powerRankings: t.field({
      type: [PowerRanking],
      resolve: (parent) => parent.powerRankings,
    }),
    playoffProjections: t.field({
      type: [PlayoffProjection],
      resolve: (parent) => parent.playoffProjections,
    }),
  }),
});

/**
 * Query: Get Team Statistics for a League
 */
builder.queryField('getTeamStatistics', (t) =>
  t.field({
    type: [TeamStatistics],
    args: {
      leagueId: t.arg.int({ required: true }),
      startWeek: t.arg.int({ required: false }),
      endWeek: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Get all teams for the league
      const teams = await context.db
        .select({
          id: PublicSchema.teams.id,
          name: PublicSchema.teams.name,
        })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, args.leagueId));

      // Get all completed matchups for the league
      const matchupConditions = [
        eq(PublicSchema.matchups.leagueId, args.leagueId),
        eq(PublicSchema.matchups.status, 'completed'),
      ];

      if (args.startWeek !== null && args.startWeek !== undefined) {
        matchupConditions.push(
          gte(PublicSchema.matchups.weekNumber, args.startWeek),
        );
      }
      if (args.endWeek !== null && args.endWeek !== undefined) {
        matchupConditions.push(
          lte(PublicSchema.matchups.weekNumber, args.endWeek),
        );
      }

      const matchups = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(and(...matchupConditions))
        .orderBy(PublicSchema.matchups.weekNumber);

      // Calculate statistics using the analytics library
      const { calculateTeamStats } = await import('@legacy-sports/analytics');
      return calculateTeamStats(matchups, teams, {
        startWeek: args.startWeek || undefined,
        endWeek: args.endWeek || undefined,
      });
    },
  }),
);

/**
 * Query: Get Playoff Projections
 */
builder.queryField('getPlayoffProjections', (t) =>
  t.field({
    type: [PlayoffProjection],
    args: {
      leagueId: t.arg.int({ required: true }),
      playoffTeams: t.arg.int({ required: false }),
      remainingWeeks: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Get all teams
      const teams = await context.db
        .select({
          id: PublicSchema.teams.id,
          name: PublicSchema.teams.name,
        })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, args.leagueId));

      // Get all completed matchups
      const matchups = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, args.leagueId),
            eq(PublicSchema.matchups.status, 'completed'),
          ),
        )
        .orderBy(PublicSchema.matchups.weekNumber);

      // Calculate playoff projections using the analytics library
      const { calculateTeamStats, calculatePlayoffProjections } =
        await import('@legacy-sports/analytics');

      const teamStats = calculateTeamStats(matchups, teams);
      return calculatePlayoffProjections(teamStats, {
        playoffTeams: args.playoffTeams || undefined,
        remainingWeeks: args.remainingWeeks || undefined,
      });
    },
  }),
);

/**
 * Query: Get League Analytics (Comprehensive)
 */
builder.queryField('getLeagueAnalytics', (t) =>
  t.field({
    type: LeagueAnalytics,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Get league info
      const leagueResults = await context.db
        .select({
          id: PublicSchema.leagues.id,
          name: PublicSchema.leagues.name,
          currentMatchup: PublicSchema.leagues.currentMatchup,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.leagueId))
        .limit(1);

      if (!leagueResults[0]) {
        throw new Error('League not found');
      }

      const league = leagueResults[0];

      // Get current week from current matchup
      let currentWeek = 1;
      if (league.currentMatchup) {
        const currentMatchupResults = await context.db
          .select({ weekNumber: PublicSchema.matchups.weekNumber })
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, league.currentMatchup))
          .limit(1);
        if (currentMatchupResults[0]) {
          currentWeek = currentMatchupResults[0].weekNumber;
        }
      }

      // Get all teams
      const teams = await context.db
        .select({
          id: PublicSchema.teams.id,
          name: PublicSchema.teams.name,
        })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, args.leagueId));

      // Get all completed matchups
      const matchups = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, args.leagueId),
            eq(PublicSchema.matchups.status, 'completed'),
          ),
        )
        .orderBy(PublicSchema.matchups.weekNumber);

      // Generate comprehensive analytics using the analytics library
      const {
        generateLeagueAnalytics,
        calculatePlayoffProjections,
        calculateTeamStats,
      } = await import('@legacy-sports/analytics');

      const analytics = generateLeagueAnalytics(
        league.id,
        league.name || 'Unknown League',
        currentWeek,
        matchups,
        teams,
      );

      // Add playoff projections
      const teamStats = calculateTeamStats(matchups, teams);
      analytics.playoffProjections = calculatePlayoffProjections(teamStats);

      return analytics;
    },
  }),
);

export { TeamStatistics, PowerRanking, PlayoffProjection, LeagueAnalytics };
