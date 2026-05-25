/**
 * League domain — Mutation resolvers
 *
 * Mutations: createLeagueAndTeams, createLeague, joinLeague,
 *            joinLeagueByCode, deleteLeague, deleteAllLeagues,
 *            startDraft, addDefaultPositionsToLeague
 */
import { PublicSchema } from '@legacy-sports/db-client';
import {
  createDraftForLeague,
  createLeagueService,
  DraftService,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import {
  DEFAULT_ROSTER_POSITIONS,
  DefensiveFormatEnum,
  League,
  LeagueMember,
  LeaguePosition,
  SportKindEnum,
  Team,
} from './types';
import {
  isEraFreeForSport,
  isEraValidForSport,
  isPoolValidForSport,
  isRosterSizeValidForSport,
  normalizeSport,
  ROSTER_RANGE_BY_SPORT,
} from './sport-validation';
import { builder, type Context } from '../builder';
import {
  adjustMatchupsForNewTotal,
  createAllMatchupsForLeague,
} from '../matchups/mutations';
import {
  AuthenticationError,
  ForbiddenError,
  PremiumRequiredError,
  UserInputError,
} from '../graphql-errors';
import { hasEntitlement, requireEntitlement } from '../authorization';
import { ENTITLEMENTS } from '../entitlements';
import { applyDecay, applyEscalation } from '../../services/salary-rollover';

// League service instance for create operations
const leagueService = createLeagueService(getDbOptions());

// Server-side validation limits — kept in sync with apps/web/src/constants/league.ts
const MAX_LEAGUE_NAME_LENGTH = 50;
const MIN_NUMBER_OF_TEAMS = 2;
const MAX_NUMBER_OF_TEAMS = 30;

// ── Input / payload types ──────────────────────────────────────────────────

const CreateLeagueAndTeamsInput = builder.inputType(
  'CreateLeagueAndTeamsInput',
  {
    fields: (t) => ({
      leagueName: t.string({ required: true }),
      // Sport for the league. Defaults to 'baseball' when omitted (LS-4628).
      sport: t.field({ type: SportKindEnum, required: false }),
      // Defensive scoring format for football leagues (LS-246).
      defensiveFormat: t.field({ type: DefensiveFormatEnum, required: false }),
      numberOfTeams: t.int({ required: true }),
      numberOfDivisions: t.int({ required: false }), // default 2 (two divisions)
      schedulingStrategy: t.string({ required: false }), // 'round-robin' | 'divisional' | 'random' (optional, defaults to 'divisional')
      playerPool: t.string({ required: true }), // 'all' | 'nl' | 'al'
      draftMode: t.string({ required: false }), // 'live' | 'automated' (optional, defaults to 'live')
      selectionMethod: t.string({ required: false }), // 'standard' | 'auction' | 'random' (optional, defaults to 'standard')
      draftOrder: t.string({ required: false }), // 'snake' | 'linear' (optional, defaults to 'snake')
      // Era-based league settings (LS-295)
      eraFilter: t.string({ required: false }), // 'all' | 'dead_ball' | 'golden_age' | 'expansion' | 'free_agency' | 'steroid_era' | 'modern' | 'custom'
      hofOnly: t.boolean({ required: false }), // restrict draft board to Hall of Famers
      customEraStartYear: t.int({ required: false }), // commissioner-defined era start
      customEraEndYear: t.int({ required: false }), // commissioner-defined era end
      isPublic: t.boolean({ required: false }),
      maxBatters: t.int({ required: false }),
      maxPitchers: t.int({ required: false }),
      maxRosterSize: t.int({ required: false }), // Allow frontend to control roster size
      tradingEnabled: t.boolean({ required: false }),
      waiverEnabled: t.boolean({ required: false }),
      waiverType: t.string({ required: false }), // 'standard' | 'faab' (optional, defaults to 'standard')
      faabBudgetDefault: t.int({ required: false }), // Default FAAB budget per team (defaults to 100)
      startDate: t.string({ required: false }), // ISO date string
      // ── Salary cap settings (LS-646) ─────────────────────────────────
      salaryCapEnabled: t.boolean({ required: false }),
      salaryCap: t.int({ required: false }),
      salaryFloor: t.int({ required: false }),
      luxuryTaxThreshold: t.int({ required: false }),
      minSalary: t.int({ required: false }),
      salaryEscalationPct: t.int({ required: false }),
      salaryDecayPct: t.int({ required: false }),
      auctionBudget: t.int({ required: false }),
      auctionMinBid: t.int({ required: false }),
    }),
  },
);

// Create payload type using consistent types
const CreateLeagueAndTeamsPayload = builder.objectRef<{
  league: {
    id: number;
    name: string;
    owner: number;
    maxRosterSize: number;
    currentMatchup: number | null;
    draftStatus?: string;
    waiverType?: string;
    waiverEnabled?: boolean;
    faabBudgetDefault?: number;
  };
  teams?: Array<{
    id: number;
    name: string;
    leagueId: number;
    divisionId: number | null;
    createdAt: Date;
    updatedAt: Date;
    waiverOrder: number | null;
    faabBudget: number | null;
  }>;
  leagueMembers?: Array<{
    leagueId: number;
    userId: number;
    teamId: number | null;
    permissionLevel: 'general_manager' | 'assistant_manager' | 'commissioner';
  }>;
}>('CreateLeagueAndTeamsPayload');

CreateLeagueAndTeamsPayload.implement({
  fields: (t) => ({
    league: t.field({
      type: League,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Pothos parent type lacks runtime field shape
      resolve: (parent) => parent.league as any, // GraphQL schema type mismatch - parent.league missing draftStatus field
    }),
    teams: t.field({
      type: [Team],
      nullable: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Pothos parent type lacks runtime field shape
      resolve: (parent) => (parent.teams || []) as any,
    }),
    leagueMembers: t.field({
      type: [LeagueMember],
      nullable: true,
      resolve: (parent) => parent.leagueMembers || [],
    }),
  }),
});

// Return type for joinLeague mutation
const JoinLeaguePayload = builder.objectRef<{
  success: boolean;
  message: string;
  leagueId?: number;
  teamId?: number;
}>('JoinLeaguePayload');

JoinLeaguePayload.implement({
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    message: t.exposeString('message'),
    leagueId: t.exposeInt('leagueId', { nullable: true }),
    teamId: t.exposeInt('teamId', { nullable: true }),
  }),
});

// ── Mutation resolvers ─────────────────────────────────────────────────────

builder.mutationField('createLeagueAndTeams', (t) =>
  t.field({
    type: CreateLeagueAndTeamsPayload,
    args: {
      input: t.arg({ type: CreateLeagueAndTeamsInput, required: true }),
    },
    resolve: async (parent, args, context) => {
      LOGGER.debug('CreateLeagueAndTeams resolver called', {
        hasUser: !!context.user,
        userId: context.user?.id,
        username: context.user?.username,
        args: args.input,
      });

      // Check if user is authenticated
      if (!context.user) {
        throw AuthenticationError('Authentication required to create a league');
      }

      const {
        leagueName,
        sport: inputSport,
        defensiveFormat: inputDefensiveFormat,
        numberOfTeams,
        numberOfDivisions,
        schedulingStrategy: inputSchedulingStrategy,
        playerPool = 'all',
        draftMode = 'live',
        selectionMethod = 'standard',
        draftOrder = 'snake',
        maxRosterSize,
        waiverEnabled: inputWaiverEnabled,
        waiverType: inputWaiverType,
        faabBudgetDefault: inputFaabBudgetDefault,
        eraFilter: inputEraFilter,
        hofOnly: inputHofOnly,
        customEraStartYear: inputCustomEraStartYear,
        customEraEndYear: inputCustomEraEndYear,
        isPublic: inputIsPublic,
        // Salary cap settings
        salaryCapEnabled: inputSalaryCapEnabled,
        salaryCap: inputSalaryCap,
        salaryFloor: inputSalaryFloor,
        luxuryTaxThreshold: inputLuxuryTaxThreshold,
        minSalary: inputMinSalary,
        salaryEscalationPct: inputSalaryEscalationPct,
        salaryDecayPct: inputSalaryDecayPct,
        auctionBudget: inputAuctionBudget,
        auctionMinBid: inputAuctionMinBid,
        startDate: inputStartDate,
      } = args.input;
      const userId = context.user.id;
      const username = context.user.username || 'User';

      // ── Input validation ────────────────────────────────────────────────────
      if (leagueName.trim().length === 0) {
        throw UserInputError('League name cannot be empty');
      }
      if (leagueName.length > MAX_LEAGUE_NAME_LENGTH) {
        throw UserInputError(
          `League name must be ${MAX_LEAGUE_NAME_LENGTH} characters or fewer`,
        );
      }
      if (
        numberOfTeams < MIN_NUMBER_OF_TEAMS ||
        numberOfTeams > MAX_NUMBER_OF_TEAMS
      ) {
        throw UserInputError(
          `Number of teams must be between ${MIN_NUMBER_OF_TEAMS} and ${MAX_NUMBER_OF_TEAMS}`,
        );
      }

      // ── Feature-entitlement gating ──────────────────────────────────────────
      // Enforce max 3 non-mock leagues unless the user has unlimited_leagues.
      if (!(await hasEntitlement(context, ENTITLEMENTS.unlimited_leagues))) {
        const [{ leagueCount }] = await context.db
          .select({ leagueCount: count() })
          .from(PublicSchema.leagues)
          .where(
            and(
              eq(PublicSchema.leagues.owner, userId),
              eq(PublicSchema.leagues.isMockDraft, false),
            ),
          );
        if (leagueCount >= 3) {
          throw PremiumRequiredError(
            'You have reached the 3-league limit for your current plan. Upgrade to unlock unlimited leagues.',
          );
        }
      }

      if (inputWaiverType === 'faab') {
        await requireEntitlement(
          context,
          ENTITLEMENTS.faab_waiver_type,
          'FAAB waiver type requires a premium subscription. Upgrade to unlock advanced waiver settings.',
        );
      }

      if (inputSalaryCapEnabled) {
        await requireEntitlement(
          context,
          ENTITLEMENTS.salary_cap_leagues,
          'Salary cap leagues require a premium subscription. Upgrade to unlock salary cap features.',
        );
      }

      // ── Sport-aware input validation (LS-4684 / LS-4685) ───────────────
      // The client UI varies eraFilter / playerPool / maxRosterSize by sport;
      // the server is authoritative and must reject inconsistent inputs from
      // raw GraphQL calls. Free-era enforcement is also sport-aware now —
      // football's "Spread Offense" (2011 – Now) is the free counterpart to
      // baseball's "Modern (2006+)".
      const resolvedSport = normalizeSport(inputSport);

      if (
        inputEraFilter &&
        !isEraValidForSport(resolvedSport, inputEraFilter)
      ) {
        throw UserInputError(
          `Era "${inputEraFilter}" is not valid for ${resolvedSport} leagues.`,
        );
      }

      if (playerPool && !isPoolValidForSport(resolvedSport, playerPool)) {
        throw UserInputError(
          `Player pool "${playerPool}" is not valid for ${resolvedSport} leagues.`,
        );
      }

      if (
        maxRosterSize != null &&
        !isRosterSizeValidForSport(resolvedSport, maxRosterSize)
      ) {
        const range = ROSTER_RANGE_BY_SPORT[resolvedSport];
        throw UserInputError(
          `Max roster size must be between ${range.min} and ${range.max} for ${resolvedSport} leagues.`,
        );
      }

      if (inputEraFilter && !isEraFreeForSport(resolvedSport, inputEraFilter)) {
        await requireEntitlement(
          context,
          ENTITLEMENTS.historical_era_filters,
          'Era-based filtering (non-free eras) requires a premium subscription. Upgrade to access historical era leagues.',
        );
      }

      const resolvedNumberOfDivisions = numberOfDivisions ?? 2;
      if (resolvedNumberOfDivisions > numberOfTeams) {
        throw UserInputError(
          'Number of divisions cannot exceed number of teams',
        );
      }

      // For odd-team leagues, require an odd number of divisions to avoid
      // uneven division sizes when teams are distributed (e.g. 7 teams / 2 divisions
      // would force a 4+3 split). This keeps division sizes as symmetric as possible.
      if (numberOfTeams % 2 === 1 && resolvedNumberOfDivisions % 2 === 0) {
        throw UserInputError(
          'Leagues with an odd number of teams must have an odd number of divisions',
        );
      }

      // ── playerPool input validation ─────────────────────────────────────
      const VALID_PLAYER_POOLS = [
        'all',
        'nl',
        'al',
        'nfl',
        'afc',
        'nfc',
      ] as const;
      if (!(VALID_PLAYER_POOLS as readonly string[]).includes(playerPool)) {
        throw UserInputError(
          `Invalid playerPool: "${playerPool}". Allowed values: ${VALID_PLAYER_POOLS.join(', ')}.`,
        );
      }
      const validatedPlayerPool =
        playerPool as (typeof VALID_PLAYER_POOLS)[number];

      // ── Custom era year-range validation ────────────────────────────────
      if (inputEraFilter === 'custom') {
        if (inputCustomEraStartYear == null || inputCustomEraEndYear == null) {
          throw new Error(
            'Both start year and end year are required for a custom era.',
          );
        }
        if (inputCustomEraStartYear > inputCustomEraEndYear) {
          throw new Error(
            'Start year must be earlier than or equal to end year.',
          );
        }
      }

      try {
        const result = await leagueService.createLeague({
          name: leagueName,
          ownerId: userId,
          ownerUsername: username,
          sport: inputSport ?? 'baseball',
          defensiveFormat:
            inputDefensiveFormat === 'idp' ? 'idp' : ('dst' as const),
          maxRosterSize: maxRosterSize || 25,
          numberOfTeams,
          numberOfDivisions: resolvedNumberOfDivisions,
          schedulingStrategy:
            (inputSchedulingStrategy as
              | 'round-robin'
              | 'divisional'
              | 'random'
              | null
              | undefined) ?? 'divisional',
          playerPool: validatedPlayerPool,
          draftMode: draftMode as 'live' | 'automated',
          selectionMethod: selectionMethod as 'standard' | 'auction' | 'random',
          draftOrder: draftOrder as 'snake' | 'linear',
          waiverType:
            inputWaiverType === 'faab'
              ? ('faab' as const)
              : ('standard' as const),
          waiverEnabled: inputWaiverEnabled ?? true,
          faabBudgetDefault: inputFaabBudgetDefault ?? 100,
          eraFilter:
            (inputEraFilter as
              | 'all'
              | 'dead_ball'
              | 'golden_age'
              | 'expansion'
              | 'free_agency'
              | 'steroid_era'
              | 'modern'
              | 'custom'
              | null
              | undefined) ?? 'all',
          hofOnly: inputHofOnly ?? false,
          customEraStartYear: inputCustomEraStartYear ?? null,
          customEraEndYear: inputCustomEraEndYear ?? null,
          isPublic: inputIsPublic ?? false,
          // Salary cap settings
          salaryCapEnabled: inputSalaryCapEnabled ?? false,
          salaryCap: inputSalaryCap ?? null,
          salaryFloor: inputSalaryFloor ?? null,
          luxuryTaxThreshold: inputLuxuryTaxThreshold ?? null,
          minSalary: inputMinSalary ?? 1,
          salaryEscalationPct: inputSalaryEscalationPct ?? 10,
          salaryDecayPct: inputSalaryDecayPct ?? 25,
          auctionBudget: inputAuctionBudget ?? 260,
          auctionMinBid: inputAuctionMinBid ?? 1,
          startDate: inputStartDate ?? undefined,
        });

        return result;
      } catch (error) {
        LOGGER.error('Error creating league and teams', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          userId: context.user?.id,
          leagueName,
          numberOfTeams,
          playerPool,
          draftMode,
          selectionMethod,
          draftOrder,
        });

        if (error instanceof Error) {
          throw new Error(
            `Failed to create league and teams: ${error.message}`,
          );
        }
        throw new Error(
          'Failed to create league and teams: Unknown error occurred',
        );
      }
    },
  }),
);

// Mutation field to add default positions to a league (for leagues that don't have positions)
builder.mutationField('addDefaultPositionsToLeague', (t) =>
  t.field({
    type: [LeaguePosition],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated and has General Manager access
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to add positions to league',
        );
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        // Verify user has General Manager access to this league
        const leagueAccess = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
              eq(PublicSchema.leagueMembers.permissionLevel, 'general_manager'),
            ),
          )
          .limit(1);

        if (leagueAccess.length === 0) {
          throw ForbiddenError(
            'Only the league General Manager can add positions to a league',
          );
        }

        // Check if league already has positions
        const existingPositions = await context.db
          .select()
          .from(PublicSchema.leaguePosition)
          .where(eq(PublicSchema.leaguePosition.leagueId, leagueId))
          .limit(1);

        if (existingPositions.length > 0) {
          throw new Error('League already has positions configured');
        }

        // Get the league's maxRosterSize
        const league = await context.db
          .select({
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (league.length === 0) {
          throw new Error('League not found');
        }

        // Create roster positions for the league
        // Only create the defined starter positions, bench spots are inferred
        const allPositions = DEFAULT_ROSTER_POSITIONS.slice();
        const positionData = allPositions.map((positionType) => ({
          leagueId: leagueId,
          positionType: positionType,
        }));

        const insertedPositions = await context.db
          .insert(PublicSchema.leaguePosition)
          .values(positionData)
          .returning({
            id: PublicSchema.leaguePosition.id,
            leagueId: PublicSchema.leaguePosition.leagueId,
            positionType: PublicSchema.leaguePosition.positionType,
          });

        return insertedPositions;
      } catch (error) {
        LOGGER.error('Error adding positions to league', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

// Mutation field to start a draft by queuing it in SQS
builder.mutationField('startDraft', (t) =>
  t.field({
    type: League,
    args: {
      leagueId: t.arg.int({ required: true }),
      draftMode: t.arg.string({ required: false }), // 'live' | 'automated'
      selectionMethod: t.arg.string({ required: false }), // 'standard' | 'auction' | 'random'
      draftOrder: t.arg.string({ required: false }), // 'snake' | 'linear'
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw AuthenticationError('Authentication required to start draft');
      }

      const { leagueId } = args;
      const userId = context.user.id;

      // Verify caller is commissioner or GM of this league before delegating
      // to DraftService. Defense in depth — do not rely solely on
      // validateUserAccess in the service layer (LS-2496). Kept outside the
      // try/catch so ForbiddenError is not rewrapped as a generic Error.
      const [membership] = await context.db
        .select({
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

      if (
        !membership ||
        (membership.permissionLevel !== 'commissioner' &&
          membership.permissionLevel !== 'general_manager')
      ) {
        throw ForbiddenError(
          'Only the league Commissioner or General Manager can start the draft',
        );
      }

      try {
        // Read saved draft settings from the database
        const [savedDraft] = await context.db
          .select({
            draftMode: PublicSchema.drafts.draftMode,
            selectionMethod: PublicSchema.drafts.selectionMethod,
            draftOrder: PublicSchema.drafts.draftOrder,
          })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .orderBy(desc(PublicSchema.drafts.createdAt))
          .limit(1);

        // Use saved settings as defaults, then override with any explicit args
        // Default to 'live' to match the drafts table column default and the UI default
        const draftMode = (args.draftMode ??
          savedDraft?.draftMode ??
          'live') as 'live' | 'automated';
        const selectionMethod = (args.selectionMethod ??
          savedDraft?.selectionMethod ??
          'standard') as 'standard' | 'auction' | 'random';
        const draftOrder = (args.draftOrder ??
          savedDraft?.draftOrder ??
          'snake') as 'snake' | 'linear';

        // If no draft record exists, create one so settings are always persisted
        if (!savedDraft) {
          await createDraftForLeague({
            leagueId,
            draftMode,
            selectionMethod,
            draftOrder,
          });
        }

        // Use the shared DraftService for consistency and reusability
        const draftService = new DraftService();

        const result = await draftService.startDraft({
          leagueId,
          draftMode,
          selectionMethod,
          draftOrder,
          requestedBy: userId,
          validateUserAccess: true, // GraphQL resolvers should validate user access
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to start draft');
        }

        LOGGER.info('Draft queued successfully via shared service', {
          leagueId: result.league?.id,
          draftStatus: result.league?.draftStatus,
        });

        return result.league;
      } catch (error) {
        LOGGER.error('Error starting draft', {
          leagueId: args.leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(
          `Failed to start draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  }),
);

// ── Team-claim helper ─────────────────────────────────────────────────────
//
// LS-2497: atomically claim an unassigned team slot for a user joining a
// league. Concurrent joiners previously could observe the same row as
// unassigned and both INSERT into league_members, producing duplicate
// ownership and (for paid leagues) double-charging risk.
//
// Locks the candidate team row with `FOR UPDATE OF t SKIP LOCKED` inside a
// transaction so any concurrent claim attempt is forced to a *different*
// team row (or to "no rows" when every team is locked). A defensive
// re-verification against league_members covers the case where a concurrent
// transaction had already committed an INSERT before our row lock — the
// LEFT JOIN snapshot could be stale, so we re-check inside the locked
// transaction before claiming.
type LeaguePermissionLevel =
  | 'general_manager'
  | 'assistant_manager'
  | 'commissioner';

type ClaimResult = { teamId: number } | { fullLeague: true };

export async function claimUnassignedTeamForUser(
  db: Context['db'],
  params: {
    leagueId: number;
    userId: number;
    teamName: string;
    permissionLevel: LeaguePermissionLevel;
  },
): Promise<ClaimResult> {
  const { leagueId, userId, teamName, permissionLevel } = params;

  return db.transaction(async (tx) => {
    const candidates = await tx.execute(sql`
      SELECT t.id
      FROM teams t
      LEFT JOIN league_members lm
        ON lm.team_id = t.id AND lm.league_id = ${leagueId}
      WHERE t.league_id = ${leagueId} AND lm.user_id IS NULL
      ORDER BY t.id
      LIMIT 1
      FOR UPDATE OF t SKIP LOCKED
    `);

    const teamId = (candidates.rows[0] as { id: number } | undefined)?.id;
    if (teamId === undefined) {
      return { fullLeague: true } as const;
    }

    const existing = await tx
      .select({ userId: PublicSchema.leagueMembers.userId })
      .from(PublicSchema.leagueMembers)
      .where(
        and(
          eq(PublicSchema.leagueMembers.leagueId, leagueId),
          eq(PublicSchema.leagueMembers.teamId, teamId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return { fullLeague: true } as const;
    }

    await tx
      .update(PublicSchema.teams)
      .set({ name: teamName, updatedAt: new Date() })
      .where(eq(PublicSchema.teams.id, teamId));

    await tx.insert(PublicSchema.leagueMembers).values({
      leagueId,
      userId,
      teamId,
      permissionLevel,
    });

    return { teamId };
  });
}

// Mutation field to join a league using an invite code
builder.mutationField('joinLeagueByCode', (t) =>
  t.field({
    type: Team,
    args: {
      inviteCode: t.arg.string({ required: true }),
      teamName: t.arg.string({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw AuthenticationError('Authentication required to join a league');
      }

      const { inviteCode, teamName } = args;
      const userId = context.user.id;

      try {
        // Find league by invite code
        // Look up league by invite code
        const leagues = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            owner: PublicSchema.leagues.owner,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.inviteCode, inviteCode.toUpperCase()))
          .limit(1);

        if (leagues.length === 0) {
          throw UserInputError(
            'Invalid invite code. Please check the code and try again.',
          );
        }

        const league = leagues[0];

        // Check if user is already a member of this league
        const existingMembership = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, league.id),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (existingMembership.length > 0) {
          throw UserInputError('You are already a member of this league');
        }

        // LS-2497: atomic claim — wraps team selection + rename + membership
        // insert in a transaction with a row-level lock so two concurrent
        // joiners can't both observe the same team as unassigned.
        const claim = await claimUnassignedTeamForUser(context.db, {
          leagueId: league.id,
          userId,
          teamName,
          permissionLevel: 'general_manager',
        });

        if ('fullLeague' in claim) {
          throw UserInputError(
            'This league is full. All teams have been claimed.',
          );
        }

        // Fetch the team we just claimed for the GraphQL response payload.
        const updatedTeams = await context.db
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
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, claim.teamId))
          .limit(1);

        const team = updatedTeams[0];

        if (!team || typeof team.leagueId !== 'number') {
          throw new Error(
            `joinLeagueByCode: post-claim SELECT teams returned malformed row ` +
              `(teamId=${claim.teamId} leagueId=${league.id}); ` +
              `expected { id, leagueId } but got ${JSON.stringify(team)}`,
          );
        }

        LOGGER.info('User joined league', {
          userId,
          leagueId: league.id,
          teamId: team.id,
        });

        // Send a league chat notification
        const joinerUsername = context.user.username ?? `user_${userId}`;
        const joinText = `🎉 ${joinerUsername} joined the league!`;
        try {
          const [chatMsg] = await context.db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId: league.id, userId, messageText: joinText })
            .returning();
          const { notificationService } = context;
          if (notificationService) {
            await notificationService.notifyLeagueChatMessage(league.id, {
              leagueId: league.id,
              messageId: chatMsg.id,
              senderId: userId,
              senderUsername: joinerUsername,
              messageText: joinText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            });
          }
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send league chat WS notification for league join',
            { err },
          );
        }

        return team;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        LOGGER.error('Error joining league', {
          userId,
          inviteCode: args.inviteCode,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(
          `Failed to join league: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  }),
);

// Mutation field to create a league with basic configuration
builder.mutationField('createLeague', (t) =>
  t.field({
    type: League,
    args: {
      name: t.arg.string({ required: true }),
      // Sport for the league. Defaults to 'baseball' when omitted (LS-4628).
      sport: t.arg({ type: SportKindEnum, required: false }),
      maxRosterSize: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const userId = context.user.id;

      // ── Premium feature gating: max 3 leagues for free tier ──────────────
      if (!(await hasEntitlement(context, ENTITLEMENTS.unlimited_leagues))) {
        const [{ leagueCount }] = await context.db
          .select({ leagueCount: count() })
          .from(PublicSchema.leagues)
          .where(
            and(
              eq(PublicSchema.leagues.owner, userId),
              eq(PublicSchema.leagues.isMockDraft, false),
            ),
          );
        if (leagueCount >= 3) {
          throw PremiumRequiredError(
            'You have reached the 3-league limit for your current plan. Upgrade to unlock unlimited leagues.',
          );
        }
      }

      const maxRosterSize = args.maxRosterSize ?? 25;

      try {
        const result = await leagueService.createLeague({
          name: args.name,
          ownerId: userId,
          ownerUsername: context.user.username || 'User',
          sport: args.sport ?? 'baseball',
          maxRosterSize,
        });

        return result.league;
      } catch (error) {
        LOGGER.error('Error creating league', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(
          `Failed to create league: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  }),
);

// Mutation field to join a league using an invite code
builder.mutationField('joinLeague', (t) =>
  t.field({
    type: JoinLeaguePayload,
    args: {
      inviteCode: t.arg.string({ required: true }),
      teamName: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const userId = context.user.id;
      const { inviteCode, teamName } = args;

      try {
        // Find league by invite code
        const leagues = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.inviteCode, inviteCode))
          .limit(1);

        if (leagues.length === 0) {
          throw UserInputError('Invalid invite code');
        }

        const league = leagues[0];

        // Check if user is already a member
        const existingMembership = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, league.id),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (existingMembership.length > 0) {
          return {
            success: false,
            message: 'You are already a member of this league',
            leagueId: league.id,
          };
        }

        // LS-2497: atomic claim (transaction + row-level lock) — see
        // claimUnassignedTeamForUser above for why this replaces the previous
        // unlocked SELECT-then-UPDATE-then-INSERT sequence.
        const claim = await claimUnassignedTeamForUser(context.db, {
          leagueId: league.id,
          userId,
          teamName,
          permissionLevel: 'general_manager',
        });

        if ('fullLeague' in claim) {
          return {
            success: false,
            message: 'This league is full. All teams have been claimed.',
            leagueId: league.id,
          };
        }

        const updatedTeams = await context.db
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
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, claim.teamId))
          .limit(1);

        const team = updatedTeams[0];

        if (!team || typeof team.leagueId !== 'number') {
          throw new Error(
            `joinLeague: post-claim SELECT teams returned malformed row ` +
              `(teamId=${claim.teamId} leagueId=${league.id}); ` +
              `expected { id, leagueId } but got ${JSON.stringify(team)}`,
          );
        }

        // Send a league chat notification
        const joinerUsername = context.user.username ?? `user_${userId}`;
        const joinText = `🎉 ${joinerUsername} joined the league!`;
        try {
          const [chatMsg] = await context.db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId: league.id, userId, messageText: joinText })
            .returning();
          const { notificationService } = context;
          if (notificationService) {
            await notificationService.notifyLeagueChatMessage(league.id, {
              leagueId: league.id,
              messageId: chatMsg.id,
              senderId: userId,
              senderUsername: joinerUsername,
              messageText: joinText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            });
          }
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send league chat WS notification for league join',
            { err },
          );
        }

        return {
          success: true,
          message: `Successfully joined ${league.name}`,
          leagueId: league.id,
          teamId: team.id,
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        LOGGER.error('Error joining league', {
          userId,
          inviteCode,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(
          `Failed to join league: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  }),
);

// Mutation field to delete a single league by ID
builder.mutationField('deleteLeague', (t) =>
  t.field({
    type: 'String',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw AuthenticationError('Authentication required to delete league');
      }

      try {
        // First, verify the league exists and user has permission
        const league = await context.db
          .select({
            id: PublicSchema.leagues.id,
            owner: PublicSchema.leagues.owner,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId))
          .limit(1);

        if (league.length === 0) {
          throw UserInputError('League not found');
        }

        // Check if user is the General Manager or admin
        if (!context.user) {
          throw AuthenticationError('User not authenticated');
        }

        if (league[0].owner !== context.user.id && !context.user.isAdmin) {
          throw ForbiddenError(
            'Only the league owner or admin can delete this league',
          );
        }

        // Delete the league - CASCADE DELETE constraints handle the rest
        await context.db
          .delete(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId));

        return `Successfully deleted league ${args.leagueId} and all associated data`;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        LOGGER.error(
          'Error deleting league',
          error instanceof Error ? error : new Error(String(error)),
          { leagueId: args.leagueId, userId: context.user?.id },
        );
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error('Failed to delete league: ' + errorMessage);
      }
    },
  }),
);

// Mutation field to delete all leagues owned by the current user.
// Admins can delete all leagues system-wide; regular users only delete the
// leagues where they are the owner.
builder.mutationField('deleteAllLeagues', (t) =>
  t.field({
    type: 'String',
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw AuthenticationError('Authentication required to delete leagues');
      }

      try {
        // Admins delete all leagues they are a member of.
        // Regular users only delete leagues they own (are the owner of)
        // to match the single-league deleteLeague authorization rules.
        const allLeagues = await context.db
          .select({
            id: PublicSchema.leagues.id,
          })
          .from(PublicSchema.leagues)
          .innerJoin(
            PublicSchema.leagueMembers,
            and(
              eq(PublicSchema.leagueMembers.leagueId, PublicSchema.leagues.id),
              eq(PublicSchema.leagueMembers.userId, context.user.id),
            ),
          )
          .where(
            context.user.isAdmin
              ? undefined
              : eq(PublicSchema.leagues.owner, context.user.id),
          );

        if (allLeagues.length === 0) {
          return 'No leagues found to delete';
        }

        const leagueIds = allLeagues.map((l) => l.id);

        // Delete all leagues — CASCADE DELETE constraints handle all related data:
        // teams, team_members, matchups, matchup_players, matchup_player_games,
        // league_positions, league_members, drafts, waiver_claims, trade_offers,
        // league_messages, league_scoring_profiles, roster_lock_rules,
        // playoff_brackets, champion_trophies, tiebreaker_rules,
        // league_week_player_seasons, league_achievement_restrictions
        await context.db
          .delete(PublicSchema.leagues)
          .where(inArray(PublicSchema.leagues.id, leagueIds));

        return `Successfully deleted ${leagueIds.length} league(s) and all associated data`;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        LOGGER.error(
          'Error deleting leagues',
          error instanceof Error ? error : new Error(String(error)),
          { userId: context.user?.id },
        );
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error('Failed to delete leagues: ' + errorMessage);
      }
    },
  }),
);

// ── Update League Settings ────────────────────────────────────────────────

const UpdateLeagueSettingsInput = builder.inputType(
  'UpdateLeagueSettingsInput',
  {
    fields: (t) => ({
      leagueId: t.int({ required: true }),
      spStartsPerMatchup: t.int({ required: false }),
      gamesPerMatchup: t.int({ required: false }),
      minCareerGames: t.int({ required: false }),
      minCareerSeasons: t.int({ required: false }),
      totalMatchups: t.int({ required: false }),
      playoffEnabled: t.boolean({ required: false }),
      playoffFormat: t.string({ required: false }),
      playoffMultiWeek: t.boolean({ required: false }),
      logoUrl: t.string({ required: false }),
      bannerUrl: t.string({ required: false }),
      primaryColor: t.string({ required: false }),
      secondaryColor: t.string({ required: false }),
      // ── Salary cap settings (LS-646) ─────────────────────────────────
      salaryCapEnabled: t.boolean({ required: false }),
      salaryCap: t.int({ required: false }),
      salaryFloor: t.int({ required: false }),
      luxuryTaxThreshold: t.int({ required: false }),
      minSalary: t.int({ required: false }),
      salaryEscalationPct: t.int({ required: false }),
      salaryDecayPct: t.int({ required: false }),
      auctionBudget: t.int({ required: false }),
      auctionMinBid: t.int({ required: false }),
    }),
  },
);

// Mutation: updateLeagueSettings - Update league-level settings
// When spStartsPerMatchup is changed, also updates any scheduled (not in-progress)
// matchups for the league to keep them in sync.
builder.mutationField('updateLeagueSettings', (t) =>
  t.field({
    type: League,
    args: {
      input: t.arg({ type: UpdateLeagueSettingsInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const {
        leagueId,
        spStartsPerMatchup,
        gamesPerMatchup,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
        playoffEnabled,
        playoffFormat,
        playoffMultiWeek,
        logoUrl,
        bannerUrl,
        primaryColor,
        secondaryColor,
        // Salary cap settings
        salaryCapEnabled,
        salaryCap,
        salaryFloor,
        luxuryTaxThreshold,
        minSalary,
        salaryEscalationPct,
        salaryDecayPct,
        auctionBudget,
        auctionMinBid,
      } = args.input;
      const userId = context.user.id;

      // Verify user is General Manager or commissioner
      const membership = await context.db
        .select({
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

      if (membership.length === 0) {
        throw ForbiddenError('You are not a member of this league');
      }

      // Both 'general_manager' and 'commissioner' can update settings
      if (
        membership[0].permissionLevel !== 'general_manager' &&
        membership[0].permissionLevel !== 'commissioner'
      ) {
        throw ForbiddenError(
          'Only a general manager or commissioner can update league settings',
        );
      }

      // Build change descriptions for the chat notification
      const changeDescriptions: string[] = [];

      // Build update payload for the league
      const leagueUpdate: {
        spStartsPerMatchup?: number;
        gamesPerMatchup?: number;
        minCareerGames?: number;
        minCareerSeasons?: number;
        totalMatchups?: number;
        playoffEnabled?: boolean;
        playoffFormat?: string;
        playoffMultiWeek?: boolean;
        logoUrl?: string | null;
        bannerUrl?: string | null;
        primaryColor?: string | null;
        secondaryColor?: string | null;
        // Salary cap
        salaryCapEnabled?: boolean;
        salaryCap?: number | null;
        salaryFloor?: number | null;
        luxuryTaxThreshold?: number | null;
        minSalary?: number;
        salaryEscalationPct?: number;
        salaryDecayPct?: number;
        auctionBudget?: number;
        auctionMinBid?: number;
      } = {};

      if (spStartsPerMatchup !== null && spStartsPerMatchup !== undefined) {
        if (spStartsPerMatchup < 1) {
          throw new Error('SP starts per matchup must be at least 1');
        }

        // Fetch current value for the change description
        const current = await context.db
          .select({
            spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        const currentGames =
          gamesPerMatchup ?? current[0]?.gamesPerMatchup ?? 5;
        if (spStartsPerMatchup > currentGames) {
          throw new Error(
            `SP starts per matchup (${spStartsPerMatchup}) cannot exceed games per matchup (${currentGames})`,
          );
        }

        const oldValue = current[0]?.spStartsPerMatchup ?? 1;

        if (oldValue !== spStartsPerMatchup) {
          leagueUpdate.spStartsPerMatchup = spStartsPerMatchup;
          changeDescriptions.push(
            `SP starts per matchup: ${oldValue} → ${spStartsPerMatchup}`,
          );
        }
      }

      if (gamesPerMatchup !== null && gamesPerMatchup !== undefined) {
        if (gamesPerMatchup < 1) {
          throw new Error('Games per matchup must be at least 1');
        }

        // Validate spStartsPerMatchup doesn't exceed new gamesPerMatchup
        const effectiveSpStarts =
          spStartsPerMatchup ?? leagueUpdate.spStartsPerMatchup;
        if (effectiveSpStarts === undefined) {
          // Need to fetch current spStartsPerMatchup
          const current = await context.db
            .select({
              spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
              gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, leagueId))
            .limit(1);

          const currentSpStarts = current[0]?.spStartsPerMatchup ?? 1;
          if (currentSpStarts > gamesPerMatchup) {
            throw new Error(
              `Games per matchup (${gamesPerMatchup}) cannot be less than SP starts per matchup (${currentSpStarts})`,
            );
          }

          const oldGames = current[0]?.gamesPerMatchup ?? 5;
          if (oldGames !== gamesPerMatchup) {
            leagueUpdate.gamesPerMatchup = gamesPerMatchup;
            changeDescriptions.push(
              `Games per matchup: ${oldGames} → ${gamesPerMatchup}`,
            );
          }
        } else {
          if (effectiveSpStarts > gamesPerMatchup) {
            throw new Error(
              `Games per matchup (${gamesPerMatchup}) cannot be less than SP starts per matchup (${effectiveSpStarts})`,
            );
          }

          // Fetch old value for change description
          const current = await context.db
            .select({
              gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, leagueId))
            .limit(1);

          const oldGames = current[0]?.gamesPerMatchup ?? 5;
          if (oldGames !== gamesPerMatchup) {
            leagueUpdate.gamesPerMatchup = gamesPerMatchup;
            changeDescriptions.push(
              `Games per matchup: ${oldGames} → ${gamesPerMatchup}`,
            );
          }
        }
      }

      if (minCareerGames !== null && minCareerGames !== undefined) {
        if (minCareerGames < 0) {
          throw new Error('Minimum career games must be 0 or greater');
        }

        const current = await context.db
          .select({ minCareerGames: PublicSchema.leagues.minCareerGames })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        const oldValue = current[0]?.minCareerGames ?? 50;
        if (oldValue !== minCareerGames) {
          leagueUpdate.minCareerGames = minCareerGames;
          changeDescriptions.push(
            `Min career games: ${oldValue} → ${minCareerGames}`,
          );
        }
      }

      if (minCareerSeasons !== null && minCareerSeasons !== undefined) {
        if (minCareerSeasons < 0) {
          throw new Error('Minimum career seasons must be 0 or greater');
        }

        const current = await context.db
          .select({ minCareerSeasons: PublicSchema.leagues.minCareerSeasons })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        const oldValue = current[0]?.minCareerSeasons ?? 3;
        if (oldValue !== minCareerSeasons) {
          leagueUpdate.minCareerSeasons = minCareerSeasons;
          changeDescriptions.push(
            `Min career seasons: ${oldValue} → ${minCareerSeasons}`,
          );
        }
      }

      if (totalMatchups !== null && totalMatchups !== undefined) {
        if (totalMatchups < 1) {
          throw new Error('Total matchups must be at least 1');
        }

        const current = await context.db
          .select({ totalMatchups: PublicSchema.leagues.totalMatchups })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        const oldValue = current[0]?.totalMatchups ?? 10;
        if (oldValue !== totalMatchups) {
          leagueUpdate.totalMatchups = totalMatchups;
          changeDescriptions.push(
            `Total matchups: ${oldValue} → ${totalMatchups}`,
          );
        }
      }

      if (playoffEnabled !== null && playoffEnabled !== undefined) {
        leagueUpdate.playoffEnabled = playoffEnabled;
        changeDescriptions.push(
          `Playoffs: ${playoffEnabled ? 'enabled' : 'disabled'}`,
        );
      }

      if (playoffFormat !== null && playoffFormat !== undefined) {
        const validFormats = ['4-team', '6-team', '8-team'];
        if (!validFormats.includes(playoffFormat)) {
          throw new Error(
            `Invalid playoff format. Must be one of: ${validFormats.join(', ')}`,
          );
        }
        // 6-team and 8-team playoff formats are premium only
        if (['6-team', '8-team'].includes(playoffFormat)) {
          await requireEntitlement(
            context,
            ENTITLEMENTS.advanced_playoff_formats,
          );
        }
        leagueUpdate.playoffFormat = playoffFormat;
        changeDescriptions.push(`Playoff format: ${playoffFormat}`);
      }

      if (playoffMultiWeek !== null && playoffMultiWeek !== undefined) {
        leagueUpdate.playoffMultiWeek = playoffMultiWeek;
        changeDescriptions.push(
          `Playoff multi-week matchups: ${playoffMultiWeek ? 'enabled' : 'disabled'}`,
        );
      }

      // ── Salary cap settings ──────────────────────────────────────────
      if (salaryCapEnabled !== null && salaryCapEnabled !== undefined) {
        // Enabling salary cap is a premium feature
        if (salaryCapEnabled) {
          await requireEntitlement(context, ENTITLEMENTS.salary_cap_leagues);
        }
        leagueUpdate.salaryCapEnabled = salaryCapEnabled;
        changeDescriptions.push(
          `Salary cap: ${salaryCapEnabled ? 'enabled' : 'disabled'}`,
        );
      }
      if (salaryCap !== undefined) {
        if (salaryCap !== null && salaryCap < 1) {
          throw new Error('Salary cap must be a positive integer');
        }
        leagueUpdate.salaryCap = salaryCap ?? null;
        if (salaryCap !== null)
          changeDescriptions.push(`Salary cap set to $${salaryCap}`);
      }
      if (salaryFloor !== undefined) {
        leagueUpdate.salaryFloor = salaryFloor ?? null;
      }
      if (luxuryTaxThreshold !== undefined) {
        leagueUpdate.luxuryTaxThreshold = luxuryTaxThreshold ?? null;
      }
      if (minSalary !== null && minSalary !== undefined) {
        if (minSalary < 1) throw new Error('Minimum salary must be at least 1');
        leagueUpdate.minSalary = minSalary;
      }
      if (salaryEscalationPct !== null && salaryEscalationPct !== undefined) {
        if (salaryEscalationPct < 0 || salaryEscalationPct > 100)
          throw new Error('Salary escalation must be between 0 and 100');
        leagueUpdate.salaryEscalationPct = salaryEscalationPct;
      }
      if (salaryDecayPct !== null && salaryDecayPct !== undefined) {
        if (salaryDecayPct < 0 || salaryDecayPct > 100)
          throw new Error('Salary decay must be between 0 and 100');
        leagueUpdate.salaryDecayPct = salaryDecayPct;
      }
      if (auctionBudget !== null && auctionBudget !== undefined) {
        if (auctionBudget < 1)
          throw new Error('Auction budget must be a positive integer');
        leagueUpdate.auctionBudget = auctionBudget;
        changeDescriptions.push(`Auction budget set to $${auctionBudget}`);
      }
      if (auctionMinBid !== null && auctionMinBid !== undefined) {
        if (auctionMinBid < 1)
          throw new Error('Auction minimum bid must be at least 1');
        leagueUpdate.auctionMinBid = auctionMinBid;
      }

      // Branding fields — set directly (no description logged for silent updates)
      if (logoUrl !== undefined) {
        leagueUpdate.logoUrl = logoUrl ?? null;
      }
      if (bannerUrl !== undefined) {
        leagueUpdate.bannerUrl = bannerUrl ?? null;
      }
      if (primaryColor !== undefined) {
        if (primaryColor !== null && !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
          throw new Error(
            'primaryColor must be a valid hex color (e.g. #FF0000)',
          );
        }
        leagueUpdate.primaryColor = primaryColor ?? null;
      }
      if (secondaryColor !== undefined) {
        if (
          secondaryColor !== null &&
          !/^#[0-9A-Fa-f]{6}$/.test(secondaryColor)
        ) {
          throw new Error(
            'secondaryColor must be a valid hex color (e.g. #FF0000)',
          );
        }
        leagueUpdate.secondaryColor = secondaryColor ?? null;
      }

      if (Object.keys(leagueUpdate).length === 0) {
        // No changes — just return the current league
        const [league] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Pothos resolver return type mismatch
        return league as any;
      }

      // 1. Update the league record
      const [updatedLeague] = await context.db
        .update(PublicSchema.leagues)
        .set(leagueUpdate)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .returning();

      if (!updatedLeague) {
        throw new Error('League not found');
      }

      // 2. Propagate settings to any scheduled (not yet in-progress) matchups
      const matchupUpdate: {
        spStartsPerMatchup?: number;
        gamesPerMatchup?: number;
      } = {};
      if (leagueUpdate.spStartsPerMatchup !== undefined) {
        matchupUpdate.spStartsPerMatchup = leagueUpdate.spStartsPerMatchup;
      }
      if (leagueUpdate.gamesPerMatchup !== undefined) {
        matchupUpdate.gamesPerMatchup = leagueUpdate.gamesPerMatchup;
      }

      if (Object.keys(matchupUpdate).length > 0) {
        const result = await context.db
          .update(PublicSchema.matchups)
          .set(matchupUpdate)
          .where(
            and(
              eq(PublicSchema.matchups.leagueId, leagueId),
              eq(PublicSchema.matchups.status, 'scheduled'),
            ),
          )
          .returning({ id: PublicSchema.matchups.id });

        LOGGER.info(
          `Updated matchup settings on ${result.length} scheduled matchups for league ${leagueId}`,
        );
      }

      // 2.5. Adjust matchup count if totalMatchups changed
      if (leagueUpdate.totalMatchups !== undefined) {
        const adjustResult = await adjustMatchupsForNewTotal(
          context.db,
          leagueId,
          leagueUpdate.totalMatchups,
        );
        LOGGER.info('Adjusted matchup count for new totalMatchups', {
          leagueId,
          newTotal: leagueUpdate.totalMatchups,
          added: adjustResult.added,
          removed: adjustResult.removed,
        });
      }

      // 3. Send league chat notification (only for non-branding setting changes)
      const senderUsername = context.user.username ?? `user_${context.user.id}`;
      const changeSummary = changeDescriptions.join(', ');

      if (changeSummary) {
        const notificationText = `⚙️ ${senderUsername} updated league settings: ${changeSummary}`;

        const [chatMsg] = await context.db
          .insert(PublicSchema.leagueMessages)
          .values({
            leagueId,
            userId,
            messageText: notificationText,
          })
          .returning();

        const { notificationService } = context;
        if (notificationService) {
          try {
            await notificationService.notifyLeagueChatMessage(leagueId, {
              leagueId,
              messageId: chatMsg.id,
              senderId: userId,
              senderUsername,
              messageText: notificationText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            });
          } catch (err: unknown) {
            LOGGER.warn(
              'Failed to send league chat WS notification for settings update',
              { err },
            );
          }
        }
      }

      LOGGER.info('League settings updated', {
        leagueId,
        changes: changeDescriptions,
        userId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Pothos resolver return type mismatch
      return updatedLeague as any;
    },
  }),
);

// ── Join Public League ────────────────────────────────────────────────────

/**
 * Mutation: joinPublicLeague
 *
 * Auto-join a public/open league without requiring an invite code.
 * Claims the next unassigned team slot and renames it to the user's chosen name.
 * The league must have isPublic=true and an available team slot.
 */
builder.mutationField('joinPublicLeague', (t) =>
  t.field({
    type: JoinLeaguePayload,
    args: {
      leagueId: t.arg.int({ required: true }),
      teamName: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError('Authentication required to join a league');
      }

      const { leagueId, teamName } = args;
      const userId = context.user.id;

      try {
        // Verify the league is public
        const leagueRows = await context.db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            isPublic: PublicSchema.leagues.isPublic,
            faabBudgetDefault: PublicSchema.leagues.faabBudgetDefault,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (leagueRows.length === 0) {
          throw UserInputError('League not found');
        }

        const league = leagueRows[0];

        if (!league.isPublic) {
          throw UserInputError(
            'This league is private. Use an invite code to join.',
          );
        }

        // Check if user is already a member
        const existingMembership = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (existingMembership.length > 0) {
          throw UserInputError('You are already a member of this league');
        }

        // LS-2497: atomic claim (transaction + row-level lock) — see
        // claimUnassignedTeamForUser above for why this replaces the previous
        // unlocked SELECT-then-UPDATE-then-INSERT sequence.
        const claim = await claimUnassignedTeamForUser(context.db, {
          leagueId,
          userId,
          teamName: teamName.trim(),
          permissionLevel: 'general_manager',
        });

        if ('fullLeague' in claim) {
          throw UserInputError(
            'This league is full. All teams have been claimed.',
          );
        }

        // Fetch the team we just claimed for the GraphQL response payload and
        // to guard against malformed rows (mirrors joinLeagueByCode).
        const updatedTeams = await context.db
          .select({
            id: PublicSchema.teams.id,
            leagueId: PublicSchema.teams.leagueId,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, claim.teamId))
          .limit(1);

        const team = updatedTeams[0];

        if (!team || typeof team.leagueId !== 'number') {
          throw new Error(
            `joinPublicLeague: post-claim SELECT teams returned malformed row ` +
              `(teamId=${claim.teamId} leagueId=${leagueId}); ` +
              `expected { id, leagueId } but got ${JSON.stringify(team)}`,
          );
        }

        LOGGER.info('User joined public league', {
          userId,
          leagueId,
          teamId: team.id,
        });

        // Send a league chat notification
        const joinerUsername = context.user.username ?? `user_${userId}`;
        const joinText = `🎉 ${joinerUsername} joined the league!`;
        try {
          const [chatMsg] = await context.db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId, userId, messageText: joinText })
            .returning();
          const { notificationService } = context;
          if (notificationService) {
            await notificationService.notifyLeagueChatMessage(leagueId, {
              leagueId,
              messageId: chatMsg.id,
              senderId: userId,
              senderUsername: joinerUsername,
              messageText: joinText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            });
          }
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send league chat WS notification for league join',
            { err },
          );
        }

        return {
          success: true,
          message: `You have joined "${league.name}" successfully!`,
          leagueId: team.leagueId,
          teamId: team.id,
        };
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Error joining public league', err, { userId, leagueId });
        throw new Error(`Failed to join league: ${err.message}`);
      }
    },
  }),
);

// -- Season Renewal ---------------------------------------------------------

/**
 * Mutation: renewLeague
 *
 * Begins a new season by creating a brand-new league that carries forward all
 * settings, members, and optionally rosters from the current league.  The
 * original league is frozen (read-only) and linked to the new one via
 * previousLeagueId, forming a lineage chain across seasons.
 *
 * keepRosters = true  ? copy team_members into the new league's teams
 * keepRosters = false ? leave rosters empty so a new draft can be held
 */
builder.mutationField('renewLeague', (t) =>
  t.field({
    type: League,
    args: {
      leagueId: t.arg.int({ required: true }),
      keepRosters: t.arg.boolean({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId, keepRosters } = args;
      const userId = context.user.id;

      // 1. Verify caller is commissioner of the league
      const [membership] = await context.db
        .select({ permissionLevel: PublicSchema.leagueMembers.permissionLevel })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw ForbiddenError('You are not a member of this league');
      }
      if (membership.permissionLevel !== 'commissioner') {
        throw ForbiddenError('Only the commissioner can start a new season');
      }

      // 2. Load full league record
      const [oldLeague] = await context.db
        .select()
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (!oldLeague) {
        throw new Error('League not found');
      }
      if (oldLeague.frozenAt) {
        throw new Error(
          'This league has already been retired for a new season',
        );
      }

      // 3. Load current teams (preserving order)
      const oldTeams = await context.db
        .select()
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, leagueId))
        .orderBy(PublicSchema.teams.id);

      // 4. Load league members
      const oldMembers = await context.db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));

      // 5. Load roster position slots
      const oldPositions = await context.db
        .select()
        .from(PublicSchema.leaguePosition)
        .where(eq(PublicSchema.leaguePosition.leagueId, leagueId));

      // 6. Load the active scoring profile (if any) for copying
      const [oldProfile] = await context.db
        .select()
        .from(PublicSchema.leagueScoringProfiles)
        .where(
          and(
            eq(PublicSchema.leagueScoringProfiles.leagueId, leagueId),
            eq(PublicSchema.leagueScoringProfiles.status, 'active'),
          ),
        )
        .limit(1);

      let profileEntries: (typeof PublicSchema.leagueScoringProfileEntries.$inferSelect)[] =
        [];
      if (oldProfile) {
        profileEntries = await context.db
          .select()
          .from(PublicSchema.leagueScoringProfileEntries)
          .where(
            eq(
              PublicSchema.leagueScoringProfileEntries.profileId,
              oldProfile.id,
            ),
          );
      }

      // 7. Load team_members if we are keeping rosters
      const oldRostersByTeamId = new Map<
        number,
        (typeof PublicSchema.teamMembers.$inferSelect)[]
      >();
      if (keepRosters) {
        const allRosters = await context.db
          .select()
          .from(PublicSchema.teamMembers)
          .where(eq(PublicSchema.teamMembers.leagueId, leagueId));
        for (const row of allRosters) {
          if (row.teamId == null) continue;
          const existing = oldRostersByTeamId.get(row.teamId) ?? [];
          existing.push(row);
          oldRostersByTeamId.set(row.teamId, existing);
        }
      }

      // 7b. Pre-load player_salaries for escalation/decay (salary cap leagues only)
      const oldPlayerSalariesMap = new Map<
        number,
        typeof PublicSchema.playerSalaries.$inferSelect
      >();
      if (oldLeague.salaryCapEnabled) {
        const oldSalaries = await context.db
          .select()
          .from(PublicSchema.playerSalaries)
          .where(eq(PublicSchema.playerSalaries.leagueId, leagueId));
        for (const row of oldSalaries) {
          oldPlayerSalariesMap.set(row.playerId, row);
        }
      }

      // 8. Load old draft settings so the new league inherits them
      const [oldDraft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, leagueId))
        .orderBy(desc(PublicSchema.drafts.id))
        .limit(1);

      // -- All reads done; now write ---------------------------------------

      // 9. Generate a unique invite code for the new league
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let newInviteCode = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        let code = '';
        for (let i = 0; i < 8; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await context.db
          .select({ id: PublicSchema.leagues.id })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.inviteCode, code))
          .limit(1);
        if (existing.length === 0) {
          newInviteCode = code;
          break;
        }
      }
      if (!newInviteCode) {
        throw new Error('Failed to generate unique invite code');
      }

      // Steps 10–17 run inside a single transaction so the new league, all
      // derived rows, and the frozenAt flip on the old league either all
      // succeed or all roll back together (LS-2498).
      const result = await context.db.transaction(async (tx) => {
        // 10. Create the new league (copying all settings, linking lineage)
        const [newLeague] = await tx
          .insert(PublicSchema.leagues)
          .values({
            name: oldLeague.name,
            owner: oldLeague.owner,
            maxRosterSize: oldLeague.maxRosterSize,
            currentMatchup: null,
            currentWeek: null,
            draftStatus: keepRosters ? 'completed' : 'not-started',
            leaguePhase: keepRosters ? 'offseason' : 'pre-draft',
            inviteCode: newInviteCode,
            minGamesPerSeason: oldLeague.minGamesPerSeason,
            gamesPerMatchup: oldLeague.gamesPerMatchup,
            tradeDeadlineWeek: oldLeague.tradeDeadlineWeek,
            rosterLockTiming: oldLeague.rosterLockTiming,
            schedulingStrategy: oldLeague.schedulingStrategy,
            playerPool: oldLeague.playerPool,
            eraFilter: oldLeague.eraFilter,
            hofOnly: oldLeague.hofOnly,
            customEraStartYear: oldLeague.customEraStartYear,
            customEraEndYear: oldLeague.customEraEndYear,
            waiverType: oldLeague.waiverType,
            waiverEnabled: oldLeague.waiverEnabled,
            faabBudgetDefault: oldLeague.faabBudgetDefault,
            spStartsPerMatchup: oldLeague.spStartsPerMatchup,
            minCareerGames: oldLeague.minCareerGames,
            minCareerSeasons: oldLeague.minCareerSeasons,
            totalMatchups: oldLeague.totalMatchups,
            numberOfDivisions: oldLeague.numberOfDivisions,
            playoffEnabled: oldLeague.playoffEnabled,
            playoffFormat: oldLeague.playoffFormat,
            playoffMultiWeek: oldLeague.playoffMultiWeek,
            isPublic: oldLeague.isPublic,
            logoUrl: oldLeague.logoUrl,
            bannerUrl: oldLeague.bannerUrl,
            primaryColor: oldLeague.primaryColor,
            secondaryColor: oldLeague.secondaryColor,
            previousLeagueId: leagueId,
            seasonNumber: (oldLeague.seasonNumber ?? 1) + 1,
            weekAdvanceStatus: 'idle',
            isMockDraft: false,
            // Salary cap settings carried forward (LS-645)
            salaryCapEnabled: oldLeague.salaryCapEnabled,
            salaryCap: oldLeague.salaryCap,
            salaryFloor: oldLeague.salaryFloor,
            luxuryTaxThreshold: oldLeague.luxuryTaxThreshold,
            minSalary: oldLeague.minSalary,
            salaryEscalationPct: oldLeague.salaryEscalationPct,
            salaryDecayPct: oldLeague.salaryDecayPct,
            auctionBudget: oldLeague.auctionBudget,
            auctionMinBid: oldLeague.auctionMinBid,
          })
          .returning();

        // 11. Create new teams � same names and division structure
        const newTeams = await tx
          .insert(PublicSchema.teams)
          .values(
            oldTeams.map((team) => ({
              name: team.name,
              leagueId: newLeague.id,
              divisionId: team.divisionId,
              waiverOrder: team.waiverOrder,
              faabBudget: oldLeague.faabBudgetDefault,
              logoUrl: team.logoUrl,
              primaryColor: team.primaryColor,
              secondaryColor: team.secondaryColor,
              avatarUrl: team.avatarUrl,
            })),
          )
          .returning();

        // Build a map from old teamId ? new teamId (positional, same order)
        const teamIdMap = new Map<number, number>();
        for (let i = 0; i < oldTeams.length; i++) {
          teamIdMap.set(oldTeams[i].id, newTeams[i].id);
        }

        // 12. Copy league members (preserving permission levels and team assignments)
        if (oldMembers.length > 0) {
          await tx.insert(PublicSchema.leagueMembers).values(
            oldMembers.map((m) => ({
              leagueId: newLeague.id,
              userId: m.userId,
              teamId:
                m.teamId != null ? (teamIdMap.get(m.teamId) ?? null) : null,
              permissionLevel: m.permissionLevel,
            })),
          );
        }

        // 13. Copy roster position slots � get new IDs for the roster copy
        const positionIdMap = new Map<number, number>();
        if (oldPositions.length > 0) {
          const newPositions = await tx
            .insert(PublicSchema.leaguePosition)
            .values(
              oldPositions.map((p) => ({
                leagueId: newLeague.id,
                positionType: p.positionType,
              })),
            )
            .returning();

          for (let i = 0; i < oldPositions.length; i++) {
            positionIdMap.set(oldPositions[i].id, newPositions[i].id);
          }
        }

        // 14. Copy rosters if keepRosters is requested
        // Collects carriedOverPlayerIds so LS-645 can apply salary escalation
        const carriedOverPlayerIds = new Set<number>();
        if (keepRosters && oldRostersByTeamId.size > 0) {
          const rosterRows: (typeof PublicSchema.teamMembers.$inferInsert)[] =
            [];
          for (const [oldTeamId, members] of oldRostersByTeamId.entries()) {
            const newTeamId = teamIdMap.get(oldTeamId);
            if (!newTeamId) continue;
            for (const m of members) {
              carriedOverPlayerIds.add(m.playerId);
              const salaryRow = oldPlayerSalariesMap.get(m.playerId);
              const escalatedSalary =
                salaryRow != null
                  ? applyEscalation(
                      salaryRow.currentSalary,
                      oldLeague.salaryEscalationPct,
                    )
                  : null;
              rosterRows.push({
                teamId: newTeamId,
                leagueId: newLeague.id,
                playerId: m.playerId,
                positionId:
                  m.positionId != null
                    ? (positionIdMap.get(m.positionId) ?? null)
                    : null,
                acquisitionType: 'rollover',
                onTradeBlock: false,
                salary: escalatedSalary,
              });
            }
          }
          if (rosterRows.length > 0) {
            await tx.insert(PublicSchema.teamMembers).values(rosterRows);
          }
        }

        // 14b. Identify free agents (previously rostered but not carried over)
        // LS-645 will use this to apply salary decay and increment freeAgentYears
        const allOldRosteredPlayerIds = new Set<number>();
        for (const members of oldRostersByTeamId.values()) {
          for (const m of members) allOldRosteredPlayerIds.add(m.playerId);
        }
        const freeAgentPlayerIds = new Set(
          [...allOldRosteredPlayerIds].filter(
            (id) => !carriedOverPlayerIds.has(id),
          ),
        );

        const rosterSummary = {
          carriedOver: carriedOverPlayerIds.size,
          freeAgents: freeAgentPlayerIds.size,
        };

        // 14c. Propagate player_salaries to the new league with escalation/decay
        //   - Carried-over (rostered) players: salary escalates by salaryEscalationPct
        //   - All others: salary decays by salaryDecayPct; freeAgentYears increments
        let salarySummary: { escalated: number; decayed: number } | null = null;
        if (oldLeague.salaryCapEnabled && oldPlayerSalariesMap.size > 0) {
          const { salaryEscalationPct, salaryDecayPct, minSalary } = oldLeague;
          const oldSeasonNumber = oldLeague.seasonNumber ?? 1;

          const newSalaryRows: (typeof PublicSchema.playerSalaries.$inferInsert)[] =
            [];
          let escalatedCount = 0;
          let decayedCount = 0;

          for (const [playerId, row] of oldPlayerSalariesMap.entries()) {
            if (carriedOverPlayerIds.has(playerId)) {
              // Escalation: Math.ceil(current * (100 + pct) / 100)
              const newSalary = applyEscalation(
                row.currentSalary,
                salaryEscalationPct,
              );
              newSalaryRows.push({
                leagueId: newLeague.id,
                playerId,
                currentSalary: newSalary,
                initialSalary: row.initialSalary,
                acquisitionType: row.acquisitionType,
                yearAcquired: row.yearAcquired,
                lastRosteredSeason: oldSeasonNumber,
                freeAgentYears: 0,
              });
              escalatedCount++;
            } else {
              // Decay: Math.max(minSalary, Math.floor(current * (100 - pct) / 100))
              const newSalary = applyDecay(
                row.currentSalary,
                salaryDecayPct,
                minSalary,
              );
              newSalaryRows.push({
                leagueId: newLeague.id,
                playerId,
                currentSalary: newSalary,
                initialSalary: row.initialSalary,
                acquisitionType: row.acquisitionType,
                yearAcquired: row.yearAcquired,
                lastRosteredSeason: row.lastRosteredSeason,
                freeAgentYears: row.freeAgentYears + 1,
              });
              decayedCount++;
            }
          }

          if (newSalaryRows.length > 0) {
            await tx.insert(PublicSchema.playerSalaries).values(newSalaryRows);
          }

          salarySummary = {
            escalated: escalatedCount,
            decayed: decayedCount,
          };
        }

        // 15. Create a draft record for the new league
        await tx.insert(PublicSchema.drafts).values({
          leagueId: newLeague.id,
          draftMode: oldDraft?.draftMode ?? 'live',
          selectionMethod: oldDraft?.selectionMethod ?? 'standard',
          draftOrder: oldDraft?.draftOrder ?? 'snake',
        });

        // 16. Copy the active scoring profile to the new league
        if (oldProfile) {
          const [newProfile] = await tx
            .insert(PublicSchema.leagueScoringProfiles)
            .values({
              leagueId: newLeague.id,
              profileName: oldProfile.profileName,
              status: 'active',
              isDefault: true,
              copiedFromProfileId: oldProfile.id,
            })
            .returning();

          if (profileEntries.length > 0) {
            await tx.insert(PublicSchema.leagueScoringProfileEntries).values(
              profileEntries.map((e) => ({
                profileId: newProfile.id,
                statDefinitionId: e.statDefinitionId,
                multiplier: e.multiplier,
                isEnabled: e.isEnabled,
              })),
            );
          }
        }

        // 17. Freeze the old league
        await tx
          .update(PublicSchema.leagues)
          .set({ frozenAt: new Date() })
          .where(eq(PublicSchema.leagues.id, leagueId));

        return { newLeague, rosterSummary, salarySummary };
      });

      const { newLeague, rosterSummary, salarySummary } = result;

      LOGGER.info('Season renewal roster summary', {
        carriedOver: rosterSummary.carriedOver,
        freeAgents: rosterSummary.freeAgents,
        newLeagueId: newLeague.id,
      });

      if (salarySummary) {
        LOGGER.info('Salary escalation and decay applied', {
          newLeagueId: newLeague.id,
          escalated: salarySummary.escalated,
          decayed: salarySummary.decayed,
        });
      }

      LOGGER.info('Season renewal complete', {
        oldLeagueId: leagueId,
        newLeagueId: newLeague.id,
        keepRosters,
        userId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Pothos resolver return type mismatch
      return newLeague as any;
    },
  }),
);

// -- Start Season (offseason → active) ---------------------------------------

/**
 * Mutation: startSeason
 *
 * Commissioner action that advances a league from the 'offseason' phase to
 * 'active'. This is used after renewLeague with keepRosters=true — the
 * commissioner can configure settings during the offseason window, then
 * explicitly start the new season which triggers matchup generation.
 */
builder.mutationField('startSeason', (t) =>
  t.field({
    type: League,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId } = args;
      const userId = context.user.id;

      // 1. Verify caller is commissioner
      const [membership] = await context.db
        .select({ permissionLevel: PublicSchema.leagueMembers.permissionLevel })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw ForbiddenError('You are not a member of this league');
      }
      if (membership.permissionLevel !== 'commissioner') {
        throw ForbiddenError('Only the commissioner can start the season');
      }

      // 2. Atomically claim the offseason → active transition to prevent races.
      //    If another request already transitioned this league, the WHERE clause
      //    won't match any rows and we'll throw below.
      const [claimed] = await context.db
        .update(PublicSchema.leagues)
        .set({ leaguePhase: 'active' })
        .where(
          and(
            eq(PublicSchema.leagues.id, leagueId),
            eq(PublicSchema.leagues.leaguePhase, 'offseason'),
          ),
        )
        .returning();

      if (!claimed) {
        // Either league doesn't exist or it wasn't in offseason
        const [league] = await context.db
          .select({ leaguePhase: PublicSchema.leagues.leaguePhase })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }
        throw new Error(
          `Cannot start season: league is in '${league.leaguePhase}' phase, expected 'offseason'`,
        );
      }

      // 3. Generate matchups for the new season
      const matchupResult = await createAllMatchupsForLeague(
        context.db,
        leagueId,
      );

      if (matchupResult.matchupCount === 0) {
        // Roll back to offseason — can't be active with no matchups
        await context.db
          .update(PublicSchema.leagues)
          .set({ leaguePhase: 'offseason' })
          .where(eq(PublicSchema.leagues.id, leagueId));

        throw new Error(
          'Cannot start season: matchup generation produced 0 matchups. League remains in offseason.',
        );
      }

      LOGGER.info('Season started via startSeason', {
        leagueId,
        matchupCount: matchupResult.matchupCount,
        currentMatchupId: matchupResult.currentMatchupId,
        userId,
      });

      // 4. Re-fetch the league to return the updated state
      const [updatedLeague] = await context.db
        .select()
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any -- Pothos resolver return type mismatch
      return updatedLeague as any;
    },
  }),
);
