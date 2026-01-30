import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { and, eq, sql } from 'drizzle-orm';
import { builder } from './builder';
import { Team } from './leagues';
import {
  GameBattingRef,
  GameFieldingRef,
  GamePitchingRef,
  SeasonBattingRef,
  SeasonFieldingRef,
  SeasonPitchingRef,
} from './statistics';

// Matchup status enum
const MatchupStatus = builder.enumType('MatchupStatus', {
  values: ['scheduled', 'in_progress', 'completed', 'cancelled'] as const,
});

// Extended Matchup type with all new fields
const Matchup = builder.objectRef<{
  id: number;
  weekNumber: number;
  leagueId: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: string | null; // Decimal stored as string
  team2Score: string | null; // Decimal stored as string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  selectedSeason: number | null;
  gamesPerMatchup: number | null;
  startTime: string | null;
  endTime: string | null;
}>('Matchup');

builder.objectType(Matchup, {
  description: 'A head-to-head matchup between two teams in a league',
  fields: (t) => ({
    id: t.exposeID('id'),
    weekNumber: t.exposeInt('weekNumber'),
    leagueId: t.exposeInt('leagueId'),
    team1Id: t.exposeInt('team1Id', { nullable: true }),
    team2Id: t.exposeInt('team2Id', { nullable: true }),
    team1Score: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.team1Score ? parseFloat(matchup.team1Score) : null,
    }),
    team2Score: t.float({
      nullable: true,
      resolve: (matchup) =>
        matchup.team2Score ? parseFloat(matchup.team2Score) : null,
    }),
    status: t.field({
      type: MatchupStatus,
      resolve: (matchup) => matchup.status,
    }),
    selectedSeason: t.exposeInt('selectedSeason', { nullable: true }),
    gamesPerMatchup: t.exposeInt('gamesPerMatchup', { nullable: true }),
    startTime: t.exposeString('startTime', { nullable: true }),
    endTime: t.exposeString('endTime', { nullable: true }),
    // Relational fields - using Team type imported from leagues.ts
    team1: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup) => {
        if (!matchup.team1Id) return null;
        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
              leagueId: PublicSchema.teams.leagueId,
            })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.id, matchup.team1Id ?? 0))
            .limit(1);
          return results[0] || null;
        });
      },
    }),
    team2: t.field({
      type: Team,
      nullable: true,
      resolve: async (matchup) => {
        if (!matchup.team2Id) return null;
        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
              leagueId: PublicSchema.teams.leagueId,
            })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.id, matchup.team2Id ?? 0))
            .limit(1);
          return results[0] || null;
        });
      },
    }),
  }),
});

// Query: getMatchupById
builder.queryField('getMatchupById', (t) =>
  t.field({
    type: Matchup,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const results = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.id))
          .limit(1);

        return results[0] || null;
      });
    },
  }),
);

// Query: getMatchupsForLeague
builder.queryField('getMatchupsForLeague', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const conditions = [eq(PublicSchema.matchups.leagueId, args.leagueId)];

        if (args.weekNumber !== null && args.weekNumber !== undefined) {
          conditions.push(
            eq(PublicSchema.matchups.weekNumber, args.weekNumber),
          );
        }

        return await db
          .select()
          .from(PublicSchema.matchups)
          .where(and(...conditions));
      });
    },
  }),
);

// Query: getCurrentMatchupForLeague
builder.queryField('getCurrentMatchupForLeague', (t) =>
  t.field({
    type: Matchup,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get the current matchup ID from the league
        const leagueResults = await db
          .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId))
          .limit(1);

        if (!leagueResults[0]?.currentMatchup) {
          return null;
        }

        const matchupResults = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, leagueResults[0].currentMatchup))
          .limit(1);

        return matchupResults[0] || null;
      });
    },
  }),
);

// Query: getMatchupsByWeek
builder.queryField('getMatchupsByWeek', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        return await db
          .select()
          .from(PublicSchema.matchups)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, args.leagueId),
              eq(PublicSchema.matchups.weekNumber, args.weekNumber),
            ),
          );
      });
    },
  }),
);

// Input types for mutations
const CreateMatchupInput = builder.inputType('CreateMatchupInput', {
  fields: (t) => ({
    leagueId: t.int({ required: true }),
    weekNumber: t.int({ required: true }),
    team1Id: t.int({ required: false }),
    team2Id: t.int({ required: false }),
    selectedSeason: t.int({ required: false }),
    gamesPerMatchup: t.int({ required: false }),
    startTime: t.string({ required: false }),
    endTime: t.string({ required: false }),
  }),
});

// Mutation: createMatchup
builder.mutationField('createMatchup', (t) =>
  t.field({
    type: Matchup,
    args: {
      input: t.arg({ type: CreateMatchupInput, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get league configuration for defaults
        const league = await db
          .select({
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.input.leagueId))
          .limit(1);

        if (!league[0]) {
          throw new Error('League not found');
        }

        const gamesPerMatchup =
          args.input.gamesPerMatchup ?? league[0].gamesPerMatchup ?? 5;

        // Insert the matchup
        const results = await db
          .insert(PublicSchema.matchups)
          .values({
            leagueId: args.input.leagueId,
            weekNumber: args.input.weekNumber,
            team1Id: args.input.team1Id ?? null,
            team2Id: args.input.team2Id ?? null,
            selectedSeason: args.input.selectedSeason ?? null,
            gamesPerMatchup,
            startTime: args.input.startTime ?? null,
            endTime: args.input.endTime ?? null,
            status: 'scheduled',
          })
          .returning();

        return results[0];
      });
    },
  }),
);

// Mutation: updateMatchupScore
builder.mutationField('updateMatchupScore', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      team1Score: t.arg.float({ required: false }),
      team2Score: t.arg.float({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const updateData: { team1Score?: string; team2Score?: string } = {};

        if (args.team1Score !== null && args.team1Score !== undefined) {
          updateData.team1Score = args.team1Score.toString();
        }
        if (args.team2Score !== null && args.team2Score !== undefined) {
          updateData.team2Score = args.team2Score.toString();
        }

        const results = await db
          .update(PublicSchema.matchups)
          .set(updateData)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .returning();

        if (!results[0]) {
          throw new Error('Matchup not found');
        }

        return results[0];
      });
    },
  }),
);

// Mutation: updateMatchupStatus
builder.mutationField('updateMatchupStatus', (t) =>
  t.field({
    type: Matchup,
    args: {
      matchupId: t.arg.int({ required: true }),
      status: t.arg({ type: MatchupStatus, required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        const results = await db
          .update(PublicSchema.matchups)
          .set({ status: args.status })
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .returning();

        if (!results[0]) {
          throw new Error('Matchup not found');
        }

        return results[0];
      });
    },
  }),
);

// Mutation: triggerGameSelection (placeholder for commissioner action)
builder.mutationField('triggerGameSelection', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      matchupId: t.arg.int({ required: true }),
      gameNumber: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // This is a placeholder - actual game selection logic will be implemented in later stories
      // For now, just validate the matchup exists
      return await runWithPublicClient(getDbOptions(), async (db) => {
        const matchup = await db
          .select()
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .limit(1);

        if (!matchup[0]) {
          throw new Error('Matchup not found');
        }

        // TODO: Implement actual game selection logic in LS-20
        return true;
      });
    },
  }),
);

// ============================================================================
// HISTORY AND STANDINGS QUERIES (LS-22)
// ============================================================================

// TeamStanding type for standings queries
const TeamStanding = builder.objectRef<{
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  totalMatchups: number;
  pointsFor: number;
  pointsAgainst: number;
  winPercentage: number;
  averagePointsFor: number;
  averagePointsAgainst: number;
  rank: number | undefined;
}>('TeamStanding');

builder.objectType(TeamStanding, {
  description: 'Team standing information with wins, losses, and scoring stats',
  fields: (t) => ({
    teamId: t.exposeID('teamId'),
    teamName: t.exposeString('teamName'),
    wins: t.exposeInt('wins'),
    losses: t.exposeInt('losses'),
    ties: t.exposeInt('ties'),
    totalMatchups: t.exposeInt('totalMatchups'),
    pointsFor: t.exposeFloat('pointsFor'),
    pointsAgainst: t.exposeFloat('pointsAgainst'),
    winPercentage: t.exposeFloat('winPercentage'),
    averagePointsFor: t.exposeFloat('averagePointsFor'),
    averagePointsAgainst: t.exposeFloat('averagePointsAgainst'),
    rank: t.exposeInt('rank'),
  }),
});

// HeadToHeadRecord type
const HeadToHeadRecord = builder.objectRef<{
  team1Id: number;
  team2Id: number;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  totalMatchups: number;
  team1TotalPoints: number;
  team2TotalPoints: number;
  averageTeam1Score: number;
  averageTeam2Score: number;
}>('HeadToHeadRecord');

builder.objectType(HeadToHeadRecord, {
  description: 'Head-to-head record between two teams',
  fields: (t) => ({
    team1Id: t.exposeID('team1Id'),
    team2Id: t.exposeID('team2Id'),
    team1Wins: t.exposeInt('team1Wins'),
    team2Wins: t.exposeInt('team2Wins'),
    ties: t.exposeInt('ties'),
    totalMatchups: t.exposeInt('totalMatchups'),
    team1TotalPoints: t.exposeFloat('team1TotalPoints'),
    team2TotalPoints: t.exposeFloat('team2TotalPoints'),
    averageTeam1Score: t.exposeFloat('averageTeam1Score'),
    averageTeam2Score: t.exposeFloat('averageTeam2Score'),
  }),
});

// SeasonResults type
const SeasonResults = builder.objectRef<{
  leagueId: number;
  season: number | null;
  totalMatchups: number;
  completedMatchups: number;
  standings: Array<{
    teamId: number;
    teamName: string;
    wins: number;
    losses: number;
    ties: number;
    totalMatchups: number;
    pointsFor: number;
    pointsAgainst: number;
    winPercentage: number;
    averagePointsFor: number;
    averagePointsAgainst: number;
    rank: number | undefined;
  }>;
}>('SeasonResults');

builder.objectType(SeasonResults, {
  description: 'Complete season results with standings',
  fields: (t) => ({
    leagueId: t.exposeID('leagueId'),
    season: t.exposeInt('season', { nullable: true }),
    totalMatchups: t.exposeInt('totalMatchups'),
    completedMatchups: t.exposeInt('completedMatchups'),
    standings: t.field({
      type: [TeamStanding],
      resolve: (parent) => parent.standings,
    }),
  }),
});

// PlayoffQualification type
const PlayoffQualification = builder.objectRef<{
  teamId: number;
  teamName: string;
  isQualified: boolean;
  seedNumber: number | null;
  standing: {
    teamId: number;
    teamName: string;
    wins: number;
    losses: number;
    ties: number;
    totalMatchups: number;
    pointsFor: number;
    pointsAgainst: number;
    winPercentage: number;
    averagePointsFor: number;
    averagePointsAgainst: number;
    rank: number | undefined;
  };
}>('PlayoffQualification');

builder.objectType(PlayoffQualification, {
  description: 'Playoff qualification status for a team',
  fields: (t) => ({
    teamId: t.exposeID('teamId'),
    teamName: t.exposeString('teamName'),
    isQualified: t.exposeBoolean('isQualified'),
    seedNumber: t.exposeInt('seedNumber', { nullable: true }),
    standing: t.field({
      type: TeamStanding,
      resolve: (parent) => parent.standing,
    }),
  }),
});

// MatchupStatusCounts type
const MatchupStatusCounts = builder.objectRef<{
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  total: number;
}>('MatchupStatusCounts');

builder.objectType(MatchupStatusCounts, {
  description: 'Count of matchups by status',
  fields: (t) => ({
    scheduled: t.exposeInt('scheduled'),
    inProgress: t.exposeInt('inProgress'),
    completed: t.exposeInt('completed'),
    cancelled: t.exposeInt('cancelled'),
    total: t.exposeInt('total'),
  }),
});

// Query: getLeagueStandings
builder.queryField('getLeagueStandings', (t) =>
  t.field({
    type: [TeamStanding],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const standings = await StandingsService.getStandings({
        leagueId: args.leagueId,
        season: args.season,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- GraphQL builder type inference issue with optional rank field
      return standings as any;
    },
  }),
);

// Query: getHeadToHeadRecord
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

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getHeadToHead({
        leagueId: args.leagueId,
        team1Id: args.team1Id,
        team2Id: args.team2Id,
      });
    },
  }),
);

// Query: getSeasonResults
builder.queryField('getSeasonResults', (t) =>
  t.field({
    type: SeasonResults,
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const results = await StandingsService.getSeasonSummary(
        args.leagueId,
        args.season ?? null,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- GraphQL builder type inference issue with optional rank field
      return results as any;
    },
  }),
);

// Query: getPlayoffRace
builder.queryField('getPlayoffRace', (t) =>
  t.field({
    type: [PlayoffQualification],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
      playoffSpots: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const qualifications = await StandingsService.getPlayoffRace({
        leagueId: args.leagueId,
        season: args.season ?? null,
        playoffSpots: args.playoffSpots,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- GraphQL builder type inference issue with optional rank field
      return qualifications as any;
    },
  }),
);

// Query: getMatchupHistory
builder.queryField('getMatchupHistory', (t) =>
  t.field({
    type: [Matchup],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
      teamId: t.arg.int({ required: false }),
      status: t.arg({ type: MatchupStatus, required: false }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getMatchupHistory({
        leagueId: args.leagueId,
        season: args.season,
        teamId: args.teamId ?? undefined,
        status: args.status ?? undefined,
        limit: args.limit ?? undefined,
      });
    },
  }),
);

// Query: getTeamRecentMatchups
builder.queryField('getTeamRecentMatchups', (t) =>
  t.field({
    type: [Matchup],
    args: {
      teamId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getTeamRecentMatchups(
        args.teamId,
        args.limit ?? 10,
      );
    },
  }),
);

// Query: getMatchupStatusCounts
builder.queryField('getMatchupStatusCounts', (t) =>
  t.field({
    type: MatchupStatusCounts,
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      return await StandingsService.getMatchupStats(
        args.leagueId,
        args.season ?? undefined,
      );
    },
  }),
);

// Query: getPowerRankings
builder.queryField('getPowerRankings', (t) =>
  t.field({
    type: [TeamStanding],
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { StandingsService } =
        await import('../services/standings-service');

      const powerRankings = await StandingsService.getPowerRankings(
        args.leagueId,
        args.season ?? undefined,
      );

      // Return with powerRank as rank for consistency
      return powerRankings.map((pr) => ({
        ...pr,
        rank: pr.powerRank,
      }));
    },
  }),
);

// MatchupPlayer type
const MatchupPlayer = builder.objectRef<{
  id: number;
  matchupId: number;
  playerId: number;
  teamId: number;
  positionId: number | null;
  season: number | null;
}>('MatchupPlayer');

builder.objectType(MatchupPlayer, {
  description: 'A player selected for a specific matchup',
  fields: (t) => ({
    id: t.exposeID('id'),
    matchupId: t.exposeInt('matchupId'),
    playerId: t.exposeInt('playerId'),
    teamId: t.exposeInt('teamId'),
    positionId: t.exposeInt('positionId', { nullable: true }),
    season: t.exposeInt('season', { nullable: true }),
    // Player details
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (matchupPlayer) => {
        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select({
              id: PublicSchema.players.id,
              firstName: PublicSchema.players.firstName,
              lastName: PublicSchema.players.lastName,
              brefId: PublicSchema.players.brefId,
              statsLastFetchedAt: PublicSchema.players.statsLastFetchedAt,
            })
            .from(PublicSchema.players)
            .where(eq(PublicSchema.players.id, matchupPlayer.playerId))
            .limit(1);

          return results[0] || null;
        });
      },
    }),
    // Season stats
    seasonBatting: t.field({
      type: SeasonBattingRef,
      nullable: true,
      resolve: async (matchupPlayer) => {
        if (!matchupPlayer.season) return null;

        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select()
            .from(PublicSchema.seasonBatting)
            .where(
              and(
                eq(PublicSchema.seasonBatting.playerId, matchupPlayer.playerId),
                eq(
                  PublicSchema.seasonBatting.season,
                  matchupPlayer.season ?? 0,
                ),
              ),
            )
            .limit(1);

          return results[0] || null;
        });
      },
    }),
    seasonPitching: t.field({
      type: SeasonPitchingRef,
      nullable: true,
      resolve: async (matchupPlayer) => {
        if (!matchupPlayer.season) return null;

        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select()
            .from(PublicSchema.seasonPitching)
            .where(
              and(
                eq(
                  PublicSchema.seasonPitching.playerId,
                  matchupPlayer.playerId,
                ),
                eq(
                  PublicSchema.seasonPitching.season,
                  matchupPlayer.season ?? 0,
                ),
              ),
            )
            .limit(1);

          return results[0] || null;
        });
      },
    }),
    seasonFielding: t.field({
      type: SeasonFieldingRef,
      nullable: true,
      resolve: async (matchupPlayer) => {
        if (!matchupPlayer.season) return null;

        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select()
            .from(PublicSchema.seasonFielding)
            .where(
              and(
                eq(
                  PublicSchema.seasonFielding.playerId,
                  matchupPlayer.playerId,
                ),
                eq(
                  PublicSchema.seasonFielding.season,
                  matchupPlayer.season ?? 0,
                ),
              ),
            );

          return results[0] || null;
        });
      },
    }),

    // Games selected for this matchup player
    games: t.field({
      type: [MatchupPlayerGameRef],
      resolve: async (matchupPlayer) => {
        return await runWithPublicClient(getDbOptions(), async (db) => {
          const results = await db
            .select()
            .from(PublicSchema.matchupPlayerGames)
            .where(
              eq(
                PublicSchema.matchupPlayerGames.matchupPlayerId,
                matchupPlayer.id,
              ),
            );

          return results;
        });
      },
    }),
  }),
});

// MatchupPlayerGame type - represents a selected game for a matchup player
export const MatchupPlayerGameRef = builder.objectRef<{
  id: number;
  matchupPlayerId: number;
  gameNum: number;
  battingGameNum: number | null;
  pitchingGameNum: number | null;
  fieldingGameNum: number | null;
  fieldingGamePos: string;
}>('MatchupPlayerGame');

MatchupPlayerGameRef.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    matchupPlayerId: t.exposeInt('matchupPlayerId'),
    gameNum: t.exposeInt('gameNum'),
    battingGameNum: t.exposeInt('battingGameNum', { nullable: true }),
    pitchingGameNum: t.exposeInt('pitchingGameNum', { nullable: true }),
    fieldingGameNum: t.exposeInt('fieldingGameNum', { nullable: true }),
    fieldingGamePos: t.exposeString('fieldingGamePos'),

    // Resolve the actual game stats for this selected game
    battingGame: t.field({
      type: GameBattingRef,
      nullable: true,
      resolve: async (game) => {
        if (!game.battingGameNum) return null;

        // Get the matchup player info
        const matchupPlayerInfo = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
            const mpResult = await db
              .select({
                playerId: PublicSchema.matchupPlayers.playerId,
                matchupId: PublicSchema.matchupPlayers.matchupId,
              })
              .from(PublicSchema.matchupPlayers)
              .where(eq(PublicSchema.matchupPlayers.id, game.matchupPlayerId))
              .limit(1);

            if (!mpResult[0]) return null;

            // Get matchup to find league and week
            const matchupResult = await db
              .select({
                leagueId: PublicSchema.matchups.leagueId,
                weekNumber: PublicSchema.matchups.weekNumber,
              })
              .from(PublicSchema.matchups)
              .where(eq(PublicSchema.matchups.id, mpResult[0].matchupId))
              .limit(1);

            if (!matchupResult[0]) return null;

            // Get season from league_week_player_seasons
            const seasonResult = await db
              .select({
                season: PublicSchema.leagueWeekPlayerSeasons.season,
              })
              .from(PublicSchema.leagueWeekPlayerSeasons)
              .where(
                and(
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.leagueId,
                    matchupResult[0].leagueId,
                  ),
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.weekNumber,
                    matchupResult[0].weekNumber,
                  ),
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.playerId,
                    mpResult[0].playerId,
                  ),
                ),
              )
              .limit(1);

            if (!seasonResult[0]) return null;

            return {
              playerId: mpResult[0].playerId,
              season: seasonResult[0].season,
            };
          },
        );

        if (!matchupPlayerInfo) return null;

        return await runWithPublicClient(getDbOptions(), async (db) => {
          const result = await db
            .select()
            .from(PublicSchema.gameBatting)
            .where(
              and(
                eq(
                  PublicSchema.gameBatting.playerId,
                  matchupPlayerInfo.playerId,
                ),
                eq(PublicSchema.gameBatting.season, matchupPlayerInfo.season),
                eq(PublicSchema.gameBatting.gameNum, game.battingGameNum ?? 0),
              ),
            )
            .limit(1);
          return result[0] || null;
        });
      },
    }),

    pitchingGame: t.field({
      type: GamePitchingRef,
      nullable: true,
      resolve: async (game) => {
        if (!game.pitchingGameNum) return null;

        // Get the matchup player info
        const matchupPlayerInfo = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
            const mpResult = await db
              .select({
                playerId: PublicSchema.matchupPlayers.playerId,
                matchupId: PublicSchema.matchupPlayers.matchupId,
              })
              .from(PublicSchema.matchupPlayers)
              .where(eq(PublicSchema.matchupPlayers.id, game.matchupPlayerId))
              .limit(1);

            if (!mpResult[0]) return null;

            // Get matchup to find league and week
            const matchupResult = await db
              .select({
                leagueId: PublicSchema.matchups.leagueId,
                weekNumber: PublicSchema.matchups.weekNumber,
              })
              .from(PublicSchema.matchups)
              .where(eq(PublicSchema.matchups.id, mpResult[0].matchupId))
              .limit(1);

            if (!matchupResult[0]) return null;

            // Get season from league_week_player_seasons
            const seasonResult = await db
              .select({
                season: PublicSchema.leagueWeekPlayerSeasons.season,
              })
              .from(PublicSchema.leagueWeekPlayerSeasons)
              .where(
                and(
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.leagueId,
                    matchupResult[0].leagueId,
                  ),
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.weekNumber,
                    matchupResult[0].weekNumber,
                  ),
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.playerId,
                    mpResult[0].playerId,
                  ),
                ),
              )
              .limit(1);

            if (!seasonResult[0]) return null;

            return {
              playerId: mpResult[0].playerId,
              season: seasonResult[0].season,
            };
          },
        );

        if (!matchupPlayerInfo) return null;

        return await runWithPublicClient(getDbOptions(), async (db) => {
          const result = await db
            .select()
            .from(PublicSchema.gamePitching)
            .where(
              and(
                eq(
                  PublicSchema.gamePitching.playerId,
                  matchupPlayerInfo.playerId,
                ),
                eq(PublicSchema.gamePitching.season, matchupPlayerInfo.season),
                eq(
                  PublicSchema.gamePitching.gameNum,
                  game.pitchingGameNum ?? 0,
                ),
              ),
            )
            .limit(1);
          return result[0] || null;
        });
      },
    }),

    fieldingGame: t.field({
      type: GameFieldingRef,
      nullable: true,
      resolve: async (game) => {
        if (!game.fieldingGameNum) return null;

        // Get the matchup player info
        const matchupPlayerInfo = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
            const mpResult = await db
              .select({
                playerId: PublicSchema.matchupPlayers.playerId,
                matchupId: PublicSchema.matchupPlayers.matchupId,
              })
              .from(PublicSchema.matchupPlayers)
              .where(eq(PublicSchema.matchupPlayers.id, game.matchupPlayerId))
              .limit(1);

            if (!mpResult[0]) return null;

            // Get matchup to find league and week
            const matchupResult = await db
              .select({
                leagueId: PublicSchema.matchups.leagueId,
                weekNumber: PublicSchema.matchups.weekNumber,
              })
              .from(PublicSchema.matchups)
              .where(eq(PublicSchema.matchups.id, mpResult[0].matchupId))
              .limit(1);

            if (!matchupResult[0]) return null;

            // Get season from league_week_player_seasons
            const seasonResult = await db
              .select({
                season: PublicSchema.leagueWeekPlayerSeasons.season,
              })
              .from(PublicSchema.leagueWeekPlayerSeasons)
              .where(
                and(
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.leagueId,
                    matchupResult[0].leagueId,
                  ),
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.weekNumber,
                    matchupResult[0].weekNumber,
                  ),
                  eq(
                    PublicSchema.leagueWeekPlayerSeasons.playerId,
                    mpResult[0].playerId,
                  ),
                ),
              )
              .limit(1);

            if (!seasonResult[0]) return null;

            return {
              playerId: mpResult[0].playerId,
              season: seasonResult[0].season,
            };
          },
        );

        if (!matchupPlayerInfo) return null;

        return await runWithPublicClient(getDbOptions(), async (db) => {
          const result = await db
            .select({
              playerId: PublicSchema.gameFielding.playerId,
              season: PublicSchema.gameFielding.season,
              gameNum: PublicSchema.gameFielding.gameNum,
              gameIdentifier: PublicSchema.gameFielding.gameIdentifier,
              // Map database column names to expected GraphQL type properties
              pos: sql<string>`${game.fieldingGamePos}`.as('pos'), // Use the position from game object
              g: sql<number | null>`NULL`.as('g'), // Not available in game_fielding
              gs: sql<number | null>`NULL`.as('gs'), // Not available in game_fielding
              inn: PublicSchema.gameFielding.innDef, // Map innDef → inn
              po: PublicSchema.gameFielding.po,
              a: PublicSchema.gameFielding.a,
              e: PublicSchema.gameFielding.eDef, // Map eDef → e
              dp: PublicSchema.gameFielding.dpDef, // Map dpDef → dp
              pb: sql<number | null>`NULL`.as('pb'), // Not available in game_fielding
              sb: sql<number | null>`NULL`.as('sb'), // Not available in game_fielding
              cs: sql<number | null>`NULL`.as('cs'), // Not available in game_fielding
            })
            .from(PublicSchema.gameFielding)
            .where(
              and(
                eq(
                  PublicSchema.gameFielding.playerId,
                  matchupPlayerInfo.playerId,
                ),
                eq(PublicSchema.gameFielding.season, matchupPlayerInfo.season),
                eq(
                  PublicSchema.gameFielding.gameNum,
                  game.fieldingGameNum ?? 0,
                ),
                // Note: pos column doesn't exist in game_fielding table, removed filter
              ),
            )
            .limit(1);
          return result[0] || null;
        });
      },
    }),
  }),
});

// Query: getMatchupPlayers
builder.queryField('getMatchupPlayers', (t) =>
  t.field({
    type: [MatchupPlayer],
    args: {
      matchupId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      return await runWithPublicClient(getDbOptions(), async (db) => {
        // Get matchup players with their selected seasons from league_week_player_seasons
        const matchupResults = await db
          .select({
            matchupId: PublicSchema.matchups.id,
            leagueId: PublicSchema.matchups.leagueId,
            weekNumber: PublicSchema.matchups.weekNumber,
          })
          .from(PublicSchema.matchups)
          .where(eq(PublicSchema.matchups.id, args.matchupId))
          .limit(1);

        if (!matchupResults[0]) {
          return [];
        }

        const { leagueId, weekNumber } = matchupResults[0];

        // Get matchup players
        const playersResults = await db
          .select({
            id: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            playerId: PublicSchema.matchupPlayers.playerId,
            teamId: PublicSchema.matchupPlayers.teamId,
          })
          .from(PublicSchema.matchupPlayers)
          .where(eq(PublicSchema.matchupPlayers.matchupId, args.matchupId));

        // Get team members to find position assignments
        const playerIds = playersResults.map((p) => p.playerId);

        if (playerIds.length === 0) {
          return [];
        }

        const teamMembersResults = await db
          .select({
            playerId: PublicSchema.teamMembers.playerId,
            positionId: PublicSchema.teamMembers.positionId,
          })
          .from(PublicSchema.teamMembers)
          .where(
            and(
              eq(PublicSchema.teamMembers.leagueId, leagueId),
              // Filter to only the players in this matchup
            ),
          );

        const positionMap = new Map(
          teamMembersResults.map((tm) => [tm.playerId, tm.positionId]),
        );

        // Get selected seasons from league_week_player_seasons
        const seasonsResults = await db
          .select({
            playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
            season: PublicSchema.leagueWeekPlayerSeasons.season,
          })
          .from(PublicSchema.leagueWeekPlayerSeasons)
          .where(
            and(
              eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
              eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
            ),
          );

        const seasonMap = new Map(
          seasonsResults.map((s) => [s.playerId, s.season]),
        );

        // Combine the data
        return playersResults.map((player) => ({
          ...player,
          positionId: positionMap.get(player.playerId) ?? null,
          season: seasonMap.get(player.playerId) ?? null,
        }));
      });
    },
  }),
);
