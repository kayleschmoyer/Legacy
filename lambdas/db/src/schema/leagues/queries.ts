/**
 * League domain — Query resolvers
 *
 * Queries: league, userLeagues, leaguePositions, leagueTeams,
 *          userTeamId, validateInviteCode, teamLeagueMembers
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq } from 'drizzle-orm';
import {
  League,
  LeagueMember,
  LeaguePosition,
  Team,
  TeamMember,
} from './types';
import { builder } from '../builder';

// Query fields
builder.queryField('league', (t) =>
  t.field({
    type: League,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to fetch league details');
      }

      const leagueId = args.id;
      const userId = context.user.id;

      try {
        // Query the database for the specific league
        // First check if user has access to this league
        const memberCheck = await context.db
          .select({
            leagueId: PublicSchema.leagueMembers.leagueId,
          })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (memberCheck.length === 0) {
          throw new Error('Access denied: You are not a member of this league');
        }

        // Get the league details
        const results = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            owner: PublicSchema.leagues.owner,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            currentMatchup: PublicSchema.leagues.currentMatchup,
            draftStatus: PublicSchema.leagues.draftStatus,
            inviteCode: PublicSchema.leagues.inviteCode,
            playerPool: PublicSchema.leagues.playerPool,
            weekAdvanceStatus: PublicSchema.leagues.weekAdvanceStatus,
            waiverType: PublicSchema.leagues.waiverType,
            waiverEnabled: PublicSchema.leagues.waiverEnabled,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (results.length === 0) {
          return null;
        }

        const league = results[0];

        // Get the user's membership info (including team ID)
        const membershipResults = await context.db
          .select({
            leagueId: PublicSchema.leagueMembers.leagueId,
            userId: PublicSchema.leagueMembers.userId,
            teamId: PublicSchema.leagueMembers.teamId,
            permissionLevel: PublicSchema.leagueMembers.permissionLevel,
          })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        const userMembership =
          membershipResults.length > 0 ? membershipResults[0] : null;

        return {
          id: league.id,
          name: league.name,
          owner: league.owner,
          maxRosterSize: league.maxRosterSize,
          currentMatchup: league.currentMatchup,
          draftStatus: league.draftStatus,
          inviteCode: league.inviteCode,
          playerPool: league.playerPool,
          weekAdvanceStatus: league.weekAdvanceStatus,
          waiverType: league.waiverType,
          waiverEnabled: league.waiverEnabled,
          faabBudgetDefault: league.faabBudgetDefault,
          userMembership,
        };
      } catch (error) {
        LOGGER.error('Error fetching league', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error && error.message.includes('Access denied')) {
          throw error;
        }
        throw new Error('Failed to fetch league details');
      }
    },
  }),
);

builder.queryField('userLeagues', (t) =>
  t.field({
    type: [League],
    nullable: false,
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to fetch user leagues');
      }

      const userId = context.user.id;

      try {
        const results = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            owner: PublicSchema.leagues.owner,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            currentMatchup: PublicSchema.leagues.currentMatchup,
            draftStatus: PublicSchema.leagues.draftStatus,
            inviteCode: PublicSchema.leagues.inviteCode,
            playerPool: PublicSchema.leagues.playerPool,
            weekAdvanceStatus: PublicSchema.leagues.weekAdvanceStatus,
            waiverType: PublicSchema.leagues.waiverType,
            waiverEnabled: PublicSchema.leagues.waiverEnabled,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
          })
          .from(PublicSchema.leagues)
          .innerJoin(
            PublicSchema.leagueMembers,
            eq(PublicSchema.leagues.id, PublicSchema.leagueMembers.leagueId),
          )
          .where(eq(PublicSchema.leagueMembers.userId, userId))
          .orderBy(PublicSchema.leagues.id);

        return results.map((league) => ({
          id: league.id,
          name: league.name,
          owner: league.owner,
          maxRosterSize: league.maxRosterSize,
          currentMatchup: league.currentMatchup,
          draftStatus: league.draftStatus,
          inviteCode: league.inviteCode,
          playerPool: league.playerPool,
          weekAdvanceStatus: league.weekAdvanceStatus,
          waiverType: league.waiverType,
          waiverEnabled: league.waiverEnabled,
          faabBudgetDefault: league.faabBudgetDefault,
        }));
      } catch (error) {
        LOGGER.error('Failed to fetch user leagues', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to fetch user leagues');
      }
    },
  }),
);

// Query field for league positions
builder.queryField('leaguePositions', (t) =>
  t.field({
    type: [LeaguePosition],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to fetch league positions');
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        // Fetch league positions from the database
        const db = context.db;
        // First verify user has access to this league
        const leagueAccess = await db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (leagueAccess.length === 0) {
          throw new Error('User does not have access to this league');
        }

        // Fetch league positions
        const positions = await db
          .select({
            id: PublicSchema.leaguePosition.id,
            leagueId: PublicSchema.leaguePosition.leagueId,
            positionType: PublicSchema.leaguePosition.positionType,
          })
          .from(PublicSchema.leaguePosition)
          .where(eq(PublicSchema.leaguePosition.leagueId, leagueId))
          .orderBy(PublicSchema.leaguePosition.positionType);

        return positions;
      } catch (error) {
        LOGGER.error('Error fetching league positions', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to fetch league positions');
      }
    },
  }),
);

// Query field for team members
builder.queryField('teamMembers', (t) =>
  t.field({
    type: [TeamMember],
    args: {
      teamId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to fetch team members');
      }

      const { teamId } = args;
      const userId = context.user.id;

      try {
        // Fetch team members from the database
        const db = context.db;
        // First verify user is in the same league as this team (allows read-only access)
        const team = await db
          .select({
            leagueId: PublicSchema.teams.leagueId,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, teamId))
          .limit(1);

        if (team.length === 0) {
          throw new Error('Team not found');
        }

        // Check if user is a member of this league
        const leagueMember = await db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, team[0].leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (leagueMember.length === 0) {
          throw new Error('User does not have access to this team');
        }

        // Fetch team members (read access granted for all league members)
        const members = await db
          .select({
            id: PublicSchema.teamMembers.id,
            teamId: PublicSchema.teamMembers.teamId,
            leagueId: PublicSchema.teamMembers.leagueId,
            playerId: PublicSchema.teamMembers.playerId,
            positionId: PublicSchema.teamMembers.positionId,
          })
          .from(PublicSchema.teamMembers)
          .where(eq(PublicSchema.teamMembers.teamId, teamId))
          .orderBy(PublicSchema.teamMembers.positionId);

        return members;
      } catch (error) {
        LOGGER.error('Error fetching team members', {
          teamId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to fetch team members');
      }
    },
  }),
);

// Query field to get user's team ID for a specific league
builder.queryField('userTeamId', (t) =>
  t.field({
    type: 'Int',
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to fetch user team ID');
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        // Get user's team ID for this league — only match general_manager rows
        // so that users with commissioner/assistant roles on other teams don't
        // get the wrong team highlighted as "YOU" in the standings.
        const membership = await context.db
          .select({
            teamId: PublicSchema.leagueMembers.teamId,
          })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
              eq(PublicSchema.leagueMembers.permissionLevel, 'general_manager'),
            ),
          )
          .limit(1);

        return membership.length > 0 ? membership[0].teamId : null;
      } catch (error) {
        LOGGER.error('Error fetching user team ID', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to fetch user team ID');
      }
    },
  }),
);

// Query field to get all teams in a league for standings
builder.queryField('leagueTeams', (t) =>
  t.field({
    type: [Team],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to fetch league teams');
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        // First verify user has access to this league
        const leagueAccess = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (leagueAccess.length === 0) {
          throw new Error('User does not have access to this league');
        }

        // Fetch all teams in the league
        const teams = await context.db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            divisionId: PublicSchema.teams.divisionId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
            isLocked: PublicSchema.teams.isLocked,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, leagueId))
          .orderBy(PublicSchema.teams.name);

        return teams;
      } catch (error) {
        LOGGER.error('Error fetching league teams', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to fetch league teams');
      }
    },
  }),
);

// ── Invite code validation ─────────────────────────────────────────────────

// Object type returned by validateInviteCode query
const InviteCodeInfo = builder.objectRef<{
  leagueName: string;
  totalSpots: number;
  availableSpots: number;
  isFull: boolean;
}>('InviteCodeInfo');

InviteCodeInfo.implement({
  fields: (t) => ({
    leagueName: t.exposeString('leagueName'),
    totalSpots: t.exposeInt('totalSpots'),
    availableSpots: t.exposeInt('availableSpots'),
    isFull: t.exposeBoolean('isFull'),
  }),
});

// Query to check invite code validity and league capacity before joining
builder.queryField('validateInviteCode', (t) =>
  t.field({
    type: InviteCodeInfo,
    nullable: true,
    args: {
      code: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const code = args.code.trim().toUpperCase();

      // Find league by invite code
      const leagues = await context.db
        .select({
          id: PublicSchema.leagues.id,
          name: PublicSchema.leagues.name,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.inviteCode, code))
        .limit(1);

      if (leagues.length === 0) return null;

      const league = leagues[0];

      // Count total teams in the league
      const totalResult = await context.db
        .select({ total: count() })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, league.id));
      const totalSpots = Number(totalResult[0]?.total ?? 0);

      // Count assigned teams (those with a league_members entry)
      const assignedResult = await context.db
        .select({ assigned: count() })
        .from(PublicSchema.leagueMembers)
        .where(eq(PublicSchema.leagueMembers.leagueId, league.id));
      const assignedSpots = Number(assignedResult[0]?.assigned ?? 0);

      const availableSpots = Math.max(0, totalSpots - assignedSpots);

      return {
        leagueName: league.name,
        totalSpots,
        availableSpots,
        isFull: availableSpots === 0,
      };
    },
  }),
);

// ── League Members for a Team ─────────────────────────────────────────────

/**
 * Query: teamLeagueMembers
 *
 * Returns all league_members rows for a given team (i.e. the GM, any
 * assistant managers, etc.).  Callers must be members of the same league.
 */
builder.queryField('teamLeagueMembers', (t) =>
  t.field({
    type: [LeagueMember],
    args: {
      teamId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { teamId } = args;
      const userId = context.user.id;
      const db = context.db;

      // Resolve leagueId from team
      const teamRows = await db
        .select({ leagueId: PublicSchema.teams.leagueId })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, teamId))
        .limit(1);

      if (teamRows.length === 0) {
        throw new Error('Team not found');
      }

      const leagueId = teamRows[0].leagueId;

      // Verify caller is a member of this league
      const callerCheck = await db
        .select({ userId: PublicSchema.leagueMembers.userId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (callerCheck.length === 0) {
        throw new Error('You are not a member of this league');
      }

      // Return all league_members linked to this specific team
      const members = await db
        .select({
          leagueId: PublicSchema.leagueMembers.leagueId,
          userId: PublicSchema.leagueMembers.userId,
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.teamId, teamId),
          ),
        );

      return members;
    },
  }),
);
