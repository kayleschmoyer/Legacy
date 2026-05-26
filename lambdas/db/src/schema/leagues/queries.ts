/**
 * League domain — Query resolvers
 *
 * Queries: league, userLeagues, leaguePositions, leagueTeams,
 *          userTeamId, validateInviteCode, teamLeagueMembers,
 *          publicLeagues
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, ilike, inArray, ne, sql, SQL } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import {
  League,
  LeagueMember,
  LeaguePosition,
  Team,
  TeamMember,
} from './types';
import { builder } from '../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../graphql-errors';

const VALID_PLAYER_POOLS = ['all', 'nl', 'al', 'nfl', 'afc', 'nfc'] as const;
type ValidPlayerPool = (typeof VALID_PLAYER_POOLS)[number];

function isValidPlayerPool(v: string): v is ValidPlayerPool {
  return (VALID_PLAYER_POOLS as readonly string[]).includes(v);
}

function parseDefensiveFormat(
  v: string | null | undefined,
): 'dst' | 'idp' | null {
  if (v === 'dst' || v === 'idp') return v;
  return null;
}

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
            sport: PublicSchema.leagues.sport,
            defensiveFormat: PublicSchema.leagues.defensiveFormat,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            currentMatchup: PublicSchema.leagues.currentMatchup,
            currentWeek: PublicSchema.leagues.currentWeek,
            draftStatus: PublicSchema.leagues.draftStatus,
            leaguePhase: PublicSchema.leagues.leaguePhase,
            inviteCode: PublicSchema.leagues.inviteCode,
            playerPool: PublicSchema.leagues.playerPool,
            weekAdvanceStatus: PublicSchema.leagues.weekAdvanceStatus,
            waiverType: PublicSchema.leagues.waiverType,
            waiverEnabled: PublicSchema.leagues.waiverEnabled,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
            isPublic: PublicSchema.leagues.isPublic,
            // Matchup settings
            pitcherStartsPerMatchup:
              PublicSchema.leagues.pitcherStartsPerMatchup,
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
            // Era filter settings (LS-887)
            baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
            baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
            // Trade deadline (LS-4099)
            tradeDeadlineWeek: PublicSchema.leagues.tradeDeadlineWeek,
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
        // Admins can access any league regardless of membership or visibility
        if (!userMembership && !league.isPublic && !context.user?.isAdmin) {
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
          sport: league.sport,
          defensiveFormat: parseDefensiveFormat(league.defensiveFormat),
          maxRosterSize: league.maxRosterSize,
          currentMatchup: league.currentMatchup,
          currentWeek: league.currentWeek,
          draftStatus: league.draftStatus,
          leaguePhase: league.leaguePhase,
          inviteCode,
          playerPool: league.playerPool,
          weekAdvanceStatus: league.weekAdvanceStatus,
          waiverType: league.waiverType,
          waiverEnabled: league.waiverEnabled,
          faabBudgetDefault: league.faabBudgetDefault,
          isPublic: league.isPublic,
          // Matchup settings
          pitcherStartsPerMatchup: league.pitcherStartsPerMatchup,
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
          // Era filter settings (LS-887)
          baseballEraFilter: league.baseballEraFilter,
          baseballHofOnly: league.baseballHofOnly,
          customEraStartYear: league.customEraStartYear,
          customEraEndYear: league.customEraEndYear,
          // Trade deadline (LS-4099)
          tradeDeadlineWeek: league.tradeDeadlineWeek,
          userMembership,
        };
      } catch (error) {
        // Re-throw GraphQL errors (e.g. ForbiddenError for non-members accessing private leagues)
        // without logging — these are expected access-control outcomes, not server errors.
        if (error instanceof GraphQLError) {
          throw error;
        }
        LOGGER.error(
          'Error fetching league',
          error instanceof Error ? error : new Error(String(error)),
          { leagueId, userId },
        );
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
            sport: PublicSchema.leagues.sport,
            defensiveFormat: PublicSchema.leagues.defensiveFormat,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            currentMatchup: PublicSchema.leagues.currentMatchup,
            currentWeek: PublicSchema.leagues.currentWeek,
            draftStatus: PublicSchema.leagues.draftStatus,
            leaguePhase: PublicSchema.leagues.leaguePhase,
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
          .where(
            and(
              eq(PublicSchema.leagueMembers.userId, userId),
              eq(PublicSchema.leagues.isMockDraft, false),
            ),
          )
          .orderBy(PublicSchema.leagues.id);

        return results.map((league) => ({
          id: league.id,
          name: league.name,
          owner: league.owner,
          sport: league.sport,
          defensiveFormat: parseDefensiveFormat(league.defensiveFormat),
          maxRosterSize: league.maxRosterSize,
          currentMatchup: league.currentMatchup,
          currentWeek: league.currentWeek,
          draftStatus: league.draftStatus,
          leaguePhase: league.leaguePhase,
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

        if (leagueAccess.length === 0 && !context.user?.isAdmin) {
          throw ForbiddenError('User does not have access to this league');
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
        if (error instanceof GraphQLError) {
          throw error;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Error fetching league positions', err, {
          leagueId,
          userId,
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
            nickname: PublicSchema.teamMembers.nickname,
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

// Query field to get a single team by its ID (supports empty-roster teams, LS-1330)
builder.queryField('teamById', (t) =>
  t.field({
    type: Team,
    nullable: true,
    args: {
      teamId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError('Authentication required to fetch team');
      }

      const { teamId } = args;
      const userId = context.user.id;

      // Fetch the team row (includes leagueId, branding, manager join)
      const rows = await context.db
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
            eq(
              PublicSchema.leagueMembers.leagueId,
              PublicSchema.teams.leagueId,
            ),
          ),
        )
        .where(eq(PublicSchema.teams.id, teamId))
        .orderBy(
          sql`CASE ${PublicSchema.leagueMembers.permissionLevel}
            WHEN 'commissioner' THEN 1
            WHEN 'general_manager' THEN 2
            WHEN 'team_manager' THEN 3
            ELSE 4
          END`,
        )
        .limit(1);

      if (rows.length === 0) {
        return null;
      }

      const team = rows[0];

      // Verify viewer is a member of this league (or is an admin)
      if (!context.user.isAdmin) {
        const leagueMember = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, team.leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (leagueMember.length === 0) {
          throw ForbiddenError(
            'Access denied: You are not a member of this league',
          );
        }
      }

      return team;
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

        if (leagueAccess.length === 0 && !context.user?.isAdmin) {
          throw ForbiddenError('User does not have access to this league');
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
        if (error instanceof GraphQLError) throw error;
        LOGGER.error(
          'Error fetching league teams',
          error instanceof Error ? error : new Error(String(error)),
          { leagueId, userId },
        );
        throw new Error('Failed to fetch league teams');
      }
    },
  }),
);

// ── Invite code validation ─────────────────────────────────────────────────

// Object type returned by validateInviteCode query
const InviteCodeInfo = builder.objectRef<{
  leagueId: number;
  leagueName: string;
  totalSpots: number;
  availableSpots: number;
  isFull: boolean;
  isAlreadyMember: boolean;
}>('InviteCodeInfo');

InviteCodeInfo.implement({
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    leagueName: t.exposeString('leagueName'),
    totalSpots: t.exposeInt('totalSpots'),
    availableSpots: t.exposeInt('availableSpots'),
    isFull: t.exposeBoolean('isFull'),
    isAlreadyMember: t.exposeBoolean('isAlreadyMember'),
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

      // Check if the current user is already a member of this league
      const existingMembership = await context.db
        .select({ userId: PublicSchema.leagueMembers.userId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, league.id),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      const isAlreadyMember = existingMembership.length > 0;

      // Already a member — skip spot-counting queries
      if (isAlreadyMember) {
        return {
          leagueId: league.id,
          leagueName: league.name,
          totalSpots: 0,
          availableSpots: 0,
          isFull: false,
          isAlreadyMember,
        };
      }

      // Count total teams in the league
      const totalResult = await context.db
        .select({ total: count() })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, league.id));
      const totalSpots = Number(totalResult[0]?.total ?? 0);

      // Count assigned teams (those with at least one league_members entry).
      // Use COUNT(DISTINCT team_id) so that teams with multiple members
      // (e.g. GM + assistant manager) are counted only once, and commissioner
      // rows without a team (team_id IS NULL) are excluded.
      const assignedResult = await context.db
        .select({
          assigned: sql<number>`count(distinct ${PublicSchema.leagueMembers.teamId})::int`,
        })
        .from(PublicSchema.leagueMembers)
        .where(eq(PublicSchema.leagueMembers.leagueId, league.id));
      const assignedSpots = Number(assignedResult[0]?.assigned ?? 0);

      const availableSpots = Math.max(0, totalSpots - assignedSpots);

      return {
        leagueId: league.id,
        leagueName: league.name,
        totalSpots,
        availableSpots,
        isFull: availableSpots === 0,
        isAlreadyMember,
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
          if (!isValidPlayerPool(args.playerPool)) {
            throw UserInputError(
              `Invalid playerPool: "${args.playerPool}". Allowed values: ${VALID_PLAYER_POOLS.join(', ')}.`,
            );
          }
          conditions.push(eq(PublicSchema.leagues.playerPool, args.playerPool));
        }

        if (args.search) {
          conditions.push(ilike(PublicSchema.leagues.name, `%${args.search}%`));
        }

        // Pre-aggregate counts to avoid correlated subqueries per league row
        const teamCounts = context.db
          .select({
            leagueId: PublicSchema.teams.leagueId,
            count: sql<number>`count(*)::int`.as('team_count'),
          })
          .from(PublicSchema.teams)
          .groupBy(PublicSchema.teams.leagueId)
          .as('team_counts');

        const memberCounts = context.db
          .select({
            leagueId: PublicSchema.leagueMembers.leagueId,
            count: sql<number>`count(*)::int`.as('member_count'),
          })
          .from(PublicSchema.leagueMembers)
          .groupBy(PublicSchema.leagueMembers.leagueId)
          .as('member_counts');

        const userMembership = context.db
          .select({
            leagueId: PublicSchema.leagueMembers.leagueId,
          })
          .from(PublicSchema.leagueMembers)
          .where(eq(PublicSchema.leagueMembers.userId, userId))
          .as('user_membership');

        const rows = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            owner: PublicSchema.leagues.owner,
            sport: PublicSchema.leagues.sport,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            draftStatus: PublicSchema.leagues.draftStatus,
            playerPool: PublicSchema.leagues.playerPool,
            isPublic: PublicSchema.leagues.isPublic,
            totalSpots: sql<number>`COALESCE(${teamCounts.count}, 0)`,
            claimedSpots: sql<number>`COALESCE(${memberCounts.count}, 0)`,
            isAlreadyMember: sql<boolean>`${userMembership.leagueId} IS NOT NULL`,
          })
          .from(PublicSchema.leagues)
          .leftJoin(
            teamCounts,
            eq(teamCounts.leagueId, PublicSchema.leagues.id),
          )
          .leftJoin(
            memberCounts,
            eq(memberCounts.leagueId, PublicSchema.leagues.id),
          )
          .leftJoin(
            userMembership,
            eq(userMembership.leagueId, PublicSchema.leagues.id),
          )
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
            askingPrice: PublicSchema.teamMembers.askingPrice,
            nickname: PublicSchema.teamMembers.nickname,
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

// ── UserLeagueSummary type ────────────────────────────────────────────────────

type UserLeagueSummaryShape = {
  leagueId: number;
  leagueName: string;
  leaguePhase: string | null;
  seasonNumber: number | null;
  draftStatus: string | null;
  draftScheduledAt: string | null;
  draftMode: string | null;
  selectionMethod: string | null;
  teamCount: number;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  rank: number | null;
  totalTeams: number | null;
  pointsFor: number | null;
  currentWeekNumber: number | null;
  totalMatchups: number | null;
  matchupId: number | null;
  matchupStatus: string | null;
  userScore: number | null;
  opponentScore: number | null;
  opponentTeamName: string | null;
};

const UserLeagueSummary =
  builder.objectRef<UserLeagueSummaryShape>('UserLeagueSummary');

builder.objectType(UserLeagueSummary, {
  description:
    'Dashboard summary combining league phase, draft state, standings, and current matchup for a single league.',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    leagueName: t.exposeString('leagueName'),
    leaguePhase: t.exposeString('leaguePhase', { nullable: true }),
    seasonNumber: t.exposeInt('seasonNumber', { nullable: true }),
    draftStatus: t.exposeString('draftStatus', { nullable: true }),
    draftScheduledAt: t.exposeString('draftScheduledAt', { nullable: true }),
    draftMode: t.exposeString('draftMode', { nullable: true }),
    selectionMethod: t.exposeString('selectionMethod', { nullable: true }),
    teamCount: t.exposeInt('teamCount'),
    wins: t.exposeInt('wins', { nullable: true }),
    losses: t.exposeInt('losses', { nullable: true }),
    ties: t.exposeInt('ties', { nullable: true }),
    rank: t.exposeInt('rank', { nullable: true }),
    totalTeams: t.exposeInt('totalTeams', { nullable: true }),
    pointsFor: t.exposeFloat('pointsFor', { nullable: true }),
    currentWeekNumber: t.exposeInt('currentWeekNumber', { nullable: true }),
    totalMatchups: t.exposeInt('totalMatchups', { nullable: true }),
    matchupId: t.exposeInt('matchupId', { nullable: true }),
    matchupStatus: t.exposeString('matchupStatus', { nullable: true }),
    userScore: t.exposeFloat('userScore', { nullable: true }),
    opponentScore: t.exposeFloat('opponentScore', { nullable: true }),
    opponentTeamName: t.exposeString('opponentTeamName', { nullable: true }),
  }),
});

// ── getUserLeagueSummaries ────────────────────────────────────────────────────

builder.queryField('getUserLeagueSummaries', (t) =>
  t.field({
    type: [UserLeagueSummary],
    nullable: false,
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch league summaries',
        );
      }

      const userId = context.user.id;

      // 1. Fetch all non-offseason leagues the user belongs to
      const leagues = await context.db
        .select({
          id: PublicSchema.leagues.id,
          name: PublicSchema.leagues.name,
          leaguePhase: PublicSchema.leagues.leaguePhase,
          draftStatus: PublicSchema.leagues.draftStatus,
          currentMatchup: PublicSchema.leagues.currentMatchup,
          currentWeek: PublicSchema.leagues.currentWeek,
          totalMatchups: PublicSchema.leagues.totalMatchups,
          seasonNumber: PublicSchema.leagues.seasonNumber,
          userTeamId: PublicSchema.leagueMembers.teamId,
        })
        .from(PublicSchema.leagues)
        .innerJoin(
          PublicSchema.leagueMembers,
          eq(PublicSchema.leagues.id, PublicSchema.leagueMembers.leagueId),
        )
        .where(
          and(
            eq(PublicSchema.leagueMembers.userId, userId),
            ne(PublicSchema.leagues.leaguePhase, 'offseason'),
          ),
        )
        .orderBy(PublicSchema.leagues.id);

      if (leagues.length === 0) return [];

      const leagueIds = leagues.map((l) => l.id);

      // 2. Batch: team counts per league
      const teamCountRows = await context.db
        .select({
          leagueId: PublicSchema.leagueMembers.leagueId,
          cnt: count(),
        })
        .from(PublicSchema.leagueMembers)
        .where(inArray(PublicSchema.leagueMembers.leagueId, leagueIds))
        .groupBy(PublicSchema.leagueMembers.leagueId);

      const teamCountMap = new Map(
        teamCountRows.map((r) => [r.leagueId, Number(r.cnt)]),
      );

      // 3. Batch secondary data: drafts, matchups, and standings
      const { StandingsService } =
        await import('../../services/standings-service');

      const activeLeagueIds = leagues
        .filter((l) => l.leaguePhase === 'active')
        .map((l) => l.id);
      const draftLeagueIds = leagues
        .filter((l) => l.draftStatus !== 'completed')
        .map((l) => l.id);
      const matchupIdsToFetch = leagues.flatMap((l) =>
        l.leaguePhase === 'active' && l.currentMatchup != null
          ? [l.currentMatchup]
          : [],
      );

      const [draftRows, matchupRows, standingsResults] = await Promise.all([
        draftLeagueIds.length > 0
          ? context.db
              .select()
              .from(PublicSchema.drafts)
              .where(inArray(PublicSchema.drafts.leagueId, draftLeagueIds))
          : Promise.resolve([]),
        matchupIdsToFetch.length > 0
          ? context.db
              .select()
              .from(PublicSchema.matchups)
              .where(inArray(PublicSchema.matchups.id, matchupIdsToFetch))
          : Promise.resolve([]),
        Promise.all(
          activeLeagueIds.map(async (leagueId) => ({
            leagueId,
            standings: await StandingsService.getStandings(context.db, {
              leagueId,
            }),
          })),
        ),
      ]);

      const draftMap = new Map(draftRows.map((d) => [d.leagueId, d]));
      const matchupMap = new Map(matchupRows.map((m) => [m.id, m]));
      const standingsMap = new Map(
        standingsResults.map((s) => [s.leagueId, s.standings]),
      );

      // First pass: compute scores and collect all opponent team IDs
      type PartialSummary = {
        league: (typeof leagues)[number];
        userScore: number | null;
        opponentScore: number | null;
        opponentTeamId: number | null;
        matchupId: number | null;
        matchupStatus: string | null;
      };

      const partials: PartialSummary[] = leagues.map((league) => {
        const matchupRow =
          league.currentMatchup != null
            ? (matchupMap.get(league.currentMatchup) ?? null)
            : null;

        let userScore: number | null = null;
        let opponentScore: number | null = null;
        let opponentTeamId: number | null = null;
        let matchupId: number | null = null;
        let matchupStatus: string | null = null;

        if (matchupRow && league.userTeamId != null) {
          matchupId = matchupRow.id;
          matchupStatus = matchupRow.status;
          const isTeam1 = matchupRow.team1Id === league.userTeamId;
          userScore = isTeam1
            ? matchupRow.team1Score != null
              ? parseFloat(matchupRow.team1Score)
              : null
            : matchupRow.team2Score != null
              ? parseFloat(matchupRow.team2Score)
              : null;
          opponentScore = isTeam1
            ? matchupRow.team2Score != null
              ? parseFloat(matchupRow.team2Score)
              : null
            : matchupRow.team1Score != null
              ? parseFloat(matchupRow.team1Score)
              : null;
          opponentTeamId = isTeam1 ? matchupRow.team2Id : matchupRow.team1Id;
        }

        return {
          league,
          userScore,
          opponentScore,
          opponentTeamId,
          matchupId,
          matchupStatus,
        };
      });

      // Batch opponent team name lookup
      const opponentTeamIds = [
        ...new Set(
          partials
            .map((p) => p.opponentTeamId)
            .filter((id): id is number => id != null),
        ),
      ];
      const teamNameRows =
        opponentTeamIds.length > 0
          ? await context.db
              .select({
                id: PublicSchema.teams.id,
                name: PublicSchema.teams.name,
              })
              .from(PublicSchema.teams)
              .where(inArray(PublicSchema.teams.id, opponentTeamIds))
          : [];
      const teamNameMap = new Map(teamNameRows.map((t) => [t.id, t.name]));

      // Final assembly
      return partials.map((partial) => {
        const {
          league,
          userScore,
          opponentScore,
          opponentTeamId,
          matchupId,
          matchupStatus,
        } = partial;
        const draftRow = draftMap.get(league.id) ?? null;
        const standings = standingsMap.get(league.id) ?? null;
        const userStanding =
          standings?.find((s) => s.teamId === league.userTeamId) ?? null;
        const opponentTeamName =
          opponentTeamId != null
            ? (teamNameMap.get(opponentTeamId) ?? null)
            : null;

        return {
          leagueId: league.id,
          leagueName: league.name,
          leaguePhase: league.leaguePhase,
          seasonNumber: league.seasonNumber,
          draftStatus: league.draftStatus,
          draftScheduledAt:
            draftRow?.scheduledAt != null
              ? draftRow.scheduledAt.toISOString()
              : null,
          draftMode: draftRow?.draftMode ?? null,
          selectionMethod: draftRow?.selectionMethod ?? null,
          teamCount: teamCountMap.get(league.id) ?? 0,
          wins: userStanding?.wins ?? null,
          losses: userStanding?.losses ?? null,
          ties: userStanding?.ties ?? null,
          rank: userStanding?.rank ?? null,
          totalTeams: standings?.length ?? null,
          pointsFor: userStanding?.pointsFor ?? null,
          currentWeekNumber: league.currentWeek,
          totalMatchups: league.totalMatchups,
          matchupId,
          matchupStatus,
          userScore,
          opponentScore,
          opponentTeamName,
        } satisfies UserLeagueSummaryShape;
      });
    },
  }),
);

// ── getArchivedUserLeagueSummaries ────────────────────────────────────────────

builder.queryField('getArchivedUserLeagueSummaries', (t) =>
  t.field({
    type: [UserLeagueSummary],
    nullable: false,
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch archived league summaries',
        );
      }

      const userId = context.user.id;

      const leagues = await context.db
        .select({
          id: PublicSchema.leagues.id,
          name: PublicSchema.leagues.name,
          leaguePhase: PublicSchema.leagues.leaguePhase,
          draftStatus: PublicSchema.leagues.draftStatus,
          currentMatchup: PublicSchema.leagues.currentMatchup,
          currentWeek: PublicSchema.leagues.currentWeek,
          totalMatchups: PublicSchema.leagues.totalMatchups,
          seasonNumber: PublicSchema.leagues.seasonNumber,
          userTeamId: PublicSchema.leagueMembers.teamId,
        })
        .from(PublicSchema.leagues)
        .innerJoin(
          PublicSchema.leagueMembers,
          eq(PublicSchema.leagues.id, PublicSchema.leagueMembers.leagueId),
        )
        .where(
          and(
            eq(PublicSchema.leagueMembers.userId, userId),
            eq(PublicSchema.leagues.leaguePhase, 'offseason'),
          ),
        )
        .orderBy(PublicSchema.leagues.id);

      if (leagues.length === 0) return [];

      const leagueIds = leagues.map((l) => l.id);

      const teamCountRows = await context.db
        .select({
          leagueId: PublicSchema.leagueMembers.leagueId,
          cnt: count(),
        })
        .from(PublicSchema.leagueMembers)
        .where(inArray(PublicSchema.leagueMembers.leagueId, leagueIds))
        .groupBy(PublicSchema.leagueMembers.leagueId);

      const teamCountMap = new Map(
        teamCountRows.map((r) => [r.leagueId, Number(r.cnt)]),
      );

      const { StandingsService } =
        await import('../../services/standings-service');

      return Promise.all(
        leagues.map(async (league) => {
          const standings = await StandingsService.getStandings(context.db, {
            leagueId: league.id,
          });
          const userStanding =
            standings.find((s) => s.teamId === league.userTeamId) ?? null;

          return {
            leagueId: league.id,
            leagueName: league.name,
            leaguePhase: league.leaguePhase,
            seasonNumber: league.seasonNumber,
            draftStatus: league.draftStatus,
            draftScheduledAt: null,
            draftMode: null,
            selectionMethod: null,
            teamCount: teamCountMap.get(league.id) ?? 0,
            wins: userStanding?.wins ?? null,
            losses: userStanding?.losses ?? null,
            ties: userStanding?.ties ?? null,
            rank: userStanding?.rank ?? null,
            totalTeams: standings.length,
            pointsFor: userStanding?.pointsFor ?? null,
            currentWeekNumber: league.currentWeek,
            totalMatchups: league.totalMatchups,
            matchupId: null,
            matchupStatus: null,
            userScore: null,
            opponentScore: null,
            opponentTeamName: null,
          } satisfies UserLeagueSummaryShape;
        }),
      );
    },
  }),
);
