import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { builder } from './builder';

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
 * Head-to-Head Record Type
 */
const HeadToHeadRecord = builder.objectRef<{
  team1Id: number;
  team1Name: string;
  team2Id: number;
  team2Name: string;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  totalMatchups: number;
  team1AveragePoints: number;
  team2AveragePoints: number;
}>('HeadToHeadRecord');

builder.objectType(HeadToHeadRecord, {
  description: 'Head-to-head record between two teams',
  fields: (t) => ({
    team1Id: t.exposeInt('team1Id'),
    team1Name: t.exposeString('team1Name'),
    team2Id: t.exposeInt('team2Id'),
    team2Name: t.exposeString('team2Name'),
    team1Wins: t.exposeInt('team1Wins'),
    team2Wins: t.exposeInt('team2Wins'),
    ties: t.exposeInt('ties'),
    totalMatchups: t.exposeInt('totalMatchups'),
    team1AveragePoints: t.exposeFloat('team1AveragePoints'),
    team2AveragePoints: t.exposeFloat('team2AveragePoints'),
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
  teamStats: typeof TeamStatistics.$inferType[];
  powerRankings: typeof PowerRanking.$inferType[];
  playoffProjections: typeof PlayoffProjection.$inferType[];
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
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get all teams for the league
        const teams = await db
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
          matchupConditions.push(gte(PublicSchema.matchups.weekNumber, args.startWeek));
        }
        if (args.endWeek !== null && args.endWeek !== undefined) {
          matchupConditions.push(lte(PublicSchema.matchups.weekNumber, args.endWeek));
        }

        const matchups = await db
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
      });
    },
  })
);

/**
 * Query: Get Head-to-Head Record
 */
builder.queryField('getHeadToHeadRecord', (t) =>
  t.field({
    type: HeadToHeadRecord,
    args: {
      leagueId: t.arg.int({ required: true }),
      team1Id: t.arg.int({ required: true }),
      team2Id: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get team names
        const [team1, team2] = await Promise.all([
          db
            .select({ id: PublicSchema.teams.id, name: PublicSchema.teams.name })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.id, args.team1Id))
            .limit(1),
          db
            .select({ id: PublicSchema.teams.id, name: PublicSchema.teams.name })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.id, args.team2Id))
            .limit(1),
        ]);

        if (!team1[0] || !team2[0]) {
          throw new Error('One or both teams not found');
        }

        // Get all matchups between these teams
        const matchups = await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.status, 'completed'),
              sql`(
                (${PublicSchema.matchups.team1Id} = ${args.team1Id} AND ${PublicSchema.matchups.team2Id} = ${args.team2Id})
                OR
                (${PublicSchema.matchups.team1Id} = ${args.team2Id} AND ${PublicSchema.matchups.team2Id} = ${args.team1Id})
              )`
            )
          )
          .orderBy(desc(PublicSchema.matchups.weekNumber));

        // Calculate head-to-head using the analytics library
        const { calculateHeadToHead } = await import('@legacy-sports/analytics');
        return calculateHeadToHead(matchups, team1[0], team2[0]);
      });
    },
  })
);

/**
 * Query: Get Power Rankings
 */
builder.queryField('getPowerRankings', (t) =>
  t.field({
    type: [PowerRanking],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get all teams
        const teams = await db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, args.leagueId));

        // Get all completed matchups
        const matchups = await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.status, 'completed')
            )
          )
          .orderBy(PublicSchema.matchups.weekNumber);

        // Calculate power rankings using the analytics library
        const {
          calculateTeamStats,
          calculateTrends,
          calculatePowerRankings,
        } = await import('@legacy-sports/analytics');

        const teamStats = calculateTeamStats(matchups, teams);
        const trends = calculateTrends(matchups, teams);
        return calculatePowerRankings(teamStats, trends);
      });
    },
  })
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
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get all teams
        const teams = await db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, args.leagueId));

        // Get all completed matchups
        const matchups = await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.status, 'completed')
            )
          )
          .orderBy(PublicSchema.matchups.weekNumber);

        // Calculate playoff projections using the analytics library
        const {
          calculateTeamStats,
          calculatePlayoffProjections,
        } = await import('@legacy-sports/analytics');

        const teamStats = calculateTeamStats(matchups, teams);
        return calculatePlayoffProjections(teamStats, {
          playoffTeams: args.playoffTeams || undefined,
          remainingWeeks: args.remainingWeeks || undefined,
        });
      });
    },
  })
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
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get league info
        const leagueResults = await db
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
          const currentMatchupResults = await db
            .select({ weekNumber: PublicSchema.matchups.weekNumber })
            .from(PublicSchema.matchups)
            .where(eq(PublicSchema.matchups.id, league.currentMatchup))
            .limit(1);
          if (currentMatchupResults[0]) {
            currentWeek = currentMatchupResults[0].weekNumber;
          }
        }

        // Get all teams
        const teams = await db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, args.leagueId));

        // Get all completed matchups
        const matchups = await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.status, 'completed')
            )
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
          teams
        );

        // Add playoff projections
        const teamStats = calculateTeamStats(matchups, teams);
        analytics.playoffProjections = calculatePlayoffProjections(teamStats);

        return analytics;
      });
    },
  })
);

export { TeamStatistics, HeadToHeadRecord, PowerRanking, PlayoffProjection, LeagueAnalytics };
