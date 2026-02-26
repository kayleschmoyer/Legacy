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
import { createNotificationService } from '@legacy-sports/aws-utils';
import { getDbOptions } from '@legacy-sports/utils';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  DEFAULT_ROSTER_POSITIONS,
  League,
  LeagueMember,
  LeaguePosition,
  Team,
} from './types';
import { builder } from '../builder';
import { adjustMatchupsForNewTotal } from '../matchups/mutations';

// League service instance for create operations
const leagueService = createLeagueService(getDbOptions());

// ── Input / payload types ──────────────────────────────────────────────────

const CreateLeagueAndTeamsInput = builder.inputType(
  'CreateLeagueAndTeamsInput',
  {
    fields: (t) => ({
      leagueName: t.string({ required: true }),
      numberOfTeams: t.int({ required: true }),
      numberOfDivisions: t.int({ required: false }), // default 2 (two divisions)
      schedulingStrategy: t.string({ required: false }), // 'round-robin' | 'divisional' | 'random' (optional, defaults to 'divisional')
      playerPool: t.string({ required: true }), // 'all' | 'nl' | 'al'
      draftMode: t.string({ required: false }), // 'live' | 'automated' (optional, defaults to 'live')
      selectionMethod: t.string({ required: false }), // 'standard' | 'auction' | 'random' (optional, defaults to 'standard')
      draftOrder: t.string({ required: false }), // 'snake' | 'linear' (optional, defaults to 'snake')
      isPublic: t.boolean({ required: false }),
      maxBatters: t.int({ required: false }),
      maxPitchers: t.int({ required: false }),
      maxRosterSize: t.int({ required: false }), // Allow frontend to control roster size
      tradingEnabled: t.boolean({ required: false }),
      waiverEnabled: t.boolean({ required: false }),
      waiverType: t.string({ required: false }), // 'standard' | 'faab' (optional, defaults to 'standard')
      faabBudgetDefault: t.int({ required: false }), // Default FAAB budget per team (defaults to 100)
      startDate: t.string({ required: false }), // ISO date string
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
    permissionLevel: 'owner' | 'commissioner';
  }>;
}>('CreateLeagueAndTeamsPayload');

CreateLeagueAndTeamsPayload.implement({
  fields: (t) => ({
    league: t.field({
      type: League,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
      resolve: (parent) => parent.league as any, // GraphQL schema type mismatch - parent.league missing draftStatus field
    }),
    teams: t.field({
      type: [Team],
      nullable: true,
      resolve: (parent) => parent.teams || [],
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
        throw new Error('Authentication required to create a league');
      }

      const {
        leagueName,
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
      } = args.input;
      const userId = context.user.id;
      const username = context.user.username || 'User';

      try {
        const result = await leagueService.createLeague({
          name: leagueName,
          ownerId: userId,
          ownerUsername: username,
          maxRosterSize: maxRosterSize || 25,
          numberOfTeams,
          numberOfDivisions: numberOfDivisions ?? 2,
          schedulingStrategy:
            (inputSchedulingStrategy as
              | 'round-robin'
              | 'divisional'
              | 'random'
              | null
              | undefined) ?? 'divisional',
          playerPool: playerPool as 'all' | 'nl' | 'al',
          draftMode: draftMode as 'live' | 'automated',
          selectionMethod: selectionMethod as 'standard' | 'auction' | 'random',
          draftOrder: draftOrder as 'snake' | 'linear',
          waiverType:
            inputWaiverType === 'faab'
              ? ('faab' as const)
              : ('standard' as const),
          waiverEnabled: inputWaiverEnabled ?? true,
          faabBudgetDefault: inputFaabBudgetDefault ?? 100,
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
      // Check if user is authenticated and has owner access
      if (!context.user) {
        throw new Error('Authentication required to add positions to league');
      }

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        // Verify user has owner access to this league
        const leagueAccess = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
              eq(PublicSchema.leagueMembers.permissionLevel, 'owner'),
            ),
          )
          .limit(1);

        if (leagueAccess.length === 0) {
          throw new Error('Only league owners can add positions to a league');
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
        throw new Error('Authentication required to start draft');
      }

      const { leagueId } = args;
      const userId = context.user.id;

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
        throw new Error('Authentication required to join a league');
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
          throw new Error(
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
          throw new Error('You are already a member of this league');
        }

        // Find an unassigned team in the league (one with no league_members entry)
        const unassignedTeams = await context.db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
          })
          .from(PublicSchema.teams)
          .leftJoin(
            PublicSchema.leagueMembers,
            and(
              eq(PublicSchema.leagueMembers.teamId, PublicSchema.teams.id),
              eq(PublicSchema.leagueMembers.leagueId, league.id),
            ),
          )
          .where(
            and(
              eq(PublicSchema.teams.leagueId, league.id),
              isNull(PublicSchema.leagueMembers.userId),
            ),
          )
          .orderBy(PublicSchema.teams.id)
          .limit(1);

        if (unassignedTeams.length === 0) {
          throw new Error('This league is full. All teams have been claimed.');
        }

        // Claim the unassigned team by renaming it to the user's chosen name
        const updatedTeams = await context.db
          .update(PublicSchema.teams)
          .set({ name: teamName, updatedAt: new Date() })
          .where(eq(PublicSchema.teams.id, unassignedTeams[0].id))
          .returning({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            divisionId: PublicSchema.teams.divisionId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
          });

        const team = updatedTeams[0];

        // Add user to league members with explicit typing
        const leagueMemberData: {
          leagueId: number;
          userId: number;
          teamId: number;
          permissionLevel: 'owner' | 'commissioner';
        } = {
          leagueId: league.id,
          userId: userId,
          teamId: team.id,
          permissionLevel: 'commissioner',
        };

        await context.db
          .insert(PublicSchema.leagueMembers)
          .values(leagueMemberData);

        LOGGER.info('User joined league', {
          userId,
          leagueId: league.id,
          teamId: team.id,
        });

        return team;
      } catch (error) {
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
      maxRosterSize: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const userId = context.user.id;
      const maxRosterSize = args.maxRosterSize ?? 25;

      try {
        const result = await leagueService.createLeague({
          name: args.name,
          ownerId: userId,
          ownerUsername: context.user.username || 'User',
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
        throw new Error('Authentication required');
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
          throw new Error('Invalid invite code');
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

        // Find an unassigned team in the league (one with no league_members entry)
        const unassignedTeamsForJoin = await context.db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
          })
          .from(PublicSchema.teams)
          .leftJoin(
            PublicSchema.leagueMembers,
            and(
              eq(PublicSchema.leagueMembers.teamId, PublicSchema.teams.id),
              eq(PublicSchema.leagueMembers.leagueId, league.id),
            ),
          )
          .where(
            and(
              eq(PublicSchema.teams.leagueId, league.id),
              isNull(PublicSchema.leagueMembers.userId),
            ),
          )
          .orderBy(PublicSchema.teams.id)
          .limit(1);

        if (unassignedTeamsForJoin.length === 0) {
          return {
            success: false,
            message: 'This league is full. All teams have been claimed.',
            leagueId: league.id,
          };
        }

        // Claim the unassigned team by renaming it to the user's chosen name
        const updatedTeamsForJoin = await context.db
          .update(PublicSchema.teams)
          .set({ name: teamName, updatedAt: new Date() })
          .where(eq(PublicSchema.teams.id, unassignedTeamsForJoin[0].id))
          .returning({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
          });

        const team = updatedTeamsForJoin[0];

        // Add user as league member
        await context.db.insert(PublicSchema.leagueMembers).values({
          leagueId: league.id,
          userId: userId,
          teamId: team.id,
          permissionLevel: 'commissioner',
        });

        return {
          success: true,
          message: `Successfully joined ${league.name}`,
          leagueId: league.id,
          teamId: team.id,
        };
      } catch (error) {
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
        throw new Error('Authentication required to delete league');
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
          throw new Error('League not found');
        }

        // Check if user is the owner or admin
        if (!context.user) {
          throw new Error('User not authenticated');
        }

        if (league[0].owner !== context.user.id && !context.user.isAdmin) {
          throw new Error(
            'Only the league owner or admin can delete this league',
          );
        }

        // Delete the league - CASCADE DELETE constraints handle the rest
        await context.db
          .delete(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, args.leagueId));

        return `Successfully deleted league ${args.leagueId} and all associated data`;
      } catch (error) {
        LOGGER.error('Error deleting league', {
          leagueId: args.leagueId,
          userId: context.user?.id,
          error: error instanceof Error ? error.message : String(error),
        });
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error('Failed to delete league: ' + errorMessage);
      }
    },
  }),
);

// Mutation field to delete all leagues (for development/testing)
builder.mutationField('deleteAllLeagues', (t) =>
  t.field({
    type: 'String',
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to delete leagues');
      }

      // Check if user has admin access
      if (!context.user.isAdmin) {
        throw new Error('Admin access required to delete all leagues');
      }

      try {
        // Get all leagues in the system (admin operation)
        const allLeagues = await context.db
          .select({
            id: PublicSchema.leagues.id,
          })
          .from(PublicSchema.leagues);

        if (allLeagues.length === 0) {
          return 'No leagues found to delete';
        }

        const leagueIds = allLeagues.map((l) => l.id);

        // Delete in correct order due to foreign key constraints
        // 1. Delete team members first
        for (const leagueId of leagueIds) {
          await context.db
            .delete(PublicSchema.teamMembers)
            .where(eq(PublicSchema.teamMembers.leagueId, leagueId));
        }

        // 2. Delete league positions
        for (const leagueId of leagueIds) {
          await context.db
            .delete(PublicSchema.leaguePosition)
            .where(eq(PublicSchema.leaguePosition.leagueId, leagueId));
        }

        // 3. Delete league members
        for (const leagueId of leagueIds) {
          await context.db
            .delete(PublicSchema.leagueMembers)
            .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));
        }

        // 4. Delete teams
        for (const leagueId of leagueIds) {
          await context.db
            .delete(PublicSchema.teams)
            .where(eq(PublicSchema.teams.leagueId, leagueId));
        }

        // 5. Finally delete leagues
        for (const leagueId of leagueIds) {
          await context.db
            .delete(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, leagueId));
        }

        return `Successfully deleted ${leagueIds.length} league(s) and all associated data`;
      } catch (error) {
        LOGGER.error('Error deleting leagues', {
          userId: context.user?.id,
          error: error instanceof Error ? error.message : String(error),
        });
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
        throw new Error('Authentication required');
      }

      const {
        leagueId,
        spStartsPerMatchup,
        gamesPerMatchup,
        minCareerGames,
        minCareerSeasons,
        totalMatchups,
      } = args.input;
      const userId = context.user.id;

      // Verify user is owner or commissioner
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
        throw new Error('You are not a member of this league');
      }

      // Both 'owner' and 'commissioner' can update settings
      // (In this schema, the owner has 'owner' permission level)

      // Build change descriptions for the chat notification
      const changeDescriptions: string[] = [];

      // Build update payload for the league
      const leagueUpdate: {
        spStartsPerMatchup?: number;
        gamesPerMatchup?: number;
        minCareerGames?: number;
        minCareerSeasons?: number;
        totalMatchups?: number;
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
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

      // 3. Send league chat notification
      const senderUsername = context.user.username ?? `user_${context.user.id}`;
      const changeSummary = changeDescriptions.join(', ');
      const notificationText = `⚙️ ${senderUsername} updated league settings: ${changeSummary}`;

      const [chatMsg] = await context.db
        .insert(PublicSchema.leagueMessages)
        .values({
          leagueId,
          userId,
          messageText: notificationText,
        })
        .returning();

      const notificationService = createNotificationService();
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

      LOGGER.info('League settings updated', {
        leagueId,
        changes: changeDescriptions,
        userId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
      return updatedLeague as any;
    },
  }),
);
