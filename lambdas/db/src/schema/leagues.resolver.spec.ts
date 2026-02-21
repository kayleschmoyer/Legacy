import { eq } from 'drizzle-orm';
import type { GraphQLSchema } from 'graphql';
// Removed graphql import - testing resolvers directly to avoid module realm conflicts

describe('League Mutations', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;
  let mockCreateLeague: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    mockCreateLeague = jest.fn();

    // Mock database operations
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
    };

    // Mock database utilities
    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    // Mock the database client
    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(), // Mock database service initialization
      runWithPublicClient: jest.fn(async (options, callback) => {
        return callback(mockDb);
      }),
      createLeagueService: jest.fn(() => ({
        createLeague: mockCreateLeague,
      })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      PublicSchema: {
        leagues: {
          id: 'id',
          owner: 'owner',
          name: 'name',
        },
        teams: {
          id: 'id',
          leagueId: 'leagueId',
        },
        teamMembers: {
          id: 'id',
          leagueId: 'leagueId',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
        },
        leaguePosition: {
          id: 'id',
          leagueId: 'leagueId',
        },
      },
    }));

    // Load the schema after mocks are set up
    // Note: Do NOT use jest.isolateModules() as it creates a separate module realm
    // which causes "Cannot use GraphQLSchema from another module or realm" errors
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    // Default authenticated user context
    mockContext = {
      user: {
        id: 1,
        isAdmin: false,
      },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deleteLeague mutation', () => {
    const deleteLeagueMutation = `
      mutation DeleteLeague($leagueId: Int!) {
        deleteLeague(leagueId: $leagueId)
      }
    `;

    it('should successfully delete a league when user is the owner', async () => {
      // Mock league exists and user is owner
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ id: 1, owner: 1 }]);

      // Mock delete operations
      mockDb.delete.mockReturnValue(mockDb);

      const mutationType = schema.getMutationType();
      const deleteLeagueField = mutationType?.getFields().deleteLeague;
      if (!deleteLeagueField?.resolve) {
        throw new Error('deleteLeague resolver not found');
      }

      const result = await deleteLeagueField.resolve(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(
        'Successfully deleted league 1 and all associated data',
      );

      // Verify delete was called once (CASCADE DELETE handles the rest)
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });

    it('should successfully delete a league when user is admin', async () => {
      // Mock league exists but user is not owner, but is admin
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ id: 1, owner: 999 }]);

      // Mock delete operations
      mockDb.delete.mockReturnValue(mockDb);

      const adminContext = {
        user: {
          id: 1,
          isAdmin: true,
        },
        db: mockDb,
      };

      const mutationType = schema.getMutationType();
      const deleteLeagueField = mutationType?.getFields().deleteLeague;
      if (!deleteLeagueField?.resolve) {
        throw new Error('deleteLeague resolver not found');
      }

      const result = await deleteLeagueField.resolve(
        {},
        { leagueId: 1 },
        adminContext,
        undefined as never,
      );

      expect(result).toBe(
        'Successfully deleted league 1 and all associated data',
      );
    });

    it('should fail when user is not authenticated', async () => {
      const unauthenticatedContext = {
        user: null,
      };

      const mutationType = schema.getMutationType();
      const deleteLeagueField = mutationType?.getFields().deleteLeague;
      if (!deleteLeagueField?.resolve) {
        throw new Error('deleteLeague resolver not found');
      }

      await expect(
        deleteLeagueField.resolve(
          {},
          { leagueId: 1 },
          unauthenticatedContext,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required to delete league');
    });

    it('should fail when league does not exist', async () => {
      // Mock league not found
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);

      const mutationType = schema.getMutationType();
      const deleteLeagueField = mutationType?.getFields().deleteLeague;
      if (!deleteLeagueField?.resolve) {
        throw new Error('deleteLeague resolver not found');
      }

      await expect(
        deleteLeagueField.resolve(
          {},
          { leagueId: 999 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('League not found');
    });

    it('should fail when user is not the owner and not admin', async () => {
      // Mock league exists but user is not owner and not admin
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ id: 1, owner: 999 }]);

      const mutationType = schema.getMutationType();
      const deleteLeagueField = mutationType?.getFields().deleteLeague;
      if (!deleteLeagueField?.resolve) {
        throw new Error('deleteLeague resolver not found');
      }

      await expect(
        deleteLeagueField.resolve(
          {},
          { leagueId: 1 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(
        'Only the league owner or admin can delete this league',
      );
    });

    it('should delete league using CASCADE DELETE constraints', async () => {
      // Mock league exists and user is owner
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ id: 1, owner: 1 }]);

      const deleteCallOrder: string[] = [];

      // Track delete calls - should only delete from leagues table
      // CASCADE DELETE handles all related data automatically
      mockDb.delete.mockImplementation(() => {
        deleteCallOrder.push('leagues');
        return mockDb;
      });

      const mutationType = schema.getMutationType();
      const deleteLeagueField = mutationType?.getFields().deleteLeague;
      if (!deleteLeagueField?.resolve) {
        throw new Error('deleteLeague resolver not found');
      }

      await deleteLeagueField.resolve(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      // Verify only leagues table is deleted (CASCADE handles the rest)
      expect(deleteCallOrder).toEqual(['leagues']);
    });

    it('should handle database errors gracefully', async () => {
      // Mock league exists
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ id: 1, owner: 1 }]);

      // Mock delete operation throwing error
      mockDb.delete.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const mutationType = schema.getMutationType();
      const deleteLeagueField = mutationType?.getFields().deleteLeague;
      if (!deleteLeagueField?.resolve) {
        throw new Error('deleteLeague resolver not found');
      }

      await expect(
        deleteLeagueField.resolve(
          {},
          { leagueId: 1 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Failed to delete league');
    });
  });

  describe('deleteAllLeagues mutation', () => {
    const deleteAllLeaguesMutation = `
      mutation DeleteAllLeagues {
        deleteAllLeagues
      }
    `;

    it('should fail when user is not authenticated', async () => {
      const unauthenticatedContext = {
        user: null,
      };

      const mutationType = schema.getMutationType();
      const deleteAllLeaguesField = mutationType?.getFields().deleteAllLeagues;
      if (!deleteAllLeaguesField?.resolve) {
        throw new Error('deleteAllLeagues resolver not found');
      }

      await expect(
        deleteAllLeaguesField.resolve(
          {},
          {},
          unauthenticatedContext,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required to delete leagues');
    });

    it('should fail when user is not admin', async () => {
      const mutationType = schema.getMutationType();
      const deleteAllLeaguesField = mutationType?.getFields().deleteAllLeagues;
      if (!deleteAllLeaguesField?.resolve) {
        throw new Error('deleteAllLeagues resolver not found');
      }

      await expect(
        deleteAllLeaguesField.resolve({}, {}, mockContext, undefined as never),
      ).rejects.toThrow('Admin access required to delete all leagues');
    });

    it('should successfully delete all leagues when user is admin', async () => {
      const adminContext = {
        user: {
          id: 1,
          isAdmin: true,
        },
        db: mockDb,
      };

      // Mock the SELECT query that fetches all leagues
      // The resolver does: db.select({id: ...}).from(PublicSchema.leagues)
      // The final .from() call returns the array of leagues
      const mockLeagues = [{ id: 1 }, { id: 2 }, { id: 3 }];

      // Set up the query chain to return the leagues array
      mockDb.select.mockReturnValueOnce(mockDb);
      mockDb.from.mockResolvedValueOnce(mockLeagues);

      // Mock delete operations (these return mockDb for chaining)
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(undefined);

      const mutationType = schema.getMutationType();
      const deleteAllLeaguesField = mutationType?.getFields().deleteAllLeagues;
      if (!deleteAllLeaguesField?.resolve) {
        throw new Error('deleteAllLeagues resolver not found');
      }

      const result = await deleteAllLeaguesField.resolve(
        {},
        {},
        adminContext,
        undefined as never,
      );

      // Updated to match actual resolver return message
      expect(result).toContain(
        'Successfully deleted 3 league(s) and all associated data',
      );
    });
  });

  describe('createLeague mutation', () => {
    const createLeagueMutation = `
      mutation CreateLeague($name: String!, $maxRosterSize: Int) {
        createLeague(name: $name, maxRosterSize: $maxRosterSize) {
          id
          name
          maxRosterSize
        }
      }
    `;

    it('should fail when user is not authenticated', async () => {
      const unauthenticatedContext = {
        user: null,
      };

      const mutationType = schema.getMutationType();
      const createLeagueField = mutationType?.getFields().createLeague;
      if (!createLeagueField?.resolve) {
        throw new Error('createLeague resolver not found');
      }

      await expect(
        createLeagueField.resolve(
          {},
          { name: 'Test League' },
          unauthenticatedContext,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('should create a league with default roster size', async () => {
      // Mock the LeagueService.createLeague method
      mockCreateLeague.mockResolvedValueOnce({
        league: {
          id: 1,
          name: 'Test League',
          maxRosterSize: 25,
          owner: 1,
          currentMatchup: null,
          draftStatus: 'not-started',
          inviteCode: 'ABCD1234',
          playerPool: 'all',
        },
        teams: [],
        leagueMembers: [],
      });

      const mutationType = schema.getMutationType();
      const createLeagueField = mutationType?.getFields().createLeague;
      if (!createLeagueField?.resolve) {
        throw new Error('createLeague resolver not found');
      }

      const result = await createLeagueField.resolve(
        {},
        { name: 'Test League' },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({
        id: 1,
        name: 'Test League',
        maxRosterSize: 25,
      });
    });

    it('should create a league with custom roster size', async () => {
      // Mock the LeagueService.createLeague method
      mockCreateLeague.mockResolvedValueOnce({
        league: {
          id: 1,
          name: 'Test League',
          maxRosterSize: 30,
          owner: 1,
          currentMatchup: null,
          draftStatus: 'not-started',
          inviteCode: 'ABCD1234',
          playerPool: 'all',
        },
        teams: [],
        leagueMembers: [],
      });

      const mutationType = schema.getMutationType();
      const createLeagueField = mutationType?.getFields().createLeague;
      if (!createLeagueField?.resolve) {
        throw new Error('createLeague resolver not found');
      }

      const result = await createLeagueField.resolve(
        {},
        { name: 'Test League', maxRosterSize: 30 },
        mockContext,
        undefined as never,
      );

      expect((result as any)?.maxRosterSize).toBe(30);
    });
  });

  describe('joinLeague mutation', () => {
    const joinLeagueMutation = `
      mutation JoinLeague($inviteCode: String!, $teamName: String!) {
        joinLeague(inviteCode: $inviteCode, teamName: $teamName) {
          success
          message
          leagueId
          teamId
        }
      }
    `;

    it('should fail when user is not authenticated', async () => {
      const unauthenticatedContext = {
        user: null,
      };

      const mutationType = schema.getMutationType();
      const joinLeagueField = mutationType?.getFields().joinLeague;
      if (!joinLeagueField?.resolve) {
        throw new Error('joinLeague resolver not found');
      }

      await expect(
        joinLeagueField.resolve(
          {},
          { inviteCode: 'ABC12345', teamName: 'My Team' },
          unauthenticatedContext,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('should fail when invite code is invalid', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);

      const mutationType = schema.getMutationType();
      const joinLeagueField = mutationType?.getFields().joinLeague;
      if (!joinLeagueField?.resolve) {
        throw new Error('joinLeague resolver not found');
      }

      await expect(
        joinLeagueField.resolve(
          {},
          { inviteCode: 'INVALID', teamName: 'My Team' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Invalid invite code');
    });
  });
});
