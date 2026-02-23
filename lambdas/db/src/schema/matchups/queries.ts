/**
 * Matchups domain — query fields
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, inArray } from 'drizzle-orm';

import {
  HeadToHeadRecord,
  Matchup,
  MatchupPlayer,
  MatchupStatus,
  MatchupStatusCounts,
  PlayoffQualification,
  SeasonResults,
  TeamStanding,
} from './types';
import { builder } from '../builder';

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

      const results = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, args.id))
        .limit(1);

      return results[0] || null;
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

      const conditions = [eq(PublicSchema.matchups.leagueId, args.leagueId)];

      if (args.weekNumber !== null && args.weekNumber !== undefined) {
        conditions.push(eq(PublicSchema.matchups.weekNumber, args.weekNumber));
      }

      return await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(and(...conditions));
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

      // Get the current matchup ID from the league
      const leagueResults = await context.db
        .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.leagueId))
        .limit(1);

      if (!leagueResults[0]?.currentMatchup) {
        return null;
      }

      const matchupResults = await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(eq(PublicSchema.matchups.id, leagueResults[0].currentMatchup))
        .limit(1);

      return matchupResults[0] || null;
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

      return await context.db
        .select()
        .from(PublicSchema.matchups)
        .where(
          and(
            eq(PublicSchema.matchups.leagueId, args.leagueId),
            eq(PublicSchema.matchups.weekNumber, args.weekNumber),
          ),
        );
    },
  }),
);

// ============================================================================
// HISTORY AND STANDINGS QUERIES (LS-22)
// ============================================================================

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
        await import('../../services/standings-service');

      const standings = await StandingsService.getStandings(context.db, {
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
        await import('../../services/standings-service');

      return await StandingsService.getHeadToHead(context.db, {
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
        await import('../../services/standings-service');

      const results = await StandingsService.getSeasonSummary(
        context.db,
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
        await import('../../services/standings-service');

      const qualifications = await StandingsService.getPlayoffRace(context.db, {
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
        await import('../../services/standings-service');

      return await StandingsService.getMatchupHistory(context.db, {
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
        await import('../../services/standings-service');

      return await StandingsService.getTeamRecentMatchups(
        context.db,
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
        await import('../../services/standings-service');

      return await StandingsService.getMatchupStats(
        context.db,
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
        await import('../../services/standings-service');

      const powerRankings = await StandingsService.getPowerRankings(
        context.db,
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

      // Get matchup players with their selected seasons from league_week_player_seasons
      const matchupResults = await context.db
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
      const playersResults = await context.db
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

      const teamMembersResults = await context.db
        .select({
          playerId: PublicSchema.teamMembers.playerId,
          positionId: PublicSchema.teamMembers.positionId,
        })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            inArray(PublicSchema.teamMembers.playerId, playerIds),
          ),
        );

      const positionMap = new Map(
        teamMembersResults.map((tm) => [tm.playerId, tm.positionId]),
      );

      // Get selected seasons from league_week_player_seasons
      const seasonsResults = await context.db
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
    },
  }),
);
