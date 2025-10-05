import { createDatabaseService, runWithPublicClient, PublicSchema, CreateLeagueInput, CreateTeamInput, CreateLeagueMemberInput, League as DbLeague, Team as DbTeam, LeagueMember as DbLeagueMember } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { builder } from './builder';
import { eq, and } from 'drizzle-orm';

// Create a single database service instance to reuse across all resolvers
const dbService = createDatabaseService(getDbOptions());

// League type - matches database schema with proper nullability
const League = builder.objectRef<{
  id: number;
  name: string;
  owner: number;
  maxRosterSize: number;
  currentMatchup: number | null;
}>('League');

League.implement({
  description: 'A fantasy sports league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
    owner: t.exposeInt('owner'),
    maxRosterSize: t.exposeInt('maxRosterSize'),
    currentMatchup: t.exposeInt('currentMatchup', { nullable: true }),
  }),
});

// Team type
const Team = builder.objectRef<DbTeam>('Team');

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

// Input types for mutations
const CreateLeagueAndTeamsInput = builder.inputType('CreateLeagueAndTeamsInput', {
  fields: (t) => ({
    leagueName: t.string({ required: true }),
    numberOfTeams: t.int({ required: true }),
    draftType: t.string({ required: true }), // 'NORMAL' | 'BLIND' | 'LEGACY'
    isPublic: t.boolean({ required: false }),
    maxBatters: t.int({ required: false }),
    maxPitchers: t.int({ required: false }),
    tradingEnabled: t.boolean({ required: false }),
    waiverEnabled: t.boolean({ required: false }),
    startDate: t.string({ required: false }), // ISO date string
  }),
});

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
      resolve: (parent) => parent.league,
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
                eq(PublicSchema.leagueMembers.userId, userId)
              )
            )
            .limit(1);

          if (memberCheck.length === 0) {
            throw new Error('Access denied: You are not a member of this league');
          }

          // Get the league details
          const results = await db
            .select({
              id: PublicSchema.leagues.id,
              name: PublicSchema.leagues.name,
              owner: PublicSchema.leagues.owner,
              maxRosterSize: PublicSchema.leagues.maxRosterSize,
              currentMatchup: PublicSchema.leagues.currentMatchup,
            })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, leagueId))
            .limit(1);

          if (results.length === 0) {
            return null;
          }

          const league = results[0];
          return {
            id: league.id,
            name: league.name,
            owner: league.owner,
            maxRosterSize: league.maxRosterSize,
            currentMatchup: league.currentMatchup,
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
  })
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
        const userLeagues = await runWithPublicClient(getDbOptions(), async (db) => {
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
              })
              .from(PublicSchema.leagues)
              .limit(5);
            
            console.log(`Found ${allLeagues.length} total leagues in database`);
            
            // Check if leagueMembers table has any data
            const membershipCount = await db
              .select()
              .from(PublicSchema.leagueMembers)
              .limit(5);
            
            console.log(`Found ${membershipCount.length} league memberships in database`);
            
            // Try the actual query
            const results = await db
              .select({
                id: PublicSchema.leagues.id,
                name: PublicSchema.leagues.name,
                owner: PublicSchema.leagues.owner,
                maxRosterSize: PublicSchema.leagues.maxRosterSize,
                currentMatchup: PublicSchema.leagues.currentMatchup,
              })
              .from(PublicSchema.leagues)
              .innerJoin(
                PublicSchema.leagueMembers,
                eq(PublicSchema.leagues.id, PublicSchema.leagueMembers.leagueId)
              )
              .where(eq(PublicSchema.leagueMembers.userId, userId))
              .orderBy(PublicSchema.leagues.id);

            console.log(`Found ${results.length} leagues for user ${userId}`);

            return results.map(league => ({
              id: league.id,
              name: league.name,
              owner: league.owner,
              maxRosterSize: league.maxRosterSize,
              currentMatchup: league.currentMatchup,
            }));
            
          } catch (dbError) {
            console.error('Database query error:', dbError);
            // Return empty array instead of throwing to help diagnose
            return [];
          }
        });

        return userLeagues;
      } catch (error) {
        console.error('Error fetching user leagues:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          userId,
          context: context.user ? 'User authenticated' : 'User not authenticated'
        });
        
        // For now, return empty array instead of throwing to help with debugging
        console.log('Returning empty array due to error');
        return [];
      }
    },
  })
);

// Mutation fields
builder.mutationField('createLeagueAndTeams', (t) =>
  t.field({
    type: CreateLeagueAndTeamsPayload,
    args: {
      input: t.arg({ type: CreateLeagueAndTeamsInput, required: true }),
    },
    resolve: async (parent, args, context) => {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required to create a league');
      }

      const { leagueName, maxBatters = 12, maxPitchers = 8 } = args.input;
      const userId = context.user.id;
      const username = context.user.username || 'User';
      
      try {
        // Create league and team in the database with proper types
        const result = await runWithPublicClient(getDbOptions(), async (db) => {
          // Prepare league data for insert
          const leagueData = {
            name: leagueName,
            owner: userId,
            maxRosterSize: (maxBatters || 12) + (maxPitchers || 8),
            currentMatchup: null,
          };

          // Insert league
          const insertedLeagues = await db.insert(PublicSchema.leagues)
            .values(leagueData)
            .returning({
              id: PublicSchema.leagues.id,
              name: PublicSchema.leagues.name,
              owner: PublicSchema.leagues.owner,
              maxRosterSize: PublicSchema.leagues.maxRosterSize,
              currentMatchup: PublicSchema.leagues.currentMatchup,
            });

          const league = insertedLeagues[0];

          // Prepare team data for insert
          const teamData = {
            name: `${username}'s Team`,
            leagueId: league.id,
          };

          // Insert team
          const insertedTeams = await db.insert(PublicSchema.teams)
            .values(teamData)
            .returning({
              id: PublicSchema.teams.id,
              name: PublicSchema.teams.name,
              leagueId: PublicSchema.teams.leagueId,
            });

          const team = insertedTeams[0];

          // Prepare league member data for insert  
          const leagueMemberData = {
            leagueId: league.id,
            userId: userId,
            teamId: team.id,
            permissionLevel: 'owner' as const,
          };

          // Insert league member
          await db.insert(PublicSchema.leagueMembers)
            .values(leagueMemberData);

          return {
            league: {
              id: league.id,
              name: league.name,
              owner: league.owner,
              maxRosterSize: league.maxRosterSize,
              currentMatchup: league.currentMatchup,
            },
            teams: [{
              id: team.id,
              name: team.name,
              leagueId: team.leagueId,
            }],
            leagueMembers: [{
              leagueId: league.id,
              userId: userId,
              teamId: team.id,
              permissionLevel: 'owner' as const,
            }],
          };
        });

        return result;
      } catch (error) {
        console.error('Error creating league and teams:', error);
        throw new Error('Failed to create league and teams');
      }
    },
  })
);
