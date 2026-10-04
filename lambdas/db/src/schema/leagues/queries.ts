/**
 * League domain — Query resolvers
 *
 * Queries: league, userLeagues, myLeagues, leaguePositions, leagueTeams,
 *          userTeamId, viewerMembership, leagueName, validateInviteCode,
 *          teamLeagueMembers, publicLeagues
 */
import {
  buildEligibilityConditions,
  type GenericDatabase,
  type LeagueEligibilitySettings,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { mapWithConcurrency } from '@legacy-sports/utils';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  sql,
  SQL,
} from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import {
  League,
  LeagueMember,
  LeaguePosition,
  SportKindEnum,
  Team,
  TeamMember,
} from './types';
import { builder } from '../builder';
import { verifyLeagueReadAccess } from '../authorization';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  UserInputError,
} from '../graphql-errors';

// Default/maximum page size for userLeagues cursor pagination (LS-9101).
// 50 matches the pre-existing hard-coded LIMIT (LS-5798) so callers that pass
// no arguments keep receiving exactly the same page they always have.
const DEFAULT_USER_LEAGUES_LIMIT = 50;
const MAX_USER_LEAGUES_LIMIT = 100;

// Cap on concurrent StandingsService.getStandings calls when fanning out
// across a user's leagues. Each call issues several parallel queries of its
// own (see _computeStandings in matchup-history.ts), so unbounded
// Promise.all(leagues.map(...)) for a user in many leagues can request more
// connections than the per-Lambda DB pool (max: 5, see PgDbConnection.ts)
// has available, surfacing as "timeout exceeded when trying to connect"
// (LS-9713).
const STANDINGS_FANOUT_CONCURRENCY = 3;

/**
 * userLeagues paginates via an opaque cursor: a base64-encoded offset into the
 * createdAt DESC, id DESC ordering. Mirrors the careerBattingStats cursor
 * encoding in statistics.ts so pagination conventions stay consistent across
 * resolvers.
 */
function decodeUserLeaguesCursor(cursor: string): number {
  const offset = parseInt(Buffer.from(cursor, 'base64').toString(), 10);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

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
            medianGameEnabled: PublicSchema.leagues.medianGameEnabled,
            // Branding
            logoUrl: PublicSchema.leagues.logoUrl,
            bannerUrl: PublicSchema.leagues.bannerUrl,
            primaryColor: PublicSchema.leagues.primaryColor,
            secondaryColor: PublicSchema.leagues.secondaryColor,
            // Season info
            lmNotes: PublicSchema.leagues.lmNotes,
            isMockDraft: PublicSchema.leagues.isMockDraft,
            // LS-9253: isOfflineDraft (LS-9144) was exposed on the League type
            // and fragment but never selected/returned here — the live draft
            // board's `untimed` detection (queries.league?.isOfflineDraft)
            // silently always read undefined via this query path. Picked up
            // while adding controlAllTeams (which needs the same treatment)
            // since Control All Teams forces isOffline and depends on the
            // untimed UI actually engaging.
            isOfflineDraft: PublicSchema.leagues.isOfflineDraft,
            controlAllTeams: PublicSchema.leagues.controlAllTeams,
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
            allowDraftSlotTrading: PublicSchema.leagues.allowDraftSlotTrading,
            // Era filter settings (LS-887)
            baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
            baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
            // Trade deadline (LS-4099)
            tradeDeadlineWeek: PublicSchema.leagues.tradeDeadlineWeek,
            // Roster continuity (LS-8671)
            rosterContinuity: PublicSchema.leagues.rosterContinuity,
            keeperSettings: PublicSchema.leagues.keeperSettings,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (results.length === 0) {
          return null;
        }

        const league = results[0];

        // Get the user's membership info (including team ID) and the
        // league's draft selectionMethod in parallel — selectionMethod lives
        // on `drafts` (one row per league), not denormalized onto `leagues`
        // like draftStatus is. (LS-9617)
        const [membershipResults, draftResults] = await Promise.all([
          context.db
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
            .limit(1),
          context.db
            .select({ selectionMethod: PublicSchema.drafts.selectionMethod })
            .from(PublicSchema.drafts)
            .where(eq(PublicSchema.drafts.leagueId, leagueId))
            .limit(1),
        ]);

        const userMembership =
          membershipResults.length > 0 ? membershipResults[0] : null;
        const selectionMethod = draftResults[0]?.selectionMethod ?? null;

        // Access control: members always have access; non-members can only view public leagues (spectator mode)
        // Admins can access any league regardless of membership or visibility
        if (!userMembership && !league.isPublic && !context.user?.isAdmin) {
          throw ForbiddenError(
            'Access denied: You are not a member of this league',
          );
        }

        // Non-members (spectators) do not receive the invite code.
        const inviteCode = userMembership ? (league.inviteCode ?? null) : null;

        return {
          id: league.id,
          name: league.name,
          owner: league.owner,
          sport: league.sport,
          defensiveFormat: parseDefensiveFormat(league.defensiveFormat),
          selectionMethod,
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
          medianGameEnabled: league.medianGameEnabled,
          // Branding
          logoUrl: league.logoUrl,
          bannerUrl: league.bannerUrl,
          primaryColor: league.primaryColor,
          secondaryColor: league.secondaryColor,
          // Season info
          lmNotes: league.lmNotes,
          isMockDraft: league.isMockDraft,
          isOfflineDraft: league.isOfflineDraft,
          controlAllTeams: league.controlAllTeams,
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
          allowDraftSlotTrading: league.allowDraftSlotTrading,
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
    args: {
      // Both optional and additive (LS-9101): omitting them preserves the
      // exact pre-pagination behaviour (50 most-recent leagues, no cursor),
      // so every existing caller is unaffected by this change.
      limit: t.arg.int({
        required: false,
        description: `Max leagues to return (default ${DEFAULT_USER_LEAGUES_LIMIT}, capped at ${MAX_USER_LEAGUES_LIMIT}).`,
      }),
      cursor: t.arg.string({
        required: false,
        description:
          'Opaque pagination cursor from a previous page — omit for the first page.',
      }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch user leagues',
        );
      }

      const userId = context.user.id;
      const requestedLimit = args.limit ?? DEFAULT_USER_LEAGUES_LIMIT;
      const limit = Math.max(
        1,
        Math.min(requestedLimit, MAX_USER_LEAGUES_LIMIT),
      );
      const offset = args.cursor ? decodeUserLeaguesCursor(args.cursor) : 0;

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
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            // Era filter settings (LS-6062: needed to duplicate a league's settings)
            baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
            baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
            // Scheduling settings (LS-6062: needed to duplicate a league's settings)
            numberOfDivisions: PublicSchema.leagues.numberOfDivisions,
            schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
            schedulingDivisionalWeightPct:
              PublicSchema.leagues.schedulingDivisionalWeightPct,
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
            allowDraftSlotTrading: PublicSchema.leagues.allowDraftSlotTrading,
            // Tier downgrade freeze (LS-846)
            tierFrozenAt: PublicSchema.leagues.tierFrozenAt,
            // Roster continuity (LS-8671)
            rosterContinuity: PublicSchema.leagues.rosterContinuity,
            keeperSettings: PublicSchema.leagues.keeperSettings,
            // Membership (LS-6062: needed to filter the duplicate-league picker
            // to leagues the current user commissions)
            memberTeamId: PublicSchema.leagueMembers.teamId,
            memberPermissionLevel: PublicSchema.leagueMembers.permissionLevel,
          })
          .from(PublicSchema.leagues)
          .innerJoin(
            PublicSchema.leagueMembers,
            eq(PublicSchema.leagues.id, PublicSchema.leagueMembers.leagueId),
          )
          .where(and(eq(PublicSchema.leagueMembers.userId, userId)))
          .orderBy(
            desc(PublicSchema.leagues.createdAt),
            desc(PublicSchema.leagues.id),
          )
          .limit(limit)
          .offset(offset);

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
          gamesPerMatchup: league.gamesPerMatchup ?? undefined,
          baseballEraFilter: league.baseballEraFilter,
          baseballHofOnly: league.baseballHofOnly,
          customEraStartYear: league.customEraStartYear,
          customEraEndYear: league.customEraEndYear,
          numberOfDivisions: league.numberOfDivisions,
          schedulingStrategy: league.schedulingStrategy,
          schedulingDivisionalWeightPct: league.schedulingDivisionalWeightPct,
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
          allowDraftSlotTrading: league.allowDraftSlotTrading,
          // Tier downgrade freeze (LS-846)
          tierFrozenAt: league.tierFrozenAt?.toISOString() ?? null,
          userMembership: {
            leagueId: league.id,
            userId,
            teamId: league.memberTeamId,
            permissionLevel: league.memberPermissionLevel,
          },
        }));
      } catch (error) {
        LOGGER.error(
          'Failed to fetch user leagues',
          error instanceof Error ? error : new Error(String(error)),
          { userId },
        );
        throw new Error('Failed to fetch user leagues');
      }
    },
  }),
);

// Query field for the authoritative total count of a user's non-mock leagues
// across every sport (LS-9101). userLeagues is now paginated (default page
// size 50), so `userLeagues.length` can no longer be trusted as the free-tier
// league-cap gate's input for users at/above the page size — this field
// exists specifically so FootballHubPage/FootballHomeScreen/BaseballScreen/
// BaseballHomeScreen and any other cap-check site can read the true total
// independent of how large a page they requested.
builder.queryField('userLeagueCount', (t) =>
  t.field({
    type: 'Int',
    nullable: false,
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch user league count',
        );
      }

      const userId = context.user.id;

      try {
        const result = await context.db
          .select({ total: count() })
          .from(PublicSchema.leagues)
          .innerJoin(
            PublicSchema.leagueMembers,
            eq(PublicSchema.leagues.id, PublicSchema.leagueMembers.leagueId),
          )
          .where(and(eq(PublicSchema.leagueMembers.userId, userId)));

        return Number(result[0]?.total ?? 0);
      } catch (error) {
        LOGGER.error(
          'Failed to fetch user league count',
          error instanceof Error ? error : new Error(String(error)),
          { userId },
        );
        throw new Error('Failed to fetch user league count');
      }
    },
  }),
);

// myLeagues — sport-filtered variant of userLeagues for multi-sport hubs.
// LS-255 AC12: myLeagues(sport: FOOTBALL) returns only football leagues;
// myLeagues() returns all sports.
builder.queryField('myLeagues', (t) =>
  t.field({
    type: [League],
    nullable: false,
    args: {
      sport: t.arg({ type: SportKindEnum, required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch user leagues',
        );
      }

      const userId = context.user.id;
      const sportFilter = args.sport ?? null;

      try {
        const conditions: SQL[] = [
          eq(PublicSchema.leagueMembers.userId, userId),
        ];
        if (sportFilter != null) {
          conditions.push(eq(PublicSchema.leagues.sport, sportFilter));
        }

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
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            tierFrozenAt: PublicSchema.leagues.tierFrozenAt,
          })
          .from(PublicSchema.leagues)
          .innerJoin(
            PublicSchema.leagueMembers,
            eq(PublicSchema.leagues.id, PublicSchema.leagueMembers.leagueId),
          )
          .where(and(...conditions))
          .orderBy(PublicSchema.leagues.id)
          .limit(50);

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
          gamesPerMatchup: league.gamesPerMatchup ?? undefined,
          tierFrozenAt: league.tierFrozenAt?.toISOString() ?? null,
        }));
      } catch (error) {
        LOGGER.error(
          'Failed to fetch my leagues',
          error instanceof Error ? error : new Error(String(error)),
          { userId, sport: sportFilter },
        );
        throw new Error('Failed to fetch my leagues');
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
        // Members, spectators of public leagues, and admins may read (LS-8939)
        await verifyLeagueReadAccess(
          db,
          leagueId,
          userId,
          context.user.isAdmin,
        );

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
        throw NotFoundError('Team not found');
      }

      // Members, spectators of public leagues, and admins may read (LS-8939)
      await verifyLeagueReadAccess(
        db,
        team[0].leagueId,
        userId,
        context.user.isAdmin,
      );

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

const LEAGUE_ROLE_PRIORITY: Record<string, number> = {
  general_manager: 0,
  commissioner: 1,
  assistant_manager: 2,
};

/**
 * Fetch all of this user's memberships in a league (any role) and return the
 * highest-priority one. Multiple rows can exist when a user holds different
 * roles across teams (e.g. GM on one team + commissioner on another); we
 * prioritise by role so the user's own team/role is always returned:
 * GM > commissioner > assistant. Shared by userTeamId and userPermissionLevel
 * so the two stay in lockstep — same DB round trip, same role tie-breaking.
 */
export async function getBestLeagueMembership(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
  userId: number,
): Promise<{ teamId: number | null; permissionLevel: string } | null> {
  const memberships = await db
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

  return memberships.sort(
    (a, b) =>
      (LEAGUE_ROLE_PRIORITY[a.permissionLevel] ?? 99) -
      (LEAGUE_ROLE_PRIORITY[b.permissionLevel] ?? 99),
  )[0];
}

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
        const best = await getBestLeagueMembership(
          context.db,
          leagueId,
          userId,
        );
        return best?.teamId ?? null;
      } catch (error) {
        LOGGER.error(
          'Error fetching user team ID',
          error instanceof Error ? error : new Error(String(error)),
          { leagueId, userId },
        );
        throw new Error('Failed to fetch user team ID');
      }
    },
  }),
);

// Query field to get the viewer's own membership row (teamId +
// permissionLevel) for a league, without the full League object (LS-6036 —
// avoids the ~40-field League over-fetch when a caller only needs to check
// the viewer's role/team for a specific league).
//
// Deliberately NOT role-priority-sorted like userTeamId/getBestLeagueMembership:
// this must return the SAME row `league`'s `userMembership` field resolves
// (BTD-028/LS-6051) so a viewer who is e.g. general_manager of a different
// team but assistant_manager of the team being viewed resolves consistently
// with the rest of the page, rather than always preferring their
// highest-priority role across every team they belong to.
builder.queryField('viewerMembership', (t) =>
  t.field({
    type: LeagueMember,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch league membership',
        );
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        const rows = await context.db
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

        return rows[0] ?? null;
      } catch (error) {
        LOGGER.error(
          'Error fetching viewer league membership',
          error instanceof Error ? error : new Error(String(error)),
          { leagueId, userId },
        );
        throw new Error('Failed to fetch viewer league membership');
      }
    },
  }),
);

// Query field to get just a league's display name, without the full league
// object (LS-6036/LS-6052 — a display-only "Part of <league>" link needs the
// name, not the ~40-field League fetch).
builder.queryField('leagueName', (t) =>
  t.field({
    type: 'String',
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch league name',
        );
      }

      const { leagueId } = args;

      try {
        const rows = await context.db
          .select({ name: PublicSchema.leagues.name })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        return rows[0]?.name ?? null;
      } catch (error) {
        LOGGER.error(
          'Error fetching league name',
          error instanceof Error ? error : new Error(String(error)),
          { leagueId },
        );
        throw new Error('Failed to fetch league name');
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
            WHEN 'assistant_manager' THEN 3
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
        // Members, spectators of public leagues, and admins may read (LS-8939)
        await verifyLeagueReadAccess(
          context.db,
          leagueId,
          userId,
          context.user.isAdmin,
        );

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
        throw NotFoundError('Team not found');
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
  sport: 'baseball' | 'football';
  maxRosterSize: number;
  draftStatus: string;
  playerPool: string;
  isPublic: boolean;
  totalSpots: number;
  numberOfTeams: number;
  availableSpots: number;
  isFull: boolean;
  isAlreadyMember: boolean;
  eraFilter: string;
  selectionMethod: string | null;
  draftOrder: string | null;
  draftDate: string | null;
}>('PublicLeagueInfo');

PublicLeagueInfo.implement({
  description: 'A public league available for discovery and joining',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    owner: t.exposeInt('owner'),
    sport: t.field({
      type: SportKindEnum,
      description: 'Sport for this league (baseball or football). (LS-6290)',
      resolve: (parent) => parent.sport,
    }),
    maxRosterSize: t.exposeInt('maxRosterSize'),
    draftStatus: t.exposeString('draftStatus'),
    playerPool: t.exposeString('playerPool'),
    isPublic: t.exposeBoolean('isPublic'),
    totalSpots: t.exposeInt('totalSpots'),
    numberOfTeams: t.exposeInt('numberOfTeams', {
      description:
        'Number of teams in the league (LS-8812). Same underlying team count as `totalSpots`, which names it from the spot-meter denominator perspective; this field is the league-settings reading used by the browse row meta line.',
    }),
    availableSpots: t.exposeInt('availableSpots'),
    isFull: t.exposeBoolean('isFull'),
    isAlreadyMember: t.exposeBoolean('isAlreadyMember'),
    eraFilter: t.exposeString('eraFilter', {
      description:
        'Era restriction on the player pool, e.g. "golden_age" (LS-8812).',
    }),
    selectionMethod: t.exposeString('selectionMethod', {
      nullable: true,
      description:
        'Draft selection method — "standard" | "auction" | "random". Null when the league has no draft row yet (LS-8812).',
    }),
    draftOrder: t.exposeString('draftOrder', {
      nullable: true,
      description:
        'Draft order — "snake" | "linear". Null when the league has no draft row yet (LS-8812).',
    }),
    draftDate: t.exposeString('draftDate', {
      nullable: true,
      description:
        'Scheduled draft date as an ISO-8601 string, preferring the commissioner-set `scheduled_at` over the calendar `date`. Null when unscheduled (LS-8812).',
    }),
  }),
});

/** Sort orders accepted by `publicLeagues` (LS-8812). */
const PUBLIC_LEAGUE_SORTS = ['spotsLeft', 'draftDate', 'createdAt'] as const;
type PublicLeagueSort = (typeof PUBLIC_LEAGUE_SORTS)[number];

function isValidPublicLeagueSort(value: string): value is PublicLeagueSort {
  return (PUBLIC_LEAGUE_SORTS as readonly string[]).includes(value);
}

/**
 * Era-filter values accepted by `publicLeagues` (LS-8812). Mirrors the
 * `era_filter` pg enum; validated rather than cast so an unknown value returns
 * BAD_USER_INPUT instead of failing deep in the query builder.
 */
const VALID_ERA_FILTERS = [
  // Baseball
  'all',
  'dead_ball',
  'golden_age',
  'expansion',
  'free_agency',
  'steroid_era',
  'modern',
  'custom',
  // Football
  'pioneer',
  'single_platoon',
  'super_bowl_era',
  'west_coast',
  'salary_cap_era',
  'spread_offense',
] as const;
type ValidEraFilter = (typeof VALID_ERA_FILTERS)[number];

function isValidEraFilter(value: string): value is ValidEraFilter {
  return (VALID_ERA_FILTERS as readonly string[]).includes(value);
}

const VALID_DRAFT_STATUSES = [
  'not-started',
  'queued',
  'in-progress',
  'paused',
  'completed',
] as const;
type ValidDraftStatus = (typeof VALID_DRAFT_STATUSES)[number];

function isValidDraftStatus(value: string): value is ValidDraftStatus {
  return (VALID_DRAFT_STATUSES as readonly string[]).includes(value);
}

/**
 * Filter arguments shared by `publicLeagues` and `publicLeaguesCount` so the
 * list and its total can never disagree about what "matching" means (LS-8812).
 */
interface PublicLeagueFilterArgs {
  search?: string | null;
  draftStatus?: string | null;
  playerPool?: string | null;
  sport?: string | null;
  eraFilter?: string | null;
  minRosterSize?: number | null;
  maxRosterSize?: number | null;
}

/**
 * Build the column-level WHERE conditions for a public-league browse query.
 *
 * Spot-availability (`hasOpenSpots`) is deliberately NOT handled here — it is
 * derived from the joined team/member count subqueries, so each caller appends
 * it after building those aliases.
 */
function buildPublicLeagueConditions(args: PublicLeagueFilterArgs): SQL[] {
  const conditions: SQL[] = [eq(PublicSchema.leagues.isPublic, true)];

  if (args.draftStatus) {
    if (!isValidDraftStatus(args.draftStatus)) {
      throw UserInputError(
        `Invalid draftStatus: "${args.draftStatus}". Allowed values: ${VALID_DRAFT_STATUSES.join(', ')}.`,
      );
    }
    conditions.push(eq(PublicSchema.leagues.draftStatus, args.draftStatus));
  }

  if (args.playerPool) {
    if (!isValidPlayerPool(args.playerPool)) {
      throw UserInputError(
        `Invalid playerPool: "${args.playerPool}". Allowed values: ${VALID_PLAYER_POOLS.join(', ')}.`,
      );
    }
    conditions.push(eq(PublicSchema.leagues.playerPool, args.playerPool));
  }

  if (args.sport) {
    if (args.sport !== 'baseball' && args.sport !== 'football') {
      throw UserInputError(
        `Invalid sport: "${args.sport}". Allowed values: baseball, football.`,
      );
    }
    conditions.push(eq(PublicSchema.leagues.sport, args.sport));
  }

  if (args.eraFilter) {
    if (!isValidEraFilter(args.eraFilter)) {
      throw UserInputError(
        `Invalid eraFilter: "${args.eraFilter}". Allowed values: ${VALID_ERA_FILTERS.join(', ')}.`,
      );
    }
    conditions.push(eq(PublicSchema.leagues.baseballEraFilter, args.eraFilter));
  }

  if (args.minRosterSize != null) {
    conditions.push(
      sql`${PublicSchema.leagues.maxRosterSize} >= ${args.minRosterSize}`,
    );
  }

  if (args.maxRosterSize != null) {
    conditions.push(
      sql`${PublicSchema.leagues.maxRosterSize} <= ${args.maxRosterSize}`,
    );
  }

  if (args.search) {
    conditions.push(ilike(PublicSchema.leagues.name, `%${args.search}%`));
  }

  return conditions;
}

/**
 * Query: publicLeagues
 *
 * Browse open leagues that are visible to all authenticated users.
 * Supports search by name, and filters by sport, draftStatus, playerPool,
 * era, roster-size range and spot availability, ordered by `sortBy`
 * (LS-8812 — previously hard-ordered by league id).
 */
builder.queryField('publicLeagues', (t) =>
  t.field({
    type: [PublicLeagueInfo],
    nullable: false,
    args: {
      sport: t.arg({ type: SportKindEnum, required: false }),
      search: t.arg.string({ required: false }),
      draftStatus: t.arg.string({ required: false }),
      playerPool: t.arg.string({ required: false }),
      eraFilter: t.arg.string({ required: false }),
      hasOpenSpots: t.arg.boolean({ required: false }),
      minRosterSize: t.arg.int({ required: false }),
      maxRosterSize: t.arg.int({ required: false }),
      sortBy: t.arg.string({
        required: false,
        description: `Sort order — one of ${PUBLIC_LEAGUE_SORTS.join(' | ')}. Defaults to spotsLeft.`,
      }),
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
      const sortBy = args.sortBy ?? 'spotsLeft';
      if (!isValidPublicLeagueSort(sortBy)) {
        throw UserInputError(
          `Invalid sortBy: "${sortBy}". Allowed values: ${PUBLIC_LEAGUE_SORTS.join(', ')}.`,
        );
      }

      try {
        const conditions = buildPublicLeagueConditions(args);

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

        // One draft row per league — DISTINCT ON keeps the newest so a league
        // that somehow carries more than one draft cannot fan the result out
        // into duplicate browse rows.
        const latestDrafts = context.db
          .selectDistinctOn([PublicSchema.drafts.leagueId], {
            leagueId: PublicSchema.drafts.leagueId,
            selectionMethod: PublicSchema.drafts.selectionMethod,
            draftOrder: PublicSchema.drafts.draftOrder,
            scheduledAt: PublicSchema.drafts.scheduledAt,
            date: PublicSchema.drafts.date,
          })
          .from(PublicSchema.drafts)
          .orderBy(
            PublicSchema.drafts.leagueId,
            desc(PublicSchema.drafts.createdAt),
          )
          .as('latest_drafts');

        const availableSpotsSql = sql<number>`GREATEST(COALESCE(${teamCounts.count}, 0) - COALESCE(${memberCounts.count}, 0), 0)`;
        // `scheduled_at` is a timestamptz, which the pg driver hydrates into a
        // Date; `date` comes back as a string. The GraphQL field is an ISO
        // string, so the mapping below normalizes both.
        const draftDateSql = sql<
          Date | string | null
        >`COALESCE(${latestDrafts.scheduledAt}, ${latestDrafts.date}::timestamptz)`;

        if (args.hasOpenSpots) {
          conditions.push(sql`${availableSpotsSql} > 0`);
        }

        const orderBy = {
          // Most joinable first — the browse default.
          spotsLeft: desc(availableSpotsSql),
          // Soonest scheduled draft first; unscheduled leagues sink.
          draftDate: sql`${draftDateSql} ASC NULLS LAST`,
          // The UI labels this "Newest".
          createdAt: desc(PublicSchema.leagues.createdAt),
        }[sortBy];

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
            eraFilter: PublicSchema.leagues.baseballEraFilter,
            totalSpots: sql<number>`COALESCE(${teamCounts.count}, 0)`,
            claimedSpots: sql<number>`COALESCE(${memberCounts.count}, 0)`,
            isAlreadyMember: sql<boolean>`${userMembership.leagueId} IS NOT NULL`,
            selectionMethod: latestDrafts.selectionMethod,
            draftOrder: latestDrafts.draftOrder,
            draftDate: draftDateSql,
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
          .leftJoin(
            latestDrafts,
            eq(latestDrafts.leagueId, PublicSchema.leagues.id),
          )
          .where(and(...conditions))
          // Tie-break on id so paging stays stable across equal sort keys.
          .orderBy(orderBy, PublicSchema.leagues.id)
          .limit(limitVal)
          .offset(offsetVal);

        return rows.map((row) => {
          const availableSpots = Math.max(0, row.totalSpots - row.claimedSpots);
          return {
            id: row.id,
            name: row.name,
            owner: row.owner,
            sport: row.sport,
            maxRosterSize: row.maxRosterSize,
            draftStatus: row.draftStatus,
            playerPool: row.playerPool,
            isPublic: row.isPublic,
            totalSpots: row.totalSpots,
            numberOfTeams: row.totalSpots,
            availableSpots,
            isFull: availableSpots === 0,
            isAlreadyMember: Boolean(row.isAlreadyMember),
            eraFilter: row.eraFilter,
            selectionMethod: row.selectionMethod ?? null,
            draftOrder: row.draftOrder ?? null,
            draftDate:
              row.draftDate instanceof Date
                ? row.draftDate.toISOString()
                : (row.draftDate ?? null),
          };
        });
      } catch (error) {
        // Input validation (`buildPublicLeagueConditions`) runs inside this
        // try, so rejected args arrive here as GraphQLErrors. Re-throw them
        // untouched — collapsing them into a generic Error would report a
        // client's bad `sport`/`playerPool` as INTERNAL_SERVER_ERROR.
        if (error instanceof GraphQLError) throw error;
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Error fetching public leagues', err, { userId });
        throw new Error('Failed to fetch public leagues');
      }
    },
  }),
);

/**
 * Query: publicLeaguesCount
 *
 * Total number of public leagues matching the same filters `publicLeagues`
 * accepts, ignoring limit/offset — the browse header's "{n} LEAGUES" count
 * (LS-8812).
 *
 * Kept as a sibling query rather than folding a `totalCount` into
 * `publicLeagues` so the existing `[PublicLeagueInfo!]!` return type — and
 * every caller of it — stays unchanged.
 */
builder.queryField('publicLeaguesCount', (t) =>
  t.int({
    description:
      'Total public leagues matching the given filters, ignoring pagination.',
    nullable: false,
    args: {
      search: t.arg.string({ required: false }),
      draftStatus: t.arg.string({ required: false }),
      playerPool: t.arg.string({ required: false }),
      sport: t.arg.string({ required: false }),
      eraFilter: t.arg.string({ required: false }),
      hasOpenSpots: t.arg.boolean({ required: false }),
      minRosterSize: t.arg.int({ required: false }),
      maxRosterSize: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to browse public leagues',
        );
      }

      try {
        const conditions = buildPublicLeagueConditions(args);

        if (args.hasOpenSpots) {
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

          conditions.push(
            sql`GREATEST(COALESCE(${teamCounts.count}, 0) - COALESCE(${memberCounts.count}, 0), 0) > 0`,
          );

          const [openRow] = await context.db
            .select({ total: count() })
            .from(PublicSchema.leagues)
            .leftJoin(
              teamCounts,
              eq(teamCounts.leagueId, PublicSchema.leagues.id),
            )
            .leftJoin(
              memberCounts,
              eq(memberCounts.leagueId, PublicSchema.leagues.id),
            )
            .where(and(...conditions));

          return openRow?.total ?? 0;
        }

        const [row] = await context.db
          .select({ total: count() })
          .from(PublicSchema.leagues)
          .where(and(...conditions));

        return row?.total ?? 0;
      } catch (error) {
        // See the matching note in `publicLeagues` — rejected args must keep
        // their BAD_USER_INPUT code rather than being masked as a 500.
        if (error instanceof GraphQLError) throw error;
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Error counting public leagues', err, {
          userId: context.user.id,
        });
        throw new Error('Failed to count public leagues');
      }
    },
  }),
);

/**
 * Query: previewEligiblePlayerCount
 *
 * Pre-creation preview of how many players would be eligible under a
 * candidate league configuration — no league or draft needs to exist yet.
 * Reuses the same `buildEligibilityConditions` predicate builder that
 * `getAvailableDraftPlayers` (the live draft board) and the pick mutations
 * apply post-creation, so the preview count can never disagree with what
 * draft day actually shows (LS-6089).
 */
builder.queryField('previewEligiblePlayerCount', (t) =>
  t.int({
    description:
      'Preview how many players would be eligible under a candidate league configuration, before the league is created.',
    nullable: false,
    args: {
      sport: t.arg.string({ required: true }),
      playerPool: t.arg.string({ required: false }),
      baseballHofOnly: t.arg.boolean({ required: false }),
      baseballEraFilter: t.arg.string({ required: false }),
      customEraStartYear: t.arg.int({ required: false }),
      customEraEndYear: t.arg.int({ required: false }),
      minCareerGames: t.arg.int({ required: false }),
      minCareerSeasons: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to preview eligible player count',
        );
      }

      if (args.sport !== 'baseball' && args.sport !== 'football') {
        throw UserInputError(
          `Invalid sport: "${args.sport}". Allowed values: baseball, football.`,
        );
      }

      let playerPool: LeagueEligibilitySettings['playerPool'] = 'all';
      if (args.playerPool) {
        if (!isValidPlayerPool(args.playerPool)) {
          throw UserInputError(
            `Invalid playerPool: "${args.playerPool}". Allowed values: ${VALID_PLAYER_POOLS.join(', ')}.`,
          );
        }
        playerPool = args.playerPool;
      }

      const eligibilityConditions = buildEligibilityConditions({
        sport: args.sport,
        playerPool,
        minCareerGames: args.minCareerGames ?? 50,
        minCareerSeasons: args.minCareerSeasons ?? 3,
        baseballHofOnly: args.baseballHofOnly ?? false,
        baseballEraFilter: args.baseballEraFilter ?? undefined,
        customEraStartYear: args.customEraStartYear ?? null,
        customEraEndYear: args.customEraEndYear ?? null,
      });

      const whereClause =
        eligibilityConditions.length > 0
          ? sql`WHERE ${sql.join(
              eligibilityConditions.map((c) => c.condition),
              sql` AND `,
            )}`
          : sql``;

      const result = await context.db.execute(
        sql`SELECT COUNT(*)::int AS count FROM public.players p ${whereClause}`,
      );
      return Number(result.rows[0]?.count ?? 0);
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

/**
 * Derives the dashboard `isCommissioner` flag from a league_members
 * permission level. Only the explicit 'commissioner' role qualifies — GMs and
 * assistant managers do not, and a missing/unknown level is treated as false.
 */
export function deriveIsCommissioner(
  permissionLevel: string | null | undefined,
): boolean {
  return permissionLevel === 'commissioner';
}

type UserLeagueSummaryShape = {
  leagueId: number;
  leagueName: string;
  sport: string | null;
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
  currentWeekNumber: number | null;
  totalMatchups: number | null;
  matchupId: number | null;
  matchupStatus: string | null;
  matchupEndTime: string | null;
  userScore: number | null;
  opponentScore: number | null;
  opponentTeamName: string | null;
  eraFilter: string | null;
  customEraStartYear: number | null;
  customEraEndYear: number | null;
  isCommissioner: boolean;
};

const UserLeagueSummary =
  builder.objectRef<UserLeagueSummaryShape>('UserLeagueSummary');

builder.objectType(UserLeagueSummary, {
  description:
    'Dashboard summary combining league phase, draft state, and current matchup for a single league. The standings fields (wins/losses/ties/rank/totalTeams) are only populated by `getArchivedUserLeagueSummaries`; `getUserLeagueSummaries` leaves them null and they are served separately by `getUserLeagueStandings` (LS-9528).',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    leagueName: t.exposeString('leagueName'),
    sport: t.exposeString('sport', { nullable: true }),
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
    currentWeekNumber: t.exposeInt('currentWeekNumber', { nullable: true }),
    totalMatchups: t.exposeInt('totalMatchups', { nullable: true }),
    matchupId: t.exposeInt('matchupId', { nullable: true }),
    matchupStatus: t.exposeString('matchupStatus', { nullable: true }),
    matchupEndTime: t.exposeString('matchupEndTime', { nullable: true }),
    userScore: t.exposeFloat('userScore', { nullable: true }),
    opponentScore: t.exposeFloat('opponentScore', { nullable: true }),
    opponentTeamName: t.exposeString('opponentTeamName', { nullable: true }),
    eraFilter: t.exposeString('eraFilter', { nullable: true }),
    customEraStartYear: t.exposeInt('customEraStartYear', { nullable: true }),
    customEraEndYear: t.exposeInt('customEraEndYear', { nullable: true }),
    isCommissioner: t.exposeBoolean('isCommissioner'),
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
          sport: PublicSchema.leagues.sport,
          leaguePhase: PublicSchema.leagues.leaguePhase,
          draftStatus: PublicSchema.leagues.draftStatus,
          currentMatchup: PublicSchema.leagues.currentMatchup,
          currentWeek: PublicSchema.leagues.currentWeek,
          totalMatchups: PublicSchema.leagues.totalMatchups,
          seasonNumber: PublicSchema.leagues.seasonNumber,
          baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
          customEraStartYear: PublicSchema.leagues.customEraStartYear,
          customEraEndYear: PublicSchema.leagues.customEraEndYear,
          userTeamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
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

      // 3. Batch secondary data: drafts and matchups.
      //
      // Standings are deliberately NOT computed here (LS-9528). The
      // StandingsService fan-out dominated this resolver's latency — it recomputes
      // every league's full standings table — while the reads below finish in tens
      // of milliseconds. Blocking the whole dashboard on it left the home page on
      // skeleton placeholders. Clients now fetch `getUserLeagueStandings` in
      // parallel and merge on `leagueId`.
      const draftLeagueIds = leagues
        .filter((l) => l.draftStatus !== 'completed')
        .map((l) => l.id);
      const matchupIdsToFetch = leagues.flatMap((l) =>
        l.leaguePhase === 'active' && l.currentMatchup != null
          ? [l.currentMatchup]
          : [],
      );

      const [draftRows, matchupRows] = await Promise.all([
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
      ]);

      const draftMap = new Map(draftRows.map((d) => [d.leagueId, d]));
      const matchupMap = new Map(matchupRows.map((m) => [m.id, m]));

      // First pass: compute scores and collect all opponent team IDs
      type PartialSummary = {
        league: (typeof leagues)[number];
        userScore: number | null;
        opponentScore: number | null;
        opponentTeamId: number | null;
        matchupId: number | null;
        matchupStatus: string | null;
        matchupEndTime: string | null;
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
        let matchupEndTime: string | null = null;

        if (matchupRow && league.userTeamId != null) {
          matchupId = matchupRow.id;
          matchupStatus = matchupRow.status;
          matchupEndTime = matchupRow.endTime ?? null;
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
          matchupEndTime,
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
          matchupEndTime,
        } = partial;
        const draftRow = draftMap.get(league.id) ?? null;
        const opponentTeamName =
          opponentTeamId != null
            ? (teamNameMap.get(opponentTeamId) ?? null)
            : null;

        return {
          leagueId: league.id,
          leagueName: league.name,
          sport: league.sport,
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
          // Served by `getUserLeagueStandings` instead — see the note above (LS-9528).
          wins: null,
          losses: null,
          ties: null,
          rank: null,
          totalTeams: null,
          currentWeekNumber: league.currentWeek,
          totalMatchups: league.totalMatchups,
          matchupId,
          matchupStatus,
          matchupEndTime,
          userScore,
          opponentScore,
          opponentTeamName,
          eraFilter: league.baseballEraFilter,
          customEraStartYear: league.customEraStartYear,
          customEraEndYear: league.customEraEndYear,
          isCommissioner: deriveIsCommissioner(league.permissionLevel),
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
          sport: PublicSchema.leagues.sport,
          leaguePhase: PublicSchema.leagues.leaguePhase,
          draftStatus: PublicSchema.leagues.draftStatus,
          currentMatchup: PublicSchema.leagues.currentMatchup,
          currentWeek: PublicSchema.leagues.currentWeek,
          totalMatchups: PublicSchema.leagues.totalMatchups,
          seasonNumber: PublicSchema.leagues.seasonNumber,
          baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
          customEraStartYear: PublicSchema.leagues.customEraStartYear,
          customEraEndYear: PublicSchema.leagues.customEraEndYear,
          userTeamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
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

      return mapWithConcurrency(
        leagues,
        STANDINGS_FANOUT_CONCURRENCY,
        async (league) => {
          const standings = await StandingsService.getStandings(context.db, {
            leagueId: league.id,
          });
          const userStanding =
            standings.find((s) => s.teamId === league.userTeamId) ?? null;

          return {
            leagueId: league.id,
            leagueName: league.name,
            sport: league.sport,
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
            currentWeekNumber: league.currentWeek,
            totalMatchups: league.totalMatchups,
            matchupId: null,
            matchupStatus: null,
            matchupEndTime: null,
            userScore: null,
            opponentScore: null,
            opponentTeamName: null,
            eraFilter: league.baseballEraFilter,
            customEraStartYear: league.customEraStartYear,
            customEraEndYear: league.customEraEndYear,
            isCommissioner: deriveIsCommissioner(league.permissionLevel),
          } satisfies UserLeagueSummaryShape;
        },
      );
    },
  }),
);

// ── getUserLeagueStandings ────────────────────────────────────────────────────

type UserLeagueStandingsShape = {
  leagueId: number;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  rank: number | null;
  totalTeams: number | null;
};

const UserLeagueStandings = builder.objectRef<UserLeagueStandingsShape>(
  'UserLeagueStandings',
);

builder.objectType(UserLeagueStandings, {
  description:
    "The caller's standings line in a single league, keyed by `leagueId` so clients can merge it into a `UserLeagueSummary`.",
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    wins: t.exposeInt('wins', { nullable: true }),
    losses: t.exposeInt('losses', { nullable: true }),
    ties: t.exposeInt('ties', { nullable: true }),
    rank: t.exposeInt('rank', { nullable: true }),
    totalTeams: t.exposeInt('totalTeams', { nullable: true }),
  }),
});

/**
 * Bulk standings for every active league the caller belongs to (LS-9528).
 *
 * Split out of `getUserLeagueSummaries` so the dashboard's cheap batched reads
 * are not held behind the StandingsService fan-out. Deliberately ONE bulk query
 * rather than a per-card field: the server still parallelises internally, while
 * a per-card resolver would turn one request into N.
 *
 * Selects exactly the leagues `getUserLeagueSummaries` used to compute standings
 * for: non-mock leagues the caller is a member of, in the `active` phase. That
 * resolver filtered its non-offseason set down to `active` before fanning out;
 * this one filters in SQL, which is equivalent and cheaper.
 */
builder.queryField('getUserLeagueStandings', (t) =>
  t.field({
    type: [UserLeagueStandings],
    nullable: false,
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to fetch league standings',
        );
      }

      const userId = context.user.id;

      const leagues = await context.db
        .select({
          id: PublicSchema.leagues.id,
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
            eq(PublicSchema.leagues.leaguePhase, 'active'),
          ),
        )
        .orderBy(PublicSchema.leagues.id);

      if (leagues.length === 0) return [];

      const { StandingsService } =
        await import('../../services/standings-service');

      return mapWithConcurrency(
        leagues,
        STANDINGS_FANOUT_CONCURRENCY,
        async (league) => {
          const standings = await StandingsService.getStandings(context.db, {
            leagueId: league.id,
          });
          const userStanding =
            standings.find((s) => s.teamId === league.userTeamId) ?? null;

          return {
            leagueId: league.id,
            wins: userStanding?.wins ?? null,
            losses: userStanding?.losses ?? null,
            ties: userStanding?.ties ?? null,
            rank: userStanding?.rank ?? null,
            totalTeams: standings.length,
          } satisfies UserLeagueStandingsShape;
        },
      );
    },
  }),
);
