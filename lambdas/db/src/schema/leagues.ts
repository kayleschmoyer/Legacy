import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import type { Team as DbTeam } from '@legacy-sports/db-client';
import {
  createDraftForLeague,
  createLeagueService,
  DraftService,
} from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions, MIN_SEASON_WITH_GAME_DATA } from '@legacy-sports/utils';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { authorized } from './authorization';
import { builder } from './builder';
import { loadLeagueScoringConfig, ScoringConfigRef } from './scoring';

// League service instance for create operations
const leagueService = createLeagueService(getDbOptions());

// Default roster positions for new leagues
// These represent a standard fantasy baseball roster configuration
const DEFAULT_ROSTER_POSITIONS = [
  // Batting positions
  'C', // Catcher
  '1B', // First Base
  '2B', // Second Base
  '3B', // Third Base
  'SS', // Shortstop
  'OF', // Outfield (3 slots)
  'OF',
  'OF',
  'DH', // Designated Hitter
  // Pitching positions
  'SP', // Starting Pitcher (4 slots)
  'SP',
  'SP',
  'SP',
  'RP', // Relief Pitcher (4 slots)
  'RP',
  'RP',
  'RP',
  // Utility positions
  'IF', // Infield utility
  'XDH', // Extra DH/utility
] as const;

// League type - matches database schema with proper nullability
const League = builder.objectRef<{
  id: number;
  name: string;
  owner: number;
  maxRosterSize: number;
  currentMatchup: number | null;
  draftStatus: 'not-started' | 'queued' | 'in-progress' | 'completed';
  inviteCode: string;
  playerPool: 'all' | 'nl' | 'al';
  weekAdvanceStatus?: 'idle' | 'queued' | 'processing' | 'success' | 'failed';
  waiverType?: 'standard' | 'faab';
  waiverEnabled?: boolean;
  faabBudgetDefault?: number;
  userMembership?: {
    leagueId: number;
    userId: number;
    teamId: number | null;
    permissionLevel: 'owner' | 'commissioner';
  } | null;
}>('League');

League.implement({
  description: 'A fantasy sports league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    owner: t.exposeInt('owner'),
    maxRosterSize: t.exposeInt('maxRosterSize'),
    currentMatchup: t.exposeInt('currentMatchup', { nullable: true }),
    draftStatus: t.exposeString('draftStatus'),
    inviteCode: t.exposeString('inviteCode'),
    playerPool: t.exposeString('playerPool'),
    weekAdvanceStatus: t.exposeString('weekAdvanceStatus', { nullable: true }),
    waiverType: t.exposeString('waiverType', { nullable: true }),
    waiverEnabled: t.exposeBoolean('waiverEnabled', { nullable: true }),
    faabBudgetDefault: t.exposeInt('faabBudgetDefault', { nullable: true }),
    scoringProfile: t.field({
      type: ScoringConfigRef,
      resolve: async (parent, args, context) => {
        if (!context.user) {
          throw new Error('Authentication required to fetch scoring settings');
        }

        return loadLeagueScoringConfig(parent.id);
      },
    }),
    userMembership: t.field({
      type: LeagueMember,
      nullable: true,
      resolve: (parent) => parent.userMembership || null,
    }),
  }),
});

// Team type
export const Team = builder.objectRef<DbTeam>('Team');

Team.implement({
  description: 'A team in a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    leagueId: t.exposeInt('leagueId'),
    waiverOrder: t.exposeInt('waiverOrder', { nullable: true }),
    faabBudget: t.exposeInt('faabBudget', { nullable: true }),
    createdAt: t.string({
      resolve: (team) => team.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (team) => team.updatedAt.toISOString(),
    }),
  }),
});

// LeagueMember type - no id field, teamId is nullable, enum for permissionLevel
const LeagueMember = builder.objectRef<{
  leagueId: number;
  userId: number;
  teamId: number | null;
  permissionLevel: 'owner' | 'commissioner';
}>('LeagueMember');

LeagueMember.implement({
  description: 'A member of a league',
  fields: (t) => ({
    leagueId: t.exposeInt('leagueId'),
    userId: t.exposeInt('userId'),
    teamId: t.exposeInt('teamId', { nullable: true }),
    permissionLevel: t.exposeString('permissionLevel'),
    team: t.field({
      type: Team,
      nullable: true,
      resolve: async (parent, _args, context) => {
        if (!parent.teamId) return null;
        return context.loaders.teams.load(parent.teamId);
      },
    }),
  }),
});

// LeaguePosition type
const LeaguePosition = builder.objectRef<{
  id: number;
  leagueId: number;
  positionType: string;
}>('LeaguePosition');

LeaguePosition.implement({
  description: 'A position configuration in a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    positionType: t.exposeString('positionType'),
  }),
});

// TeamMember type
const TeamMember = builder.objectRef<{
  id: number;
  teamId: number | null;
  leagueId: number;
  playerId: number;
  positionId: number | null;
}>('TeamMember');

TeamMember.implement({
  description: 'A member of a team',
  fields: (t) => ({
    id: t.exposeInt('id'),
    teamId: t.exposeInt('teamId', { nullable: true }),
    leagueId: t.exposeInt('leagueId'),
    playerId: t.exposeInt('playerId'),
    positionId: t.exposeInt('positionId', { nullable: true }),
    player: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (parent, _args, context) => {
        return context.loaders.players.load(parent.playerId);
      },
    }),
  }),
});

// Input types for mutations
const CreateLeagueAndTeamsInput = builder.inputType(
  'CreateLeagueAndTeamsInput',
  {
    fields: (t) => ({
      leagueName: t.string({ required: true }),
      numberOfTeams: t.int({ required: true }),
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

// Helper function to shuffle array (Fisher-Yates algorithm)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Helper function to randomly distribute players across teams
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function randomlyAssignPlayers(
  db: PublicDb,
  leagueId: number,
  teams: DbTeam[],
  maxPlayersPerTeam: number,
) {
  // Get a pool of players (limit to ensure we don't overwhelm the system)
  const availablePlayers: { id: number }[] = await db
    .select({
      id: PublicSchema.players.id,
    })
    .from(PublicSchema.players)
    .limit(teams.length * maxPlayersPerTeam); // Get enough players for all teams

  if (availablePlayers.length === 0) {
    LOGGER.info('No players available for random assignment', { leagueId });
    return [];
  }

  // Shuffle the players for random distribution
  const shuffledPlayers = shuffleArray(availablePlayers);

  interface TeamMemberInsert {
    teamId: number;
    leagueId: number;
    playerId: number;
    positionId: number | null;
  }

  const teamMembers: TeamMemberInsert[] = [];
  let playerIndex = 0;

  // Distribute players evenly across teams
  for (const team of teams) {
    const playersForThisTeam = Math.min(
      maxPlayersPerTeam,
      shuffledPlayers.length - playerIndex,
    );

    for (let i = 0; i < playersForThisTeam; i++) {
      if (playerIndex < shuffledPlayers.length) {
        teamMembers.push({
          teamId: team.id,
          leagueId: leagueId,
          playerId: shuffledPlayers[playerIndex].id,
          positionId: null, // Players start unassigned to specific positions
        });
        playerIndex++;
      }
    }
  }

  // Insert all team members at once
  if (teamMembers.length > 0) {
    await db.insert(PublicSchema.teamMembers).values(teamMembers);
    LOGGER.info('Randomly assigned players to teams', {
      leagueId,
      teamCount: teams.length,
      assignedCount: teamMembers.length,
    });
  }

  return teamMembers;
}

// Mutation fields
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
        // Get user's team ID for this league
        const membership = await context.db
          .select({
            teamId: PublicSchema.leagueMembers.teamId,
          })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
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
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
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

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _maxRosterSize = league[0].maxRosterSize;

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

// Input type for simple league creation
// TODO: Remove if not used or implement in resolver
// const CreateLeagueInput = builder.inputType('CreateLeagueInput', {
//   fields: (t) => ({
//     name: t.string({ required: true }),
//     maxRosterSize: t.int({ required: false }),
//   }),
// });

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
        // See migration: 20260205_210000_add_cascade_deletes_to_leagues_and_teams.ts
        // This automatically cascades to:
        // - teams (which cascades to team_members, draft_teams, playoff data, etc.)
        // - matchups (which cascades to matchup_players, matchup_player_games)
        // - drafts (which cascades to draft_teams, draft_picks)
        // - league_members, league_positions
        // - playoff_brackets (which cascades to playoff_seeds, playoff_matchups)
        // - champion_trophies
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

// Mutation field for updating team member position
builder.mutationField('updateTeamMemberPosition', (t) =>
  t.field({
    type: TeamMember,
    args: {
      teamMemberId: t.arg.int({ required: true }),
      positionId: t.arg.int({ required: false }),
    },
    resolve: authorized(
      { teamMembers: (args) => [args.teamMemberId], checkLocked: true },
      async (_parent, args, context, user) => {
        const { teamMemberId, positionId } = args;

        try {
          const db = context.db;

          // Update the team member position
          const updated = await db
            .update(PublicSchema.teamMembers)
            .set({ positionId: positionId ?? null })
            .where(eq(PublicSchema.teamMembers.id, teamMemberId))
            .returning({
              id: PublicSchema.teamMembers.id,
              teamId: PublicSchema.teamMembers.teamId,
              leagueId: PublicSchema.teamMembers.leagueId,
              playerId: PublicSchema.teamMembers.playerId,
              positionId: PublicSchema.teamMembers.positionId,
            });

          if (updated.length === 0) {
            throw new Error('Failed to update team member position');
          }

          return updated[0];
        } catch (error) {
          LOGGER.error('Error updating team member position', {
            teamMemberId,
            positionId,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    ),
  }),
);

// Mutation field for atomically swapping two team members' positions
builder.mutationField('swapTeamMemberPositions', (t) =>
  t.field({
    type: [TeamMember],
    args: {
      teamMemberIdA: t.arg.int({ required: true }),
      positionIdA: t.arg.int({ required: false }),
      teamMemberIdB: t.arg.int({ required: true }),
      positionIdB: t.arg.int({ required: false }),
    },
    resolve: authorized(
      {
        teamMembers: (args) => [args.teamMemberIdA, args.teamMemberIdB],
        checkLocked: true,
      },
      async (_parent, args, context, user) => {
        const { teamMemberIdA, positionIdA, teamMemberIdB, positionIdB } = args;

        try {
          const db = context.db;

          // Perform the swap atomically inside a transaction
          const results = await db.transaction(async (tx) => {
            // Step 1: Clear both positions to avoid unique constraint violation
            await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: null })
              .where(
                inArray(PublicSchema.teamMembers.id, [
                  teamMemberIdA,
                  teamMemberIdB,
                ]),
              );

            // Step 2: Assign new positions
            const updatedA = await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: positionIdA ?? null })
              .where(eq(PublicSchema.teamMembers.id, teamMemberIdA))
              .returning({
                id: PublicSchema.teamMembers.id,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
                playerId: PublicSchema.teamMembers.playerId,
                positionId: PublicSchema.teamMembers.positionId,
              });

            const updatedB = await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: positionIdB ?? null })
              .where(eq(PublicSchema.teamMembers.id, teamMemberIdB))
              .returning({
                id: PublicSchema.teamMembers.id,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
                playerId: PublicSchema.teamMembers.playerId,
                positionId: PublicSchema.teamMembers.positionId,
              });

            if (updatedA.length === 0 || updatedB.length === 0) {
              throw new Error(
                'Failed to update one or both team member positions',
              );
            }

            return [updatedA[0], updatedB[0]];
          });

          return results;
        } catch (error) {
          LOGGER.error('Error swapping team member positions', {
            teamMemberIdA,
            positionIdA,
            teamMemberIdB,
            positionIdB,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    ),
  }),
);

// ── Waiver helpers ─────────────────────────────────────────────────────────

/**
 * After a player is claimed off waivers, this function:
 *   1. Selects a random eligible season and inserts into `league_week_player_seasons`
 *   2. Adds them to `matchup_players` for every current-week matchup involving the team
 *
 * The player is already on the bench (positionId: null) from the roster insertion.
 */
async function addClaimedPlayerToCurrentMatchup(
  db: PublicDb,
  leagueId: number,
  teamId: number,
  playerId: number,
): Promise<void> {
  // 1. Get the current matchup to determine the active week
  const leagueRows = await db
    .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  const currentMatchupId = leagueRows[0]?.currentMatchup;
  if (!currentMatchupId) {
    LOGGER.info(
      'No active matchup — skipping matchup player setup for waiver claim',
      {
        leagueId,
        playerId,
      },
    );
    return;
  }

  const refMatchup = await db
    .select({
      weekNumber: PublicSchema.matchups.weekNumber,
      gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
    })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, currentMatchupId))
    .limit(1);

  const weekNumber = refMatchup[0]?.weekNumber;
  if (weekNumber == null) return;

  const gamesPerMatchup = refMatchup[0]?.gamesPerMatchup ?? 7;

  // 2. Season selection — pick a random eligible season for this player
  //    Mirrors the logic in game-selection lambda's createMatchupForLeagueWeek
  const existingSeason = await db
    .select({ season: PublicSchema.leagueWeekPlayerSeasons.season })
    .from(PublicSchema.leagueWeekPlayerSeasons)
    .where(
      and(
        eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
        eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNumber),
        eq(PublicSchema.leagueWeekPlayerSeasons.playerId, playerId),
      ),
    )
    .limit(1);

  if (existingSeason.length === 0) {
    // Need to pick a season — query batting & pitching for eligible seasons
    const minGames = gamesPerMatchup * 2;

    const [battingSeasons, pitchingSeasons] = await Promise.all([
      db
        .select({
          season: PublicSchema.seasonBatting.season,
          g: PublicSchema.seasonBatting.g,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            eq(PublicSchema.seasonBatting.playerId, playerId),
            isNotNull(PublicSchema.seasonBatting.g),
            gte(PublicSchema.seasonBatting.season, MIN_SEASON_WITH_GAME_DATA),
          ),
        ),
      db
        .select({
          season: PublicSchema.seasonPitching.season,
          g: PublicSchema.seasonPitching.g,
        })
        .from(PublicSchema.seasonPitching)
        .where(
          and(
            eq(PublicSchema.seasonPitching.playerId, playerId),
            isNotNull(PublicSchema.seasonPitching.g),
            gte(PublicSchema.seasonPitching.season, MIN_SEASON_WITH_GAME_DATA),
          ),
        ),
    ]);

    // Build a map of max games per season
    const seasonGames = new Map<number, number>();
    for (const s of battingSeasons) {
      const g = s.g ?? 0;
      seasonGames.set(s.season, Math.max(seasonGames.get(s.season) ?? 0, g));
    }
    for (const s of pitchingSeasons) {
      const g = s.g ?? 0;
      seasonGames.set(s.season, Math.max(seasonGames.get(s.season) ?? 0, g));
    }

    // Filter to only seasons with enough games
    const eligible = [...seasonGames.entries()]
      .filter(([, games]) => games >= minGames)
      .map(([season]) => season);

    if (eligible.length === 0) {
      LOGGER.warn(
        'No eligible seasons for waiver-claimed player — skipping season selection',
        {
          playerId,
          leagueId,
          weekNumber,
          minGames,
        },
      );
      // Still insert matchup_players below so the player shows up
    } else {
      const selectedSeason =
        eligible[Math.floor(Math.random() * eligible.length)];

      await db
        .insert(PublicSchema.leagueWeekPlayerSeasons)
        .values({
          leagueId,
          weekNumber,
          playerId,
          season: selectedSeason,
        })
        .onConflictDoNothing();

      LOGGER.info('Season selected for waiver-claimed player', {
        playerId,
        leagueId,
        weekNumber,
        season: selectedSeason,
      });
    }
  }

  // 3. Add the player to matchup_players for every matchup this week involving their team
  const weekMatchups = await db
    .select({ id: PublicSchema.matchups.id })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        eq(PublicSchema.matchups.weekNumber, weekNumber),
        or(
          eq(PublicSchema.matchups.team1Id, teamId),
          eq(PublicSchema.matchups.team2Id, teamId),
        ),
      ),
    );

  for (const matchup of weekMatchups) {
    // Check if already exists (idempotent)
    const existing = await db
      .select({ id: PublicSchema.matchupPlayers.id })
      .from(PublicSchema.matchupPlayers)
      .where(
        and(
          eq(PublicSchema.matchupPlayers.matchupId, matchup.id),
          eq(PublicSchema.matchupPlayers.playerId, playerId),
          eq(PublicSchema.matchupPlayers.teamId, teamId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(PublicSchema.matchupPlayers).values({
        matchupId: matchup.id,
        playerId,
        teamId,
      });

      LOGGER.info('Added waiver-claimed player to matchup', {
        matchupId: matchup.id,
        playerId,
        teamId,
      });
    }
  }
}

// ── Waiver claim types ─────────────────────────────────────────────────────
const WaiverClaim = builder.objectRef<{
  id: number;
  leagueId: number;
  teamId: number;
  userId: number;
  playerId: number;
  dropPlayerId: number | null;
  faabBid: number | null;
  status: string;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
  playerName?: string;
  dropPlayerName?: string | null;
}>('WaiverClaim');

WaiverClaim.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    teamId: t.exposeInt('teamId'),
    userId: t.exposeInt('userId'),
    playerId: t.exposeInt('playerId'),
    dropPlayerId: t.exposeInt('dropPlayerId', { nullable: true }),
    faabBid: t.exposeInt('faabBid', { nullable: true }),
    status: t.exposeString('status'),
    errorMessage: t.exposeString('errorMessage', { nullable: true }),
    playerName: t.string({
      nullable: true,
      resolve: (parent) => parent.playerName ?? null,
    }),
    dropPlayerName: t.string({
      nullable: true,
      resolve: (parent) => parent.dropPlayerName ?? null,
    }),
    processedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.processedAt ? parent.processedAt.toISOString() : null,
    }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
  }),
});

// ── Team waiver claims query ───────────────────────────────────────────────
builder.queryField('teamWaiverClaims', (t) =>
  t.field({
    type: [WaiverClaim],
    args: {
      teamId: t.arg.int({ required: true }),
      status: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const db = context.db;
      const { teamId } = args;
      const statusFilter = (args.status ?? 'pending') as
        | 'pending'
        | 'processing'
        | 'completed'
        | 'failed'
        | 'cancelled';

      // Fetch claims with player name joins
      const claims = await db
        .select({
          id: PublicSchema.waiverClaims.id,
          leagueId: PublicSchema.waiverClaims.leagueId,
          teamId: PublicSchema.waiverClaims.teamId,
          userId: PublicSchema.waiverClaims.userId,
          playerId: PublicSchema.waiverClaims.playerId,
          dropPlayerId: PublicSchema.waiverClaims.dropPlayerId,
          faabBid: PublicSchema.waiverClaims.faabBid,
          status: PublicSchema.waiverClaims.status,
          errorMessage: PublicSchema.waiverClaims.errorMessage,
          processedAt: PublicSchema.waiverClaims.processedAt,
          createdAt: PublicSchema.waiverClaims.createdAt,
          playerFirstName: PublicSchema.players.firstName,
          playerLastName: PublicSchema.players.lastName,
        })
        .from(PublicSchema.waiverClaims)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.waiverClaims.playerId, PublicSchema.players.id),
        )
        .where(
          and(
            eq(PublicSchema.waiverClaims.teamId, teamId),
            eq(PublicSchema.waiverClaims.status, statusFilter),
          ),
        )
        .orderBy(PublicSchema.waiverClaims.createdAt);

      // Resolve drop player names in a second pass
      const dropPlayerIds = claims
        .map((c) => c.dropPlayerId)
        .filter((id): id is number => id != null);

      let dropPlayerMap: Record<number, string> = {};
      if (dropPlayerIds.length > 0) {
        const dropPlayers = await db
          .select({
            id: PublicSchema.players.id,
            firstName: PublicSchema.players.firstName,
            lastName: PublicSchema.players.lastName,
          })
          .from(PublicSchema.players)
          .where(inArray(PublicSchema.players.id, dropPlayerIds));

        dropPlayerMap = Object.fromEntries(
          dropPlayers.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]),
        );
      }

      return claims.map((c) => {
        const { playerFirstName, playerLastName, ...claim } = c;
        return {
          ...claim,
          playerName: `${playerFirstName} ${playerLastName}`.trim(),
          dropPlayerName: c.dropPlayerId
            ? (dropPlayerMap[c.dropPlayerId] ?? null)
            : null,
        };
      });
    },
  }),
);

// ── Cancel waiver claim mutation ───────────────────────────────────────────
builder.mutationField('cancelWaiverClaim', (t) =>
  t.field({
    type: WaiverClaim,
    args: {
      claimId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const db = context.db;
      const userId = context.user.id;

      // Fetch the claim and verify ownership
      const existing = await db
        .select()
        .from(PublicSchema.waiverClaims)
        .where(eq(PublicSchema.waiverClaims.id, args.claimId))
        .limit(1);

      if (existing.length === 0) {
        throw new Error('Waiver claim not found');
      }

      const claim = existing[0];

      if (claim.userId !== userId) {
        throw new Error('You can only cancel your own waiver claims');
      }

      if (claim.status !== 'pending') {
        throw new Error(
          `Cannot cancel a waiver claim with status "${claim.status}"`,
        );
      }

      // Atomically cancel only if still pending (prevents TOCTOU race
      // with the processor which may have set it to 'processing')
      const updated = await db
        .update(PublicSchema.waiverClaims)
        .set({
          status: 'cancelled',
          errorMessage: 'Cancelled by user',
          processedAt: new Date(),
        })
        .where(
          and(
            eq(PublicSchema.waiverClaims.id, args.claimId),
            eq(PublicSchema.waiverClaims.status, 'pending'),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new Error(
          'This claim is already being processed and can no longer be cancelled',
        );
      }

      LOGGER.info('Waiver claim cancelled by user', {
        claimId: args.claimId,
        userId,
        leagueId: claim.leagueId,
        playerId: claim.playerId,
      });

      return updated[0];
    },
  }),
);

// ── Claim free agent mutation ──────────────────────────────────────────────
// Creates a pending waiver claim to be processed later (via cron or manual trigger).
builder.mutationField('claimFreeAgent', (t) =>
  t.field({
    type: WaiverClaim,
    args: {
      leagueId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
      dropPlayerId: t.arg.int({ required: false }),
      faabBid: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { leagueId, playerId, dropPlayerId, faabBid } = args;
      const userId = context.user.id;
      const db = context.db;

      // 1. Resolve the user's team in this league
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

      if (membership.length === 0 || !membership[0].teamId) {
        throw new Error('You do not have a team in this league');
      }
      const teamId = membership[0].teamId;

      // 2. Check the player is not already on a team in this league
      const alreadyTaken = await db
        .select({ id: PublicSchema.teamMembers.id })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.leagueId, leagueId),
            eq(PublicSchema.teamMembers.playerId, playerId),
          ),
        )
        .limit(1);

      if (alreadyTaken.length > 0) {
        throw new Error('This player is already on a roster in this league');
      }

      // 3. Check for existing pending claim for this player in this league
      const existingClaim = await db
        .select({ id: PublicSchema.waiverClaims.id })
        .from(PublicSchema.waiverClaims)
        .where(
          and(
            eq(PublicSchema.waiverClaims.leagueId, leagueId),
            eq(PublicSchema.waiverClaims.playerId, playerId),
            eq(PublicSchema.waiverClaims.teamId, teamId),
            eq(PublicSchema.waiverClaims.status, 'pending'),
          ),
        )
        .limit(1);

      if (existingClaim.length > 0) {
        throw new Error('You already have a pending claim for this player');
      }

      // 4. If roster is full, verify a drop player was provided
      const leagueRow = await db
        .select({
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
          waiverType: PublicSchema.leagues.waiverType,
          waiverEnabled: PublicSchema.leagues.waiverEnabled,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (leagueRow.length === 0) {
        throw new Error('League not found');
      }

      if (!leagueRow[0].waiverEnabled) {
        throw new Error('Waivers are not enabled for this league');
      }

      // FAAB validation
      const leagueWaiverType = leagueRow[0].waiverType;
      let resolvedFaabBid: number | null = null;
      if (leagueWaiverType === 'faab') {
        if (faabBid == null || faabBid < 0) {
          throw new Error(
            'A FAAB bid amount is required for this league (must be >= 0)',
          );
        }
        // Check team's remaining FAAB budget
        const teamRow = await db
          .select({ faabBudget: PublicSchema.teams.faabBudget })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, teamId))
          .limit(1);

        const remainingBudget = teamRow[0]?.faabBudget ?? 0;

        // Calculate already-committed bids (pending claims)
        const committedBids = await db
          .select({ total: sql<number>`COALESCE(SUM(faab_bid), 0)` })
          .from(PublicSchema.waiverClaims)
          .where(
            and(
              eq(PublicSchema.waiverClaims.teamId, teamId),
              eq(PublicSchema.waiverClaims.status, 'pending'),
            ),
          );
        const alreadyCommitted = Number(committedBids[0]?.total ?? 0);

        if (faabBid > remainingBudget - alreadyCommitted) {
          throw new Error(
            `Insufficient FAAB budget. You have $${remainingBudget - alreadyCommitted} available (total: $${remainingBudget}, committed: $${alreadyCommitted}).`,
          );
        }
        resolvedFaabBid = faabBid;
      }

      const rosterCount = await db
        .select({ total: count() })
        .from(PublicSchema.teamMembers)
        .where(
          and(
            eq(PublicSchema.teamMembers.teamId, teamId),
            eq(PublicSchema.teamMembers.leagueId, leagueId),
          ),
        );

      const currentSize = rosterCount[0]?.total ?? 0;

      if (currentSize >= leagueRow[0].maxRosterSize && !dropPlayerId) {
        throw new Error(
          'Roster is full. You must drop a player to add a free agent.',
        );
      }

      // 5. If a drop player is specified, verify they're on the roster
      if (dropPlayerId) {
        const dropMember = await db
          .select({ id: PublicSchema.teamMembers.id })
          .from(PublicSchema.teamMembers)
          .where(
            and(
              eq(PublicSchema.teamMembers.teamId, teamId),
              eq(PublicSchema.teamMembers.leagueId, leagueId),
              eq(PublicSchema.teamMembers.playerId, dropPlayerId),
            ),
          )
          .limit(1);

        if (dropMember.length === 0) {
          throw new Error(
            'The player you are trying to drop is not on your roster',
          );
        }

        // Warn if another pending claim already intends to drop this player
        const conflictingDrop = await db
          .select({ id: PublicSchema.waiverClaims.id })
          .from(PublicSchema.waiverClaims)
          .where(
            and(
              eq(PublicSchema.waiverClaims.teamId, teamId),
              eq(PublicSchema.waiverClaims.dropPlayerId, dropPlayerId),
              eq(PublicSchema.waiverClaims.status, 'pending'),
            ),
          )
          .limit(1);

        if (conflictingDrop.length > 0) {
          throw new Error(
            'You already have a pending claim that drops this player. Cancel it first or choose a different player to drop.',
          );
        }
      }

      // 6. Insert the pending waiver claim
      const inserted = await db
        .insert(PublicSchema.waiverClaims)
        .values({
          leagueId,
          teamId,
          userId,
          playerId,
          dropPlayerId: dropPlayerId ?? null,
          faabBid: resolvedFaabBid,
          status: 'pending',
        })
        .returning();

      if (inserted.length === 0) {
        throw new Error('Failed to create waiver claim');
      }

      LOGGER.info('Waiver claim created', {
        claimId: inserted[0].id,
        leagueId,
        teamId,
        playerId,
        dropPlayerId: dropPlayerId ?? null,
        faabBid: resolvedFaabBid,
        userId,
      });

      return inserted[0];
    },
  }),
);

// ── Process waiver claims mutation ─────────────────────────────────────────
// Processes all pending waiver claims. Can be triggered from the UI or via
// EventBridge cron hitting the GraphQL endpoint.
const ProcessWaiverClaimsResult = builder.objectRef<{
  processed: number;
  succeeded: number;
  failed: number;
}>('ProcessWaiverClaimsResult');

ProcessWaiverClaimsResult.implement({
  fields: (t) => ({
    processed: t.exposeInt('processed'),
    succeeded: t.exposeInt('succeeded'),
    failed: t.exposeInt('failed'),
  }),
});

builder.mutationField('processWaiverClaims', (t) =>
  t.field({
    type: ProcessWaiverClaimsResult,
    args: {
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      const db = context.db;
      let succeeded = 0;
      let failed = 0;
      const succeededLeagueIds = new Set<number>();

      // 1. Fetch all leagues with pending claims and their waiver settings
      const pendingConditions = [
        eq(PublicSchema.waiverClaims.status, 'pending'),
      ];
      if (args.leagueId) {
        pendingConditions.push(
          eq(PublicSchema.waiverClaims.leagueId, args.leagueId),
        );
      }

      const pendingClaims = await db
        .select()
        .from(PublicSchema.waiverClaims)
        .where(and(...pendingConditions))
        .limit(500);

      if (pendingClaims.length === 0) {
        return { processed: 0, succeeded: 0, failed: 0 };
      }

      // Get unique league IDs from pending claims
      const leagueIds = [...new Set(pendingClaims.map((c) => c.leagueId))];

      // Fetch league settings for all involved leagues
      const leagueSettings = await db
        .select({
          id: PublicSchema.leagues.id,
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
          waiverType: PublicSchema.leagues.waiverType,
        })
        .from(PublicSchema.leagues)
        .where(inArray(PublicSchema.leagues.id, leagueIds));

      const leagueSettingsMap = new Map(leagueSettings.map((l) => [l.id, l]));

      // Fetch waiver_order for all teams
      const teamIds = [...new Set(pendingClaims.map((c) => c.teamId))];
      const teamSettings = await db
        .select({
          id: PublicSchema.teams.id,
          waiverOrder: PublicSchema.teams.waiverOrder,
          faabBudget: PublicSchema.teams.faabBudget,
        })
        .from(PublicSchema.teams)
        .where(inArray(PublicSchema.teams.id, teamIds));

      const teamSettingsMap = new Map(teamSettings.map((t) => [t.id, t]));

      LOGGER.info('Processing waiver claims', {
        count: pendingClaims.length,
        leagueId: args.leagueId ?? 'all',
        leagues: leagueIds,
      });

      // 2. Group claims by league, then by player (to resolve competing claims)
      const claimsByLeague = new Map<number, typeof pendingClaims>();
      for (const claim of pendingClaims) {
        const existing = claimsByLeague.get(claim.leagueId) ?? [];
        existing.push(claim);
        claimsByLeague.set(claim.leagueId, existing);
      }

      // 3. Process each league's claims
      for (const [leagueId, leagueClaims] of claimsByLeague) {
        const settings = leagueSettingsMap.get(leagueId);
        const maxRoster = settings?.maxRosterSize ?? 25;
        const waiverType = settings?.waiverType ?? 'standard';

        // Group by player to resolve competing claims
        const claimsByPlayer = new Map<number, typeof pendingClaims>();
        for (const claim of leagueClaims) {
          const existing = claimsByPlayer.get(claim.playerId) ?? [];
          existing.push(claim);
          claimsByPlayer.set(claim.playerId, existing);
        }

        // Sort each player's claims by priority
        for (const [playerId, playerClaims] of claimsByPlayer) {
          // Sort by priority: standard = waiver_order ASC; faab = faab_bid DESC, then waiver_order ASC as tiebreaker
          playerClaims.sort((a, b) => {
            if (waiverType === 'faab') {
              const bidA = a.faabBid ?? 0;
              const bidB = b.faabBid ?? 0;
              if (bidB !== bidA) return bidB - bidA; // Higher bid first
              // Tiebreaker: waiver order (lower = higher priority)
              const orderA = teamSettingsMap.get(a.teamId)?.waiverOrder ?? 999;
              const orderB = teamSettingsMap.get(b.teamId)?.waiverOrder ?? 999;
              return orderA - orderB;
            }
            // Standard: waiver order ASC (lower = higher priority)
            const orderA = teamSettingsMap.get(a.teamId)?.waiverOrder ?? 999;
            const orderB = teamSettingsMap.get(b.teamId)?.waiverOrder ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            // Fallback: earlier claim wins
            return a.createdAt.getTime() - b.createdAt.getTime();
          });

          // Process claims in priority order — first successful claim wins
          let claimed = false;
          for (const claim of playerClaims) {
            if (claimed) {
              // Cancel losing claims for this player
              await db
                .update(PublicSchema.waiverClaims)
                .set({
                  status: 'cancelled',
                  errorMessage: 'Player was claimed by another team',
                  processedAt: new Date(),
                })
                .where(eq(PublicSchema.waiverClaims.id, claim.id));
              failed++;
              continue;
            }

            try {
              // Mark as processing
              await db
                .update(PublicSchema.waiverClaims)
                .set({ status: 'processing' })
                .where(eq(PublicSchema.waiverClaims.id, claim.id));

              // Check player is still available
              const alreadyTaken = await db
                .select({ id: PublicSchema.teamMembers.id })
                .from(PublicSchema.teamMembers)
                .where(
                  and(
                    eq(PublicSchema.teamMembers.leagueId, claim.leagueId),
                    eq(PublicSchema.teamMembers.playerId, claim.playerId),
                  ),
                )
                .limit(1);

              if (alreadyTaken.length > 0) {
                await db
                  .update(PublicSchema.waiverClaims)
                  .set({
                    status: 'failed',
                    errorMessage: 'Player is no longer available',
                    processedAt: new Date(),
                  })
                  .where(eq(PublicSchema.waiverClaims.id, claim.id));
                failed++;
                claimed = true; // No point trying other claims for same player
                continue;
              }

              // FAAB: verify budget at processing time
              if (
                waiverType === 'faab' &&
                claim.faabBid != null &&
                claim.faabBid > 0
              ) {
                const teamBudget = await db
                  .select({ faabBudget: PublicSchema.teams.faabBudget })
                  .from(PublicSchema.teams)
                  .where(eq(PublicSchema.teams.id, claim.teamId))
                  .limit(1);

                const remaining = teamBudget[0]?.faabBudget ?? 0;
                if (claim.faabBid > remaining) {
                  await db
                    .update(PublicSchema.waiverClaims)
                    .set({
                      status: 'failed',
                      errorMessage: `Insufficient FAAB budget ($${remaining} remaining, bid was $${claim.faabBid})`,
                      processedAt: new Date(),
                    })
                    .where(eq(PublicSchema.waiverClaims.id, claim.id));
                  failed++;
                  continue; // Let next-priority team try
                }
              }

              // Check roster size & handle drop if needed
              const rosterCount = await db
                .select({ total: count() })
                .from(PublicSchema.teamMembers)
                .where(
                  and(
                    eq(PublicSchema.teamMembers.teamId, claim.teamId),
                    eq(PublicSchema.teamMembers.leagueId, claim.leagueId),
                  ),
                );

              const currentSize = rosterCount[0]?.total ?? 0;

              if (currentSize >= maxRoster) {
                if (!claim.dropPlayerId) {
                  await db
                    .update(PublicSchema.waiverClaims)
                    .set({
                      status: 'failed',
                      errorMessage:
                        'Roster is full and no drop player was specified',
                      processedAt: new Date(),
                    })
                    .where(eq(PublicSchema.waiverClaims.id, claim.id));
                  failed++;
                  continue;
                }

                // Drop the player
                const dropMember = await db
                  .select({ id: PublicSchema.teamMembers.id })
                  .from(PublicSchema.teamMembers)
                  .where(
                    and(
                      eq(PublicSchema.teamMembers.teamId, claim.teamId),
                      eq(PublicSchema.teamMembers.leagueId, claim.leagueId),
                      eq(PublicSchema.teamMembers.playerId, claim.dropPlayerId),
                    ),
                  )
                  .limit(1);

                if (dropMember.length === 0) {
                  await db
                    .update(PublicSchema.waiverClaims)
                    .set({
                      status: 'failed',
                      errorMessage: 'Drop player is no longer on roster',
                      processedAt: new Date(),
                    })
                    .where(eq(PublicSchema.waiverClaims.id, claim.id));
                  failed++;
                  continue;
                }

                await db
                  .delete(PublicSchema.teamMembers)
                  .where(eq(PublicSchema.teamMembers.id, dropMember[0].id));

                LOGGER.info('Dropped player for waiver claim', {
                  claimId: claim.id,
                  droppedPlayerId: claim.dropPlayerId,
                  teamId: claim.teamId,
                });
              } else if (claim.dropPlayerId) {
                // Drop was provided but roster isn't full — still honour it
                const dropMember = await db
                  .select({ id: PublicSchema.teamMembers.id })
                  .from(PublicSchema.teamMembers)
                  .where(
                    and(
                      eq(PublicSchema.teamMembers.teamId, claim.teamId),
                      eq(PublicSchema.teamMembers.leagueId, claim.leagueId),
                      eq(PublicSchema.teamMembers.playerId, claim.dropPlayerId),
                    ),
                  )
                  .limit(1);

                if (dropMember.length > 0) {
                  await db
                    .delete(PublicSchema.teamMembers)
                    .where(eq(PublicSchema.teamMembers.id, dropMember[0].id));
                }
              }

              // Add the player to the roster (bench by default)
              await db.insert(PublicSchema.teamMembers).values({
                teamId: claim.teamId,
                leagueId: claim.leagueId,
                playerId: claim.playerId,
                positionId: null,
                acquisitionType: 'waiver',
              });

              // Season selection + matchup_players insertion for current week
              try {
                await addClaimedPlayerToCurrentMatchup(
                  db,
                  claim.leagueId,
                  claim.teamId,
                  claim.playerId,
                );
              } catch (matchupError) {
                // Non-fatal — the player is on the roster, matchup setup can
                // be retried via the game-selection lambda's create-matchup handler
                LOGGER.warn('Failed to add waiver-claimed player to matchup', {
                  claimId: claim.id,
                  playerId: claim.playerId,
                  error:
                    matchupError instanceof Error
                      ? matchupError.message
                      : String(matchupError),
                });
              }

              // Mark claim as completed
              await db
                .update(PublicSchema.waiverClaims)
                .set({
                  status: 'completed',
                  processedAt: new Date(),
                })
                .where(eq(PublicSchema.waiverClaims.id, claim.id));

              succeeded++;
              claimed = true;
              succeededLeagueIds.add(claim.leagueId);

              LOGGER.info('Waiver claim processed successfully', {
                claimId: claim.id,
                leagueId: claim.leagueId,
                teamId: claim.teamId,
                playerId,
                waiverType,
                faabBid: claim.faabBid,
              });

              // FAAB: deduct bid from team's budget
              if (
                waiverType === 'faab' &&
                claim.faabBid != null &&
                claim.faabBid > 0
              ) {
                await db
                  .update(PublicSchema.teams)
                  .set({
                    faabBudget: sql`${PublicSchema.teams.faabBudget} - ${claim.faabBid}`,
                  })
                  .where(eq(PublicSchema.teams.id, claim.teamId));

                LOGGER.info('Deducted FAAB bid', {
                  teamId: claim.teamId,
                  bid: claim.faabBid,
                });
              }

              // Standard waivers: rotate waiver order — winning team goes to last
              if (waiverType === 'standard') {
                const winnerOrder = teamSettingsMap.get(
                  claim.teamId,
                )?.waiverOrder;
                if (winnerOrder != null) {
                  // Move all teams with higher order numbers up by one
                  await db.execute(sql`
                    UPDATE teams
                    SET waiver_order = waiver_order - 1
                    WHERE league_id = ${claim.leagueId}
                      AND waiver_order > ${winnerOrder}
                  `);
                  // Move winner to last
                  const maxOrder = await db
                    .select({ maxOrder: sql<number>`MAX(waiver_order)` })
                    .from(PublicSchema.teams)
                    .where(eq(PublicSchema.teams.leagueId, claim.leagueId));
                  const lastOrder = (Number(maxOrder[0]?.maxOrder) || 0) + 1;
                  await db
                    .update(PublicSchema.teams)
                    .set({ waiverOrder: lastOrder })
                    .where(eq(PublicSchema.teams.id, claim.teamId));

                  LOGGER.info('Rotated waiver order', {
                    teamId: claim.teamId,
                    previousOrder: winnerOrder,
                    newOrder: lastOrder,
                    leagueId: claim.leagueId,
                  });

                  // Update local cache for remaining claims in this batch
                  // Refresh team settings for this league
                  const updatedTeams = await db
                    .select({
                      id: PublicSchema.teams.id,
                      waiverOrder: PublicSchema.teams.waiverOrder,
                      faabBudget: PublicSchema.teams.faabBudget,
                    })
                    .from(PublicSchema.teams)
                    .where(eq(PublicSchema.teams.leagueId, claim.leagueId));
                  for (const ut of updatedTeams) {
                    teamSettingsMap.set(ut.id, ut);
                  }
                }
              }
            } catch (error) {
              LOGGER.error('Error processing waiver claim', {
                claimId: claim.id,
                error: error instanceof Error ? error.message : String(error),
              });

              await db
                .update(PublicSchema.waiverClaims)
                .set({
                  status: 'failed',
                  errorMessage:
                    error instanceof Error ? error.message : 'Unknown error',
                  processedAt: new Date(),
                })
                .where(eq(PublicSchema.waiverClaims.id, claim.id));

              failed++;
            }
          }
        }
      }

      // 4. Send websocket notifications for leagues with successful claims
      const notificationService = createNotificationService();

      if (notificationService && succeededLeagueIds.size > 0) {
        for (const lid of succeededLeagueIds) {
          try {
            await notificationService.notifyRosterUpdate(lid);
          } catch (err) {
            LOGGER.warn('Failed to send roster update notification', {
              leagueId: lid,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      const totalProcessed = succeeded + failed;
      LOGGER.info('Waiver claim processing complete', {
        processed: totalProcessed,
        succeeded,
        failed,
      });

      return {
        processed: totalProcessed,
        succeeded,
        failed,
      };
    },
  }),
);
