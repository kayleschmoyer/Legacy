import {
  createDatabaseService,
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import type { Team as DbTeam } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { DraftService } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';
import { builder } from './builder';
import { loadLeagueScoringConfig, ScoringConfigRef } from './scoring';

// Create a single database service instance to reuse across all resolvers
// Updated for player field support - 2025-10-06
const dbService = createDatabaseService(getDbOptions());

// Helper function to generate unique invite codes
// Uses uppercase letters and numbers (excluding confusable characters: 0, O, 1, I, l)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper to check if an invite code already exists
async function isInviteCodeUnique(
  db: PublicDb,
  code: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: PublicSchema.leagues.id })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.inviteCode, code))
    .limit(1);
  return existing.length === 0;
}

// Helper to generate a unique invite code
async function generateUniqueInviteCode(db: PublicDb): Promise<string> {
  let code: string;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateInviteCode();
    isUnique = await isInviteCodeUnique(db, code);
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error(
        'Failed to generate unique invite code after maximum attempts',
      );
    }
  } while (!isUnique);

  return code;
}

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
  schedulingStrategy: 'round-robin' | 'divisional' | 'random';
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
    schedulingStrategy: t.exposeString('schedulingStrategy'),
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
      resolve: async (parent) => {
        // If no teamId, return null
        if (!parent.teamId) {
          return null;
        }

        // Query the database to get the team details
        try {
          const team = await runWithPublicClient(getDbOptions(), async (db) => {
            const results = await db
              .select({
                id: PublicSchema.teams.id,
                name: PublicSchema.teams.name,
                leagueId: PublicSchema.teams.leagueId,
              })
              .from(PublicSchema.teams)
              .where(eq(PublicSchema.teams.id, parent.teamId))
              .limit(1);

            return results.length > 0 ? results[0] : null;
          });

          return team;
        } catch (error) {
          console.error('Error fetching team for LeagueMember:', error);
          return null;
        }
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
      resolve: async (parent) => {
        return dbService.players.getPlayerById(parent.playerId);
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
      draftType: t.string({ required: true }), // 'NORMAL' | 'BLIND' | 'LEGACY' | 'RANDOM-DRAFT'
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
        const league = await runWithPublicClient(getDbOptions(), async (db) => {
          // First check if user has access to this league
          const memberCheck = await db
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
            throw new Error(
              'Access denied: You are not a member of this league',
            );
          }

          // Get the league details
          const results = await db
            .select({
              id: PublicSchema.leagues.id,
              name: PublicSchema.leagues.name,
              owner: PublicSchema.leagues.owner,
              maxRosterSize: PublicSchema.leagues.maxRosterSize,
              currentMatchup: PublicSchema.leagues.currentMatchup,
              draftStatus: PublicSchema.leagues.draftStatus,
              inviteCode: PublicSchema.leagues.inviteCode,
              schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
            })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, leagueId))
            .limit(1);

          if (results.length === 0) {
            return null;
          }

          const league = results[0];

          // Get the user's membership info (including team ID)
          const membershipResults = await db
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
            schedulingStrategy: league.schedulingStrategy,
            userMembership,
          };
        });

        return league;
      } catch (error) {
        console.error('Error fetching league:', error);
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
        console.log(`Fetching leagues for userId: ${userId}`);

        // First try to get basic database connection and check if tables exist
        const userLeagues = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
            console.log('Database connection established, checking tables...');

            try {
              // First check if we have any leagues at all
              const allLeagues = await db
                .select({
                  id: PublicSchema.leagues.id,
                  name: PublicSchema.leagues.name,
                  owner: PublicSchema.leagues.owner,
                  maxRosterSize: PublicSchema.leagues.maxRosterSize,
                  currentMatchup: PublicSchema.leagues.currentMatchup,
                  draftStatus: PublicSchema.leagues.draftStatus,
                  inviteCode: PublicSchema.leagues.inviteCode,
                  schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
                })
                .from(PublicSchema.leagues)
                .limit(5);

              console.log(
                `Found ${allLeagues.length} total leagues in database`,
              );

              // Check if leagueMembers table has any data
              const membershipCount = await db
                .select()
                .from(PublicSchema.leagueMembers)
                .limit(5);

              console.log(
                `Found ${membershipCount.length} league memberships in database`,
              );

              // Try the actual query
              const results = await db
                .select({
                  id: PublicSchema.leagues.id,
                  name: PublicSchema.leagues.name,
                  owner: PublicSchema.leagues.owner,
                  maxRosterSize: PublicSchema.leagues.maxRosterSize,
                  currentMatchup: PublicSchema.leagues.currentMatchup,
                  draftStatus: PublicSchema.leagues.draftStatus,
                  inviteCode: PublicSchema.leagues.inviteCode,
                  schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
                })
                .from(PublicSchema.leagues)
                .innerJoin(
                  PublicSchema.leagueMembers,
                  eq(
                    PublicSchema.leagues.id,
                    PublicSchema.leagueMembers.leagueId,
                  ),
                )
                .where(eq(PublicSchema.leagueMembers.userId, userId))
                .orderBy(PublicSchema.leagues.id);

              console.log(`Found ${results.length} leagues for user ${userId}`);

              return results.map((league) => ({
                id: league.id,
                name: league.name,
                owner: league.owner,
                maxRosterSize: league.maxRosterSize,
                currentMatchup: league.currentMatchup,
                draftStatus: league.draftStatus,
                inviteCode: league.inviteCode,
                schedulingStrategy: league.schedulingStrategy,
              }));
            } catch (dbError) {
              console.error('Database query error:', dbError);
              // Return empty array instead of throwing to help diagnose
              return [];
            }
          },
        );

        return userLeagues;
      } catch (error) {
        console.error('Error fetching user leagues:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          userId,
          context: context.user
            ? 'User authenticated'
            : 'User not authenticated',
        });

        // For now, return empty array instead of throwing to help with debugging
        console.log('Returning empty array due to error');
        return [];
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
    console.log('No players available for random assignment');
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
    console.log(
      `Randomly assigned ${teamMembers.length} players to ${teams.length} teams`,
    );
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
      console.log('CreateLeagueAndTeams resolver called with context:', {
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
        draftType,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        maxBatters: _maxBatters = 12,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        maxPitchers: _maxPitchers = 8,
        maxRosterSize,
      } = args.input;
      const userId = context.user.id;
      const username = context.user.username || 'User';

      try {
        // Create league and teams in the database with proper types
        const result = await runWithPublicClient(getDbOptions(), async (db) => {
          // Wrap in transaction to ensure atomicity
          return await db.transaction(async (tx) => {
            // Calculate roster size: use frontend value or fallback to 25
            const rosterSize = maxRosterSize || 25;

            // Generate unique invite code
            const inviteCode = await generateUniqueInviteCode(tx);

            // Prepare league data for insert
            const leagueData = {
              name: leagueName,
              owner: userId,
              maxRosterSize: rosterSize, // Frontend-controlled with fallback
              currentMatchup: null,
              inviteCode: inviteCode,
            };

            // Insert league
            const insertedLeagues = await tx
              .insert(PublicSchema.leagues)
              .values(leagueData)
              .returning({
                id: PublicSchema.leagues.id,
                name: PublicSchema.leagues.name,
                owner: PublicSchema.leagues.owner,
                maxRosterSize: PublicSchema.leagues.maxRosterSize,
                currentMatchup: PublicSchema.leagues.currentMatchup,
                draftStatus: PublicSchema.leagues.draftStatus,
                inviteCode: PublicSchema.leagues.inviteCode,
              });

            const league = insertedLeagues[0];

            interface InsertedTeam {
              id: number;
              name: string;
              leagueId: number;
            }
            let teams: InsertedTeam[] = [];
            interface LeagueMemberInsert {
              leagueId: number;
              userId: number;
              teamId: number;
              permissionLevel: 'owner' | 'commissioner';
            }
            let leagueMembers: LeagueMemberInsert[] = [];

            if (draftType === 'RANDOM-DRAFT') {
              // For random draft leagues, create multiple teams automatically
              const baseTeamNames = [
                `${username}'s Team`, // Owner's team first
                'Team Alpha',
                'Team Beta',
                'Team Gamma',
                'Team Delta',
                'Team Epsilon',
                'Team Zeta',
                'Team Eta',
                'Team Theta',
                'Team Iota',
                'Team Kappa',
                'Team Lambda',
                'Team Mu',
                'Team Nu',
                'Team Xi',
                'Team Omicron',
              ];

              // Generate team names for all requested teams
              const teamNames: string[] = [];
              for (let i = 0; i < numberOfTeams; i++) {
                if (i < baseTeamNames.length) {
                  teamNames.push(baseTeamNames[i]);
                } else {
                  // Generate additional team names if needed
                  teamNames.push(`Team ${i + 1}`);
                }
              }

              // Create all requested teams
              const teamsToCreate = numberOfTeams;
              interface TeamInsertData {
                name: string;
                leagueId: number;
              }
              const teamData: TeamInsertData[] = [];

              for (let i = 0; i < teamsToCreate; i++) {
                teamData.push({
                  name: teamNames[i],
                  leagueId: league.id,
                });
              }

              // Insert all teams
              const insertedTeams = await tx
                .insert(PublicSchema.teams)
                .values(teamData)
                .returning({
                  id: PublicSchema.teams.id,
                  name: PublicSchema.teams.name,
                  leagueId: PublicSchema.teams.leagueId,
                });

              teams = insertedTeams;

              // Create league member for owner (assign to first team)
              const ownerLeagueMember = {
                leagueId: league.id,
                userId: userId,
                teamId: teams[0].id,
                permissionLevel: 'owner' as const,
              };

              await tx
                .insert(PublicSchema.leagueMembers)
                .values(ownerLeagueMember);

              leagueMembers = [ownerLeagueMember];

              // NOTE: Draft processing is now handled asynchronously via SQS
              // Use the startDraft mutation to trigger draft processing after league creation
            } else {
              // For other draft types, also create all requested teams
              const baseTeamNames = [
                `${username}'s Team`, // Owner's team first
                'Team Alpha',
                'Team Beta',
                'Team Gamma',
                'Team Delta',
                'Team Epsilon',
                'Team Zeta',
                'Team Eta',
                'Team Theta',
                'Team Iota',
                'Team Kappa',
                'Team Lambda',
                'Team Mu',
                'Team Nu',
                'Team Xi',
                'Team Omicron',
              ];

              // Generate team names for all requested teams
              const teamNames: string[] = [];
              for (let i = 0; i < numberOfTeams; i++) {
                if (i < baseTeamNames.length) {
                  teamNames.push(baseTeamNames[i]);
                } else {
                  // Generate additional team names if needed
                  teamNames.push(`Team ${i + 1}`);
                }
              }

              // Create all requested teams
              interface TeamInsertData {
                name: string;
                leagueId: number;
              }
              const teamData: TeamInsertData[] = [];

              for (let i = 0; i < numberOfTeams; i++) {
                teamData.push({
                  name: teamNames[i],
                  leagueId: league.id,
                });
              }

              // Insert all teams
              const insertedTeams = await tx
                .insert(PublicSchema.teams)
                .values(teamData)
                .returning({
                  id: PublicSchema.teams.id,
                  name: PublicSchema.teams.name,
                  leagueId: PublicSchema.teams.leagueId,
                });

              teams = insertedTeams;

              // Create league member for owner (assign to first team)
              const ownerLeagueMember = {
                leagueId: league.id,
                userId: userId,
                teamId: teams[0].id,
                permissionLevel: 'owner' as const,
              };

              await tx
                .insert(PublicSchema.leagueMembers)
                .values(ownerLeagueMember);

              leagueMembers = [ownerLeagueMember];
            }

            // Create roster positions for the league
            // Only create the defined starter positions, bench spots are inferred
            const allPositions = DEFAULT_ROSTER_POSITIONS.slice();
            const positionData = allPositions.map((positionType) => ({
              leagueId: league.id,
              positionType: positionType,
            }));

            await tx.insert(PublicSchema.leaguePosition).values(positionData);

            return {
              league: {
                id: league.id,
                name: league.name,
                owner: league.owner,
                maxRosterSize: league.maxRosterSize,
                currentMatchup: league.currentMatchup,
                draftStatus: league.draftStatus,
              },
              teams: teams,
              leagueMembers: leagueMembers,
            };
          }); // End transaction
        }); // End runWithPublicClient

        return result;
      } catch (error) {
        console.error('Error creating league and teams:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'No stack trace',
          userId: context.user?.id,
          leagueName,
          numberOfTeams,
          draftType,
        });

        // Provide more specific error information
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
        const positions = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
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
            const leaguePositions = await db
              .select({
                id: PublicSchema.leaguePosition.id,
                leagueId: PublicSchema.leaguePosition.leagueId,
                positionType: PublicSchema.leaguePosition.positionType,
              })
              .from(PublicSchema.leaguePosition)
              .where(eq(PublicSchema.leaguePosition.leagueId, leagueId))
              .orderBy(PublicSchema.leaguePosition.positionType);

            return leaguePositions;
          },
        );

        return positions;
      } catch (error) {
        console.error('Error fetching league positions:', error);
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
        const members = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
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
            const teamMembers = await db
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

            return teamMembers;
          },
        );

        return members;
      } catch (error) {
        console.error('Error fetching team members:', error);
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
        const result = await runWithPublicClient(getDbOptions(), async (db) => {
          // Get user's team ID for this league
          const membership = await db
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
        });

        return result;
      } catch (error) {
        console.error('Error fetching user team ID:', error);
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
        const teams = await runWithPublicClient(getDbOptions(), async (db) => {
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

          // Fetch all teams in the league
          const leagueTeams = await db
            .select({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
              leagueId: PublicSchema.teams.leagueId,
            })
            .from(PublicSchema.teams)
            .where(eq(PublicSchema.teams.leagueId, leagueId))
            .orderBy(PublicSchema.teams.name);

          return leagueTeams;
        });

        return teams;
      } catch (error) {
        console.error('Error fetching league teams:', error);
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
        const result = await runWithPublicClient(getDbOptions(), async (db) => {
          // Verify user has owner access to this league
          const leagueAccess = await db
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
          const existingPositions = await db
            .select()
            .from(PublicSchema.leaguePosition)
            .where(eq(PublicSchema.leaguePosition.leagueId, leagueId))
            .limit(1);

          if (existingPositions.length > 0) {
            throw new Error('League already has positions configured');
          }

          // Get the league's maxRosterSize
          const league = await db
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

          const insertedPositions = await db
            .insert(PublicSchema.leaguePosition)
            .values(positionData)
            .returning({
              id: PublicSchema.leaguePosition.id,
              leagueId: PublicSchema.leaguePosition.leagueId,
              positionType: PublicSchema.leaguePosition.positionType,
            });

          return insertedPositions;
        });

        return result;
      } catch (error) {
        console.error('Error adding positions to league:', error);
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
      draftType: t.arg.string({ required: false }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to start draft');
      }

      const { leagueId, draftType = 'random-draft' } = args;
      const userId = context.user.id;

      try {
        // Use the shared DraftService for consistency and reusability
        const draftService = new DraftService();

        const result = await draftService.startDraft({
          leagueId,
          draftType: draftType as 'random-draft' | 'snake-draft' | 'auction',
          requestedBy: userId,
          validateUserAccess: true, // GraphQL resolvers should validate user access
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to start draft');
        }

        console.log(
          '✅ Draft queued successfully via shared service:',
          result.league,
        );

        // Fetch full league with schedulingStrategy (DraftService doesn't return it)
        const fullLeague = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
            const leagues = await db
              .select({
                schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
              })
              .from(PublicSchema.leagues)
              .where(eq(PublicSchema.leagues.id, leagueId))
              .limit(1);
            return leagues[0];
          },
        );

        // Return with proper typing for GraphQL resolver
        return {
          ...result.league,
          draftStatus: result.league.draftStatus as
            | 'not-started'
            | 'queued'
            | 'in-progress'
            | 'completed',
          schedulingStrategy: fullLeague?.schedulingStrategy || 'round-robin',
        };
      } catch (error) {
        console.error('Error starting draft:', error);
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
        const result = await runWithPublicClient(getDbOptions(), async (db) => {
          // Wrap in transaction to ensure team creation and membership assignment are atomic
          return await db.transaction(async (tx) => {
            // Look up league by invite code
            const leagues = await tx
              .select({
                id: PublicSchema.leagues.id,
                name: PublicSchema.leagues.name,
                owner: PublicSchema.leagues.owner,
                maxRosterSize: PublicSchema.leagues.maxRosterSize,
              })
              .from(PublicSchema.leagues)
              .where(
                eq(PublicSchema.leagues.inviteCode, inviteCode.toUpperCase()),
              )
              .limit(1);

            if (leagues.length === 0) {
              throw new Error(
                'Invalid invite code. Please check the code and try again.',
              );
            }

            const league = leagues[0];

            // Check if user is already a member of this league
            const existingMembership = await tx
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
            const insertedTeams = await tx
              .insert(PublicSchema.teams)
              .values({
                name: teamName,
                leagueId: league.id,
              })
              .returning({
                id: PublicSchema.teams.id,
                name: PublicSchema.teams.name,
                leagueId: PublicSchema.teams.leagueId,
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

            await tx
              .insert(PublicSchema.leagueMembers)
              .values(leagueMemberData);

            console.log(
              `✅ User ${userId} joined league ${league.id} with team ${team.id}`,
            );

            return team;
          }); // End transaction
        }); // End runWithPublicClient

        return result;
      } catch (error) {
        console.error('Error joining league:', error);
        throw new Error(
          `Failed to join league: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
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
        const result = await runWithPublicClient(getDbOptions(), async (db) => {
          // Wrap in transaction to ensure atomicity
          return await db.transaction(async (tx) => {
            // Get all leagues in the system (admin operation)
            const allLeagues = await tx
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
              await tx
                .delete(PublicSchema.teamMembers)
                .where(eq(PublicSchema.teamMembers.leagueId, leagueId));
            }

            // 2. Delete league positions
            for (const leagueId of leagueIds) {
              await tx
                .delete(PublicSchema.leaguePosition)
                .where(eq(PublicSchema.leaguePosition.leagueId, leagueId));
            }

            // 3. Delete league members
            for (const leagueId of leagueIds) {
              await tx
                .delete(PublicSchema.leagueMembers)
                .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));
            }

            // 4. Delete teams
            for (const leagueId of leagueIds) {
              await tx
                .delete(PublicSchema.teams)
                .where(eq(PublicSchema.teams.leagueId, leagueId));
            }

            // 5. Finally delete leagues
            for (const leagueId of leagueIds) {
              await tx
                .delete(PublicSchema.leagues)
                .where(eq(PublicSchema.leagues.id, leagueId));
            }

            return `Successfully deleted ${leagueIds.length} league(s) and all associated data`;
          }); // End transaction
        }); // End runWithPublicClient

        return result;
      } catch (error) {
        console.error('Error deleting leagues:', error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error('Failed to delete leagues: ' + errorMessage);
      }
    },
  }),
);

// Mutation field to delete a specific league (commissioner only)
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

      const { leagueId } = args;
      const userId = context.user.id;

      try {
        const result = await runWithPublicClient(getDbOptions(), async (db) => {
          // Wrap in transaction to ensure atomicity of cascade deletes
          return await db.transaction(async (tx) => {
            // Verify the league exists and user is the owner
            const league = await tx
              .select({
                id: PublicSchema.leagues.id,
                name: PublicSchema.leagues.name,
                owner: PublicSchema.leagues.owner,
              })
              .from(PublicSchema.leagues)
              .where(eq(PublicSchema.leagues.id, leagueId))
              .limit(1);

            if (league.length === 0) {
              throw new Error('League not found');
            }

            // Check if user is the league owner
            if (league[0].owner !== userId) {
              throw new Error('Only the league owner can delete the league');
            }

            const leagueName = league[0].name;

            // Delete in correct order due to foreign key constraints
            // 1. Delete matchup players first
            const matchupsForLeague = await tx
              .select({ id: PublicSchema.matchups.id })
              .from(PublicSchema.matchups)
              .where(eq(PublicSchema.matchups.leagueId, leagueId));

            for (const matchup of matchupsForLeague) {
              await tx
                .delete(PublicSchema.matchupPlayers)
                .where(eq(PublicSchema.matchupPlayers.matchupId, matchup.id));
            }

            // 2. Delete matchups
            await tx
              .delete(PublicSchema.matchups)
              .where(eq(PublicSchema.matchups.leagueId, leagueId));

            // 3. Delete draft teams
            const draftsForLeague = await tx
              .select({ id: PublicSchema.drafts.id })
              .from(PublicSchema.drafts)
              .where(eq(PublicSchema.drafts.leagueId, leagueId));

            for (const draft of draftsForLeague) {
              await tx
                .delete(PublicSchema.draftTeams)
                .where(eq(PublicSchema.draftTeams.draftId, draft.id));
            }

            // 4. Delete drafts
            await tx
              .delete(PublicSchema.drafts)
              .where(eq(PublicSchema.drafts.leagueId, leagueId));

            // 5. Delete team members
            await tx
              .delete(PublicSchema.teamMembers)
              .where(eq(PublicSchema.teamMembers.leagueId, leagueId));

            // 6. Delete league positions
            await tx
              .delete(PublicSchema.leaguePosition)
              .where(eq(PublicSchema.leaguePosition.leagueId, leagueId));

            // 7. Delete league members
            await tx
              .delete(PublicSchema.leagueMembers)
              .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));

            // 8. Delete teams
            await tx
              .delete(PublicSchema.teams)
              .where(eq(PublicSchema.teams.leagueId, leagueId));

            // 9. Finally delete the league
            await tx
              .delete(PublicSchema.leagues)
              .where(eq(PublicSchema.leagues.id, leagueId));

            return `Successfully deleted league "${leagueName}" and all associated data`;
          }); // End transaction
        }); // End runWithPublicClient

        return result;
      } catch (error) {
        console.error('Error deleting league:', error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error('Failed to delete league: ' + errorMessage);
      }
    },
  }),
);

// Position validation constants - must match ALLOWED_POSITIONS in shared-components
const PITCHING_POSITIONS = new Set(['SP', 'RP']);
const BATTING_POSITIONS = new Set([
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
]);

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
        // Update team member position with validation
        const updatedMember = await runWithPublicClient(
          getDbOptions(),
          async (db) => {
            // First verify user has access to this team member
            const memberAccess = await db
              .select({
                teamMemberId: PublicSchema.teamMembers.id,
                playerId: PublicSchema.teamMembers.playerId,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
              })
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

            const member = memberAccess[0];

            // If setting a position (not clearing it), validate eligibility
            if (positionId !== null && positionId !== undefined) {
              // Get the position type
              const position = await db
                .select({
                  positionType: PublicSchema.leaguePosition.positionType,
                })
                .from(PublicSchema.leaguePosition)
                .where(eq(PublicSchema.leaguePosition.id, positionId))
                .limit(1);

              if (position.length === 0) {
                throw new Error('Invalid position ID');
              }

              const positionType = position[0].positionType;
              const isPitchingSlot = PITCHING_POSITIONS.has(positionType);
              const isBattingSlot =
                BATTING_POSITIONS.has(positionType) ||
                positionType === 'IF' ||
                positionType === 'OF' ||
                positionType === 'XDH';

              // Get player's eligible positions
              const eligiblePositions = await db
                .select({
                  position: PublicSchema.playerEligiblePositions.position,
                })
                .from(PublicSchema.playerEligiblePositions)
                .where(
                  eq(
                    PublicSchema.playerEligiblePositions.playerId,
                    member.playerId,
                  ),
                );

              const playerPositions = new Set(
                eligiblePositions.map((p) => p.position),
              );
              const isPitcher = Array.from(playerPositions).some((pos) =>
                PITCHING_POSITIONS.has(pos),
              );
              const isBatter = Array.from(playerPositions).some((pos) =>
                BATTING_POSITIONS.has(pos),
              );

              // Validate: pitchers cannot play batting slots, batters cannot play pitching slots
              if (isPitchingSlot && !isPitcher) {
                throw new Error(
                  `This player is not eligible for pitching positions (${positionType}). Only pitchers can be assigned to SP/RP slots.`,
                );
              }

              if (isBattingSlot && isPitcher && !isBatter) {
                throw new Error(
                  `This player is a pitcher and cannot be assigned to batting positions (${positionType}). Pitchers can only play SP/RP slots.`,
                );
              }

              // Additional check: player must have at least one position that matches the slot
              const ALLOWED_POSITIONS: Record<string, string[]> = {
                '1B': ['1B'],
                '2B': ['2B'],
                '3B': ['3B'],
                C: ['C'],
                CF: ['CF'],
                DH: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'],
                IF: ['1B', '2B', '3B', 'SS'],
                LF: ['LF'],
                OF: ['LF', 'RF', 'CF'],
                RF: ['RF'],
                RP: ['RP', 'P'],
                SP: ['SP', 'P'],
                SS: ['SS'],
                XDH: ['DH'],
              };

              const allowedForSlot = ALLOWED_POSITIONS[positionType] || [];
              const hasMatchingPosition = allowedForSlot.some((allowedPos) => {
                // Check if player has this position (with type-safe comparison)
                for (const playerPos of playerPositions) {
                  if (playerPos === allowedPos) return true;
                }
                return false;
              });

              if (!hasMatchingPosition) {
                throw new Error(
                  `This player is not eligible for the ${positionType} position. Player positions: ${Array.from(playerPositions).join(', ')}`,
                );
              }
            }

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
          },
        );

        return updatedMember;
      } catch (error) {
        console.error('Error updating team member position:', error);
        if (error instanceof Error) {
          throw error; // Re-throw with original message for validation errors
        }
        throw new Error('Failed to update team member position');
      }
    },
  }),
);
