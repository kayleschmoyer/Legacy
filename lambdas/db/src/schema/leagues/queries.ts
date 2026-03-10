/**
 * League domain — Query resolvers
 *
 * Queries: league, userLeagues, leaguePositions, leagueTeams,
 *          userTeamId, validateInviteCode, teamLeagueMembers,
 *          publicLeagues
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, ilike, sql, SQL } from 'drizzle-orm';
import {
  League,
  LeagueMember,
  LeaguePosition,
  Team,
  TeamMember,
} from './types';
import { builder } from '../builder';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';

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
        throw AuthenticationError(
          'Authentication required to fetch league details',
        );
      }

      const leagueId = args.id;
      const userId = context.user.id;

      try {
        // Get the league details first (needed to check isPublic for access control)
        const results = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            owner: PublicSchema.leagues.owner,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            currentMatchup: PublicSchema.leagues.currentMatchup,
            currentWeek: PublicSchema.leagues.currentWeek,
            draftStatus: PublicSchema.leagues.draftStatus,
            inviteCode: PublicSchema.leagues.inviteCode,
            playerPool: PublicSchema.leagues.playerPool,
            weekAdvanceStatus: PublicSchema.leagues.weekAdvanceStatus,
            waiverType: PublicSchema.leagues.waiverType,
            waiverEnabled: PublicSchema.leagues.waiverEnabled,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
            isPublic: PublicSchema.leagues.isPublic,
            // Matchup settings
            spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            minCareerGames: PublicSchema.leagues.minCareerGames,
            minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
            totalMatchups: PublicSchema.leagues.totalMatchups,
            playoffEnabled: PublicSchema.leagues.playoffEnabled,
            playoffFormat: PublicSchema.leagues.playoffFormat,
            playoffMultiWeek: PublicSchema.leagues.playoffMultiWeek,
            // Branding
            logoUrl: PublicSchema.leagues.logoUrl,
            bannerUrl: PublicSchema.leagues.bannerUrl,
            primaryColor: PublicSchema.leagues.primaryColor,
            secondaryColor: PublicSchema.leagues.secondaryColor,
            // Season info
            lmNotes: PublicSchema.leagues.lmNotes,
            isMockDraft: PublicSchema.leagues.isMockDraft,
            previousLeagueId: PublicSchema.leagues.previousLeagueId,
            frozenAt: PublicSchema.leagues.frozenAt,
            seasonNumber: PublicSchema.leagues.seasonNumber,
            // Salary cap settings (LS-646)
            salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled,
            salaryCap: PublicSchema.leagues.salaryCap,
            salaryFloor: PublicSchema.leagues.salaryFloor,
            luxuryTaxThreshold: PublicSchema.leagues.luxuryTaxThreshold,
            minSalary: PublicSchema.leagues.minSalary,
            salaryEscalationPct: PublicSchema.leagues.salaryEscalationPct,
            salaryDecayPct: PublicSchema.leagues.salaryDecayPct,
            auctionBudget: PublicSchema.leagues.auctionBudget,
            auctionMinBid: PublicSchema.leagues.auctionMinBid,
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

        // Access control: members always have access; non-members can only view public leagues (spectator mode)
        if (!userMembership && !league.isPublic) {
          throw ForbiddenError(
            'Access denied: You are not a member of this league',
          );
        }

        // Non-members (spectators) do not receive the invite code; use empty string since the field is non-nullable
        const inviteCode = userMembership ? (league.inviteCode ?? '') : '';

        return {
          id: league.id,
          name: league.name,
          owner: league.owner,
          maxRosterSize: league.maxRosterSize,
          currentMatchup: league.currentMatchup,
          currentWeek: league.currentWeek,
          draftStatus: league.draftStatus,
          inviteCode,
          playerPool: league.playerPool,
          weekAdvanceStatus: league.weekAdvanceStatus,
          waiverType: league.waiverType,
          waiverEnabled: league.waiverEnabled,
          faabBudgetDefault: league.faabBudgetDefault,
          isPublic: league.isPublic,
          // Matchup settings
          spStartsPerMatchup: league.spStartsPerMatchup,
          gamesPerMatchup: league.gamesPerMatchup ?? undefined,
          minCareerGames: league.minCareerGames,
          minCareerSeasons: league.minCareerSeasons,
          totalMatchups: league.totalMatchups,
          playoffEnabled: league.playoffEnabled,
          playoffFormat: league.playoffFormat ?? undefined,
          playoffMultiWeek: league.playoffMultiWeek,
          // Branding
          logoUrl: league.logoUrl,
          bannerUrl: league.bannerUrl,
          primaryColor: league.primaryColor,
          secondaryColor: league.secondaryColor,
          // Season info
          lmNotes: league.lmNotes,
          isMockDraft: league.isMockDraft,
          previousLeagueId: league.previousLeagueId,
          frozenAt: league.frozenAt ? league.frozenAt.toISOString() : null,
          seasonNumber: league.seasonNumber,
          // Salary cap settings
          salaryCapEnabled: league.salaryCapEnabled,
          salaryCap: league.salaryCap,
          salaryFloor: league.salaryFloor,
          luxuryTaxThreshold: league.luxuryTaxThreshold,
          minSalary: league.minSalary,
          salaryEscalationPct: league.salaryEscalationPct,
          salaryDecayPct: league.salaryDecayPct,
          auctionBudget: league.auctionBudget,
          auctionMinBid: league.auctionMinBid,
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
        throw AuthenticationError(
          'Authentication required to fetch user leagues',
        );
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
            currentWeek: PublicSchema.leagues.currentWeek,
            draftStatus: PublicSchema.leagues.draftStatus,
            inviteCode: PublicSchema.leagues.inviteCode,
            playerPool: PublicSchema.leagues.playerPool,
            weekAdvanceStatus: PublicSchema.leagues.weekAdvanceStatus,
            waiverType: PublicSchema.leagues.waiverType,
            waiverEnabled: PublicSchema.leagues.waiverEnabled,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
            isPublic: PublicSchema.leagues.isPublic,
            // Salary cap settings (LS-646)
            salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled,
            salaryCap: PublicSchema.leagues.salaryCap,
            salaryFloor: PublicSchema.leagues.salaryFloor,
            luxuryTaxThreshold: PublicSchema.leagues.luxuryTaxThreshold,
            minSalary: PublicSchema.leagues.minSalary,
            salaryEscalationPct: PublicSchema.leagues.salaryEscalationPct,
            salaryDecayPct: PublicSchema.leagues.salaryDecayPct,
            auctionBudget: PublicSchema.leagues.auctionBudget,
            auctionMinBid: PublicSchema.leagues.auctionMinBid,
            // Tier downgrade freeze (LS-846)
            tierFrozenAt: PublicSchema.leagues.tierFrozenAt,
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
          currentWeek: league.currentWeek,
          draftStatus: league.draftStatus,
          inviteCode: league.inviteCode,
          playerPool: league.playerPool,
          weekAdvanceStatus: league.weekAdvanceStatus,
          waiverType: league.waiverType,
          waiverEnabled: league.waiverEnabled,
          faabBudgetDefault: league.faabBudgetDefault,
          isPublic: league.isPublic,
          // Salary cap settings
          salaryCapEnabled: league.salaryCapEnabled,
          salaryCap: league.salaryCap,
          salaryFloor: league.salaryFloor,
          luxuryTaxThreshold: league.luxuryTaxThreshold,
          minSalary: league.minSalary,
          salaryEscalationPct: league.salaryEscalationPct,
          salaryDecayPct: league.salaryDecayPct,
          auctionBudget: league.auctionBudget,
          auctionMinBid: league.auctionMinBid,
          // Tier downgrade freeze (LS-846)
          tierFrozenAt: league.tierFrozenAt?.toISOString() ?? null,
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
        throw AuthenticationError(
          'Authentication required to fetch league positions',
        );
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
        throw AuthenticationError(
          'Authentication required to fetch team members',
        );
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
            onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
            salary: PublicSchema.teamMembers.salary,
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
        throw AuthenticationError(
          'Authentication required to fetch user team ID',
        );
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        // Fetch all of this user's memberships in the league (any role).
        // Multiple rows can exist when a user holds different roles across teams
        // (e.g. GM on one team + commissioner on another). We prioritise by role
        // so the user's own team is always returned: GM > commissioner > assistant.
        const memberships = await context.db
          .select({
            teamId: PublicSchema.leagueMembers.teamId,
            permissionLevel: PublicSchema.leagueMembers.permissionLevel,
          })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          );

        if (memberships.length === 0) return null;

        const rolePriority: Record<string, number> = {
          general_manager: 0,
          commissioner: 1,
          assistant_manager: 2,
        };

        const best = memberships.sort(
          (a, b) =>
            (rolePriority[a.permissionLevel] ?? 99) -
            (rolePriority[b.permissionLevel] ?? 99),
        )[0];

        return best.teamId;
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
        throw AuthenticationError(
          'Authentication required to fetch league teams',
        );
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

        // Fetch all teams in the league with their primary manager userId
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
            logoUrl: PublicSchema.teams.logoUrl,
            primaryColor: PublicSchema.teams.primaryColor,
            secondaryColor: PublicSchema.teams.secondaryColor,
            isLocked: PublicSchema.teams.isLocked,
            avatarUrl: PublicSchema.teams.avatarUrl,
            bannerUrl: PublicSchema.teams.bannerUrl,
            managerId: PublicSchema.leagueMembers.userId,
          })
          .from(PublicSchema.teams)
          .leftJoin(
            PublicSchema.leagueMembers,
            and(
              eq(PublicSchema.leagueMembers.teamId, PublicSchema.teams.id),
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
            ),
          )
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
        throw AuthenticationError();
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
        throw AuthenticationError();
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
        throw ForbiddenError('You are not a member of this league');
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

// ── Public League Discovery ───────────────────────────────────────────────

/**
 * PublicLeagueInfo — extended league info for the discovery browse page.
 * Includes team-slot counts so the UI can show "X of Y spots available".
 */
const PublicLeagueInfo = builder.objectRef<{
  id: number;
  name: string;
  owner: number;
  maxRosterSize: number;
  draftStatus: string;
  playerPool: string;
  isPublic: boolean;
  totalSpots: number;
  availableSpots: number;
  isFull: boolean;
  isAlreadyMember: boolean;
}>('PublicLeagueInfo');

PublicLeagueInfo.implement({
  description: 'A public league available for discovery and joining',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    owner: t.exposeInt('owner'),
    maxRosterSize: t.exposeInt('maxRosterSize'),
    draftStatus: t.exposeString('draftStatus'),
    playerPool: t.exposeString('playerPool'),
    isPublic: t.exposeBoolean('isPublic'),
    totalSpots: t.exposeInt('totalSpots'),
    availableSpots: t.exposeInt('availableSpots'),
    isFull: t.exposeBoolean('isFull'),
    isAlreadyMember: t.exposeBoolean('isAlreadyMember'),
  }),
});

/**
 * Query: publicLeagues
 *
 * Browse open leagues that are visible to all authenticated users.
 * Supports search by name, and filters by draftStatus and playerPool.
 */
builder.queryField('publicLeagues', (t) =>
  t.field({
    type: [PublicLeagueInfo],
    nullable: false,
    args: {
      search: t.arg.string({ required: false }),
      draftStatus: t.arg.string({ required: false }),
      playerPool: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to browse public leagues',
        );
      }

      const userId = context.user.id;
      const limitVal = args.limit ?? 20;
      const offsetVal = args.offset ?? 0;

      try {
        // Build WHERE conditions
        const conditions: SQL[] = [eq(PublicSchema.leagues.isPublic, true)];

        if (args.draftStatus) {
          conditions.push(
            eq(
              PublicSchema.leagues.draftStatus,
              args.draftStatus as
                | 'not-started'
                | 'queued'
                | 'in-progress'
                | 'paused'
                | 'completed',
            ),
          );
        }

        if (args.playerPool) {
          conditions.push(
            eq(
              PublicSchema.leagues.playerPool,
              args.playerPool as 'all' | 'nl' | 'al',
            ),
          );
        }

        if (args.search) {
          conditions.push(ilike(PublicSchema.leagues.name, `%${args.search}%`));
        }

        const rows = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            owner: PublicSchema.leagues.owner,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            draftStatus: PublicSchema.leagues.draftStatus,
            playerPool: PublicSchema.leagues.playerPool,
            isPublic: PublicSchema.leagues.isPublic,
            totalSpots: sql<number>`(
              SELECT COUNT(*)::int FROM teams WHERE teams.league_id = ${PublicSchema.leagues.id}
            )`,
            claimedSpots: sql<number>`(
              SELECT COUNT(*)::int FROM league_members WHERE league_members.league_id = ${PublicSchema.leagues.id}
            )`,
            isAlreadyMember: sql<boolean>`EXISTS (
              SELECT 1 FROM league_members
              WHERE league_members.league_id = ${PublicSchema.leagues.id}
                AND league_members.user_id = ${userId}
            )`,
          })
          .from(PublicSchema.leagues)
          .where(and(...conditions))
          .orderBy(PublicSchema.leagues.id)
          .limit(limitVal)
          .offset(offsetVal);

        return rows.map((row) => {
          const availableSpots = Math.max(0, row.totalSpots - row.claimedSpots);
          return {
            id: row.id,
            name: row.name,
            owner: row.owner,
            maxRosterSize: row.maxRosterSize,
            draftStatus: row.draftStatus,
            playerPool: row.playerPool,
            isPublic: row.isPublic,
            totalSpots: row.totalSpots,
            availableSpots,
            isFull: availableSpots === 0,
            isAlreadyMember: Boolean(row.isAlreadyMember),
          };
        });
      } catch (error) {
        LOGGER.error('Error fetching public leagues', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to fetch public leagues');
      }
    },
  }),
);

// Query to get all players currently on the trade block in a league
builder.queryField('leagueTradeBlock', (t) =>
  t.field({
    type: [TeamMember],
    description:
      'Returns all roster entries explicitly listed on the trade block for the given league.',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId } = args;
      const userId = context.user.id;
      const db = context.db;

      // Verify the user is a member of this league
      const membership = await db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw ForbiddenError('Not a member of this league');
      }

      try {
        const members = await db
          .select({
            id: PublicSchema.teamMembers.id,
            teamId: PublicSchema.teamMembers.teamId,
            leagueId: PublicSchema.teamMembers.leagueId,
            playerId: PublicSchema.teamMembers.playerId,
            positionId: PublicSchema.teamMembers.positionId,
            onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
            salary: PublicSchema.teamMembers.salary,
          })
          .from(PublicSchema.teamMembers)
          .where(
            and(
              eq(PublicSchema.teamMembers.leagueId, leagueId),
              eq(PublicSchema.teamMembers.onTradeBlock, true),
            ),
          )
          .orderBy(PublicSchema.teamMembers.teamId);

        return members;
      } catch (error) {
        LOGGER.error('Error fetching league trade block', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to fetch league trade block');
      }
    },
  }),
);
