import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import type { Team as DbTeam } from '@legacy-sports/db-client';
import {
  createDraftForLeague,
  createLeagueService,
  DraftService,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { and, desc, eq } from 'drizzle-orm';
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
  };
  teams?: Array<{
    id: number;
    name: string;
    leagueId: number;
    createdAt: Date;
    updatedAt: Date;
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

        // Create a new team for the user
        const insertedTeams = await context.db
          .insert(PublicSchema.teams)
          .values({
            name: teamName,
            leagueId: league.id,
          })
          .returning({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
          });

        const team = insertedTeams[0];

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

        // Create team for the user
        const teams = await context.db
          .insert(PublicSchema.teams)
          .values({
            name: teamName,
            leagueId: league.id,
          })
          .returning({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
          });

        if (teams.length === 0) {
          throw new Error('Failed to create team');
        }

        const team = teams[0];

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
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error(
          'Authentication required to update team member position',
        );
      }

      const { teamMemberId, positionId } = args;
      const userId = context.user.id;

      try {
        // Update team member position
        const db = context.db;
        // First verify user has access to this team member
        const memberAccess = await db
          .select()
          .from(PublicSchema.teamMembers)
          .innerJoin(
            PublicSchema.leagueMembers,
            eq(
              PublicSchema.leagueMembers.teamId,
              PublicSchema.teamMembers.teamId,
            ),
          )
          .where(
            and(
              eq(PublicSchema.teamMembers.id, teamMemberId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (memberAccess.length === 0) {
          throw new Error('User does not have access to this team member');
        }

        // TODO: Fix this update operation - there's a TypeScript error with positionId type
        // Update the team member position
        // const updated = await db.update(PublicSchema.teamMembers)
        //   .set({ positionId })
        //   .where(eq(PublicSchema.teamMembers.id, teamMemberId))
        //   .returning({
        //     id: PublicSchema.teamMembers.id,
        //     teamId: PublicSchema.teamMembers.teamId,
        //     leagueId: PublicSchema.teamMembers.leagueId,
        //     playerId: PublicSchema.teamMembers.playerId,
        //     positionId: PublicSchema.teamMembers.positionId,
        //   });

        // For now, return a placeholder result
        const updated = [
          {
            id: teamMemberId,
            teamId: null as number | null,
            leagueId: 0,
            playerId: 0,
            positionId: positionId ?? null,
          },
        ];

        if (updated.length === 0) {
          throw new Error('Failed to update team member position');
        }

        return updated[0];
      } catch (error) {
        LOGGER.error('Error updating team member position', {
          teamMemberId,
          positionId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Failed to update team member position');
      }
    },
  }),
);
