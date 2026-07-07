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
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
    };

    // Mock database utilities. Spread the real module so entitlement constants
    // and helpers (ENTITLEMENTS, tierHasEntitlement, ENTITLEMENT_LABELS) used by
    // the resolver's entitlement checks resolve correctly (LS-5197).
    jest.doMock('@legacy-sports/utils', () => ({
      ...jest.requireActual('@legacy-sports/utils'),
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
          permissionLevel: 'permissionLevel',
        },
        drafts: {
          id: 'id',
          leagueId: 'leagueId',
          draftMode: 'draftMode',
          selectionMethod: 'selectionMethod',
          draftOrder: 'draftOrder',
          createdAt: 'createdAt',
        },
        leaguePosition: {
          id: 'id',
          leagueId: 'leagueId',
        },
        // Needed by checkAdminInDb (admin systemWide path, LS-8240).
        users: {
          id: 'id',
          accessLevel: 'accessLevel',
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    // Load the schema after mocks are set up
    // Note: Do NOT use jest.isolateModules() as it creates a separate module realm
    // which causes "Cannot use GraphQLSchema from another module or realm" errors
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
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
      // Mock league exists but user is not the owner, but is admin
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
      // Mock league exists but user is not the owner and not admin
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
      // Mock league exists and user is the owner
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

    it('should succeed when the league is referenced as previous_league_id by another league', async () => {
      // Regression test for LS-4406 / Rollbar #72:
      // The leagues_previous_league_id_fk constraint lacked ON DELETE, so deleting
      // a prior-season league failed with a FK violation. The migration
      // 20260514_000000_fix_leagues_previous_league_id_cascade re-creates the
      // constraint with ON DELETE SET NULL, so the delete now succeeds and the
      // referencing league's previous_league_id becomes NULL automatically.
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ id: 1, owner: 1 }]);

      // The DB handles SET NULL on previous_league_id for leagues that referenced
      // this one — the resolver makes exactly one delete call.
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
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
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

    // deleteLeaguesAtomically wraps the deletes in `db.transaction(cb)`; give the
    // shared mock a transaction that just runs the callback against the same
    // mockDb so the resolver's delete loop resolves (LS-8099 introduced the
    // transaction; the mock predates it).
    const getResolver = () => {
      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().deleteAllLeagues;
      if (!field?.resolve) {
        throw new Error('deleteAllLeagues resolver not found');
      }
      return field.resolve;
    };

    it('should delete only own leagues for a non-admin user', async () => {
      // Non-admin users can delete their own leagues (where they are the owner)
      const mockLeagues = [{ id: 1 }, { id: 2 }];

      // Owner-only path: .select().from().where() — no innerJoin (owner is always a member)
      mockDb.transaction = jest.fn(async (cb: any) => cb(mockDb));
      mockDb.select.mockReturnValueOnce(mockDb);
      mockDb.from.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce(mockLeagues);

      // Mock delete operations (these return mockDb for chaining)
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(undefined);

      const result = await getResolver()(
        {},
        {},
        mockContext,
        undefined as never,
      );

      expect(result).toContain(
        'Successfully deleted 2 league(s) and all associated data',
      );
      expect(mockDb.innerJoin).not.toHaveBeenCalled();
    });

    // LS-8240: an admin caller with NO systemWide flag must get owner-only
    // behavior — the broad member-of purge is now opt-in, so the default can
    // never wipe leagues the admin merely joined.
    it('should delete only own leagues for an admin when systemWide is omitted', async () => {
      const adminContext = {
        user: { id: 1, isAdmin: true },
        db: mockDb,
      };
      const mockLeagues = [{ id: 1 }, { id: 2 }];

      mockDb.transaction = jest.fn(async (cb: any) => cb(mockDb));
      mockDb.select.mockReturnValueOnce(mockDb);
      mockDb.from.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce(mockLeagues);
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(undefined);

      const result = await getResolver()(
        {},
        {},
        adminContext,
        undefined as never,
      );

      expect(result).toContain(
        'Successfully deleted 2 league(s) and all associated data',
      );
      // Owner-only path takes no member join, and checkAdminInDb is short-
      // circuited by the falsy systemWide flag (no admin DB lookup).
      expect(mockDb.innerJoin).not.toHaveBeenCalled();
    });

    // LS-8240: with explicit systemWide: true, an admin opts into the member-of
    // purge (every league the admin is a member of, via the member join).
    it('should delete all member-of leagues for an admin when systemWide is true', async () => {
      const adminContext = {
        user: { id: 1, isAdmin: true },
        db: mockDb,
      };
      const mockLeagues = [{ id: 1 }, { id: 2 }, { id: 3 }];

      mockDb.transaction = jest.fn(async (cb: any) => cb(mockDb));
      // checkAdminInDb: .select().from().where().limit(1) resolves to an admin
      // row. `where` stays chainable (default mockReturnThis) so `.limit()`
      // resolves; the delete loop's `tx.delete().where()` return is unused.
      mockDb.limit.mockResolvedValueOnce([{ accessLevel: 'admin' }]);
      // League query (system-wide): .select().from().innerJoin() resolves the set.
      mockDb.innerJoin.mockResolvedValueOnce(mockLeagues);
      mockDb.delete.mockReturnValue(mockDb);

      const result = await getResolver()(
        {},
        { systemWide: true },
        adminContext,
        undefined as never,
      );

      expect(result).toContain(
        'Successfully deleted 3 league(s) and all associated data',
      );
      expect(mockDb.innerJoin).toHaveBeenCalled();
    });

    // LS-8240: a non-admin cannot escalate to the system-wide purge even by
    // passing systemWide: true — checkAdminInDb gates it, so they get owner-only.
    it('should ignore systemWide for a non-admin caller', async () => {
      const mockLeagues = [{ id: 1 }];

      mockDb.transaction = jest.fn(async (cb: any) => cb(mockDb));
      mockDb.select.mockReturnValueOnce(mockDb);
      mockDb.from.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce(mockLeagues);
      mockDb.delete.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(undefined);

      const result = await getResolver()(
        {},
        { systemWide: true },
        mockContext,
        undefined as never,
      );

      expect(result).toContain(
        'Successfully deleted 1 league(s) and all associated data',
      );
      expect(mockDb.innerJoin).not.toHaveBeenCalled();
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
      // Return premium tier so free-tier gating is skipped
      mockDb.limit.mockResolvedValue([{ tier: 'premium' }]);
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
      // Return premium tier so free-tier gating is skipped
      mockDb.limit.mockResolvedValue([{ tier: 'premium' }]);
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

    it('should default sport to baseball when not provided (LS-4628)', async () => {
      mockDb.limit.mockResolvedValue([{ tier: 'premium' }]);
      mockCreateLeague.mockResolvedValueOnce({
        league: {
          id: 1,
          name: 'Test League',
          sport: 'baseball',
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

      await createLeagueField.resolve(
        {},
        { name: 'Test League' },
        mockContext,
        undefined as never,
      );

      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ sport: 'baseball' }),
      );
    });

    it('should persist football sport when provided (LS-4628)', async () => {
      mockDb.limit.mockResolvedValue([{ tier: 'premium' }]);
      mockCreateLeague.mockResolvedValueOnce({
        league: {
          id: 2,
          name: 'Gridiron Dynasty',
          sport: 'football',
          maxRosterSize: 25,
          owner: 1,
          currentMatchup: null,
          draftStatus: 'not-started',
          inviteCode: 'FOOT1234',
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
        { name: 'Gridiron Dynasty', sport: 'football' },
        mockContext,
        undefined as never,
      );

      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ sport: 'football' }),
      );
      expect((result as any)?.sport).toBe('football');
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

  describe('joinPublicLeague mutation', () => {
    it('should throw UNAUTHENTICATED when no user', async () => {
      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().joinPublicLeague;
      if (!field?.resolve) {
        throw new Error('joinPublicLeague resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { leagueId: 1, teamName: 'My Team' },
          { user: null, db: mockDb },
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('should re-throw an Error when a database error occurs', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockRejectedValue(new Error('DB connection failed'));

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().joinPublicLeague;
      if (!field?.resolve) {
        throw new Error('joinPublicLeague resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { leagueId: 1, teamName: 'My Team' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('DB connection failed');
    });
  });

  describe('updateLeagueSettings mutation', () => {
    it('should fail when user is not authenticated', async () => {
      const unauthenticatedContext = { user: null };

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: { leagueId: 1 } },
          unauthenticatedContext,
          undefined as never,
        ),
      ).rejects.toThrow();
    });

    it('should fail when caller is not a member of the league', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: { leagueId: 1 } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('You are not a member of this league');
    });

    it('should fail when caller is an assistant_manager (LS-2502)', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'assistant_manager' },
      ]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: { leagueId: 1, salaryCap: 1_000_000 } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(
        'Only a general manager or commissioner can update league settings',
      );
    });

    it('should require salary_cap_leagues entitlement to change salaryCap on a cap-enabled league (LS-5197)', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      // 1) membership lookup → commissioner, 2) current league cap state →
      // enabled, 3) subscription tier lookup → free (no entitlement)
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([{ salaryCapEnabled: true }])
        .mockResolvedValueOnce([{ tier: 'free' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: { leagueId: 1, salaryCap: 1 } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(/Salary cap leagues requires an upgraded subscription/);
    });

    it('should require salary_cap_leagues entitlement to change other cap sub-fields on a cap-enabled league (LS-5197)', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([{ salaryCapEnabled: true }])
        .mockResolvedValueOnce([{ tier: 'free' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          {
            input: {
              leagueId: 1,
              salaryFloor: 100,
              luxuryTaxThreshold: 200,
              minSalary: 5,
              salaryEscalationPct: 10,
              salaryDecayPct: 5,
            },
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(/Salary cap leagues requires an upgraded subscription/);
    });

    it('should require advanced_playoff_formats entitlement with a descriptive message when setting a 6-team playoff format (LS-5974)', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      // 1) membership lookup → commissioner, 2) subscription tier lookup → free
      // (no entitlement). The playoffFormat block reads no "current" value, so
      // the tier lookup is the only DB read before the gate fires.
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([{ tier: 'free' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: { leagueId: 1, playoffFormat: '6-team' } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(
        'Advanced playoff formats require a premium subscription.',
      );
    });

    it('should NOT require entitlement to change cap sub-fields when the league cap is disabled (LS-5197)', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      // update/set are only exercised on the write path, which the other
      // updateLeagueSettings specs never reach — add them locally here.
      mockDb.update = jest.fn().mockReturnThis();
      mockDb.set = jest.fn().mockReturnThis();
      // 1) membership lookup → commissioner, 2) current league cap state →
      // disabled (no tier lookup expected — the gate must not fire)
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([{ salaryCapEnabled: false }]);
      // update returning → updated league; chat-message insert returning → row
      mockDb.returning
        .mockResolvedValueOnce([
          { id: 1, salaryCap: 5, salaryCapEnabled: false },
        ])
        .mockResolvedValueOnce([{ id: 10, timestamp: 't' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      const result = await field.resolve(
        {},
        { input: { leagueId: 1, salaryCap: 5 } },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual({ id: 1, salaryCap: 5, salaryCapEnabled: false });
    });

    it('should reject faabBudgetDefault on a standard-waiver league (LS-5175)', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      // 1) GM membership lookup, 2) current waiverType lookup
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'general_manager' }])
        .mockResolvedValueOnce([{ waiverType: 'standard' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: { leagueId: 1, faabBudgetDefault: 500 } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('FAAB budget can only be set on leagues using FAAB');
    });

    it('should reject faabBudgetDefault on a FAAB league for a free-tier GM without the entitlement (LS-5175)', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      // 1) GM membership, 2) current waiverType=faab, 3) subscription tier=free
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'general_manager' }])
        .mockResolvedValueOnce([{ waiverType: 'faab' }])
        .mockResolvedValueOnce([{ tier: 'free' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().updateLeagueSettings;
      if (!field?.resolve) {
        throw new Error('updateLeagueSettings resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: { leagueId: 1, faabBudgetDefault: 500 } },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('FAAB waiver type requires a premium subscription');
    });
  });

  describe('startDraft mutation', () => {
    it('should fail when user is not authenticated', async () => {
      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { leagueId: 1 },
          { user: null, db: mockDb },
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required to start draft');
    });

    it('should throw ForbiddenError when user is not a league member (LS-2496)', async () => {
      // leagueMembers lookup returns empty — user is not a member
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      await expect(
        field.resolve({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Only the league Commissioner can start the draft');
    });

    it('should throw ForbiddenError when user is an assistant_manager (LS-2496)', async () => {
      // leagueMembers lookup returns an assistant_manager — not authorized
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([
        { permissionLevel: 'assistant_manager' },
      ]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      await expect(
        field.resolve({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Only the league Commissioner can start the draft');
    });

    it('should throw ForbiddenError when user is a general_manager (LS-5145)', async () => {
      // GMs are not authorized to start the draft — only the commissioner is
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ permissionLevel: 'general_manager' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      await expect(
        field.resolve({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Only the league Commissioner can start the draft');
    });

    it('should not throw ForbiddenError when user is a commissioner (LS-2496)', async () => {
      // First select: leagueMembers returns commissioner.
      // Second select: leagues existence check returns the league.
      // Third select: drafts table (savedDraft) returns empty.
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.orderBy = jest.fn().mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      // The resolver wraps downstream errors as
      // 'Failed to start draft: ...'. We only care that it did NOT throw
      // ForbiddenError (i.e. authorization passed). Any other failure mode
      // from the heavily mocked DraftService is acceptable here.
      await expect(
        field.resolve({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.not.toThrow('Only the league Commissioner can start the draft');
    });

    it('should throw UserInputError when the league does not exist (LS-8223)', async () => {
      // Commissioner check passes (orphaned leagueMembers row), but leagues
      // table has no matching row — should return BAD_USER_INPUT, not a Rollbar error.
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([]); // league not found

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      await expect(
        field.resolve({}, { leagueId: 6170 }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('should preserve a GraphQLError code thrown inside the try block instead of rewrapping it (LS-5156)', async () => {
      // Commissioner passes the access gate; league exists; savedDraft empty so
      // the resolver calls createDraftForLeague, which we make throw a GraphQLError.
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.orderBy = jest.fn().mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([]);

      // Resolve graphql + the mocked db-client AFTER the post-resetModules
      // schema load so the GraphQLError instance shares the same module realm
      // as the resolver's `instanceof GraphQLError` check, and so the mock
      // reference matches the one the resolver imported.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require in the resolver's module realm
      const { GraphQLError } = require('graphql');
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require in the resolver's module realm
      const { createDraftForLeague } = require('@legacy-sports/db-client');
      (createDraftForLeague as jest.Mock).mockRejectedValueOnce(
        new GraphQLError('Premium subscription required', {
          extensions: { code: 'PREMIUM_REQUIRED' },
        }),
      );

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      // Before the fix, the catch block rewrapped this as a plain Error with
      // no extensions.code; after the fix the original GraphQLError (and its
      // code) is preserved.
      await expect(
        field.resolve({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });
    });

    it('surfaces the underlying failure reason as a DRAFT_START_FAILED GraphQLError instead of masking it (LS-8239)', async () => {
      // Three sequential .limit(1) reads before the try block:
      //   1) commissioner membership check (passes the access gate),
      //   2) leagueExists guard (league present, so it does NOT short-circuit),
      //   3) savedDraft lookup (empty → resolver calls createDraftForLeague).
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.orderBy = jest.fn().mockReturnValue(mockDb);
      mockDb.limit
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([{ id: 1 }])
        .mockResolvedValueOnce([]);

      // Drive a non-GraphQLError, non-user-input failure by making
      // createDraftForLeague reject with a *plain* Error. This is the masked
      // scenario LS-8239 targets: an unexpected error that the formatter would
      // otherwise turn into a generic "Internal server error". (User-input
      // failures are separately classified as BAD_USER_INPUT by LS-8098.) A
      // plain Error is never an `instanceof GraphQLError`, so it flows into the
      // catch's rewrap path regardless of the jest module realm.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- match the resolver's module realm
      const { createDraftForLeague } = require('@legacy-sports/db-client');
      (createDraftForLeague as jest.Mock).mockRejectedValueOnce(
        new Error('Draft queue URL not configured'),
      );

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().startDraft;
      if (!field?.resolve) {
        throw new Error('startDraft resolver not found');
      }

      // The real reason must reach the GraphQL layer with a stable code so the
      // DRAFT_START_FAILED entry in CLIENT_FACING_CODES lets the formatter pass
      // the message through to the client (self-diagnosing integration tests).
      // Asserting on message + extensions.code (not `instanceof`) keeps this
      // robust regardless of the jest module realm.
      await expect(
        field.resolve({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message: 'Failed to start draft: Draft queue URL not configured',
        extensions: { code: 'DRAFT_START_FAILED' },
      });
    });
  });

  describe('createLeagueAndTeams mutation — auction entitlement gate (LS-5159)', () => {
    const baseInput = {
      leagueName: 'Auction League',
      numberOfTeams: 10,
      playerPool: 'all',
      selectionMethod: 'auction',
    };

    it('blocks a free user from creating an auction draft league', async () => {
      // getSubscriptionTier reads the tier via .limit(1) → free tier.
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ tier: 'free' }]);

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().createLeagueAndTeams;
      if (!field?.resolve) {
        throw new Error('createLeagueAndTeams resolver not found');
      }

      await expect(
        field.resolve(
          {},
          { input: baseInput },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Auction draft mode requires a premium subscription');

      // The gate must fire before any league is created.
      expect(mockCreateLeague).not.toHaveBeenCalled();
    });

    it('allows a premium (admin) user to create an auction draft league', async () => {
      mockCreateLeague.mockResolvedValue({
        league: {
          id: 1,
          name: 'Auction League',
          owner: 1,
          maxRosterSize: 25,
          currentMatchup: null,
        },
        teams: [],
        leagueMembers: [],
      });

      const adminContext = {
        user: { id: 1, isAdmin: true },
        db: mockDb,
      };

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().createLeagueAndTeams;
      if (!field?.resolve) {
        throw new Error('createLeagueAndTeams resolver not found');
      }

      await field.resolve(
        {},
        { input: baseInput },
        adminContext,
        undefined as never,
      );

      // Admins are treated as premium, so the auction gate passes and the
      // league is created with the auction selection method.
      expect(mockCreateLeague).toHaveBeenCalledTimes(1);
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ selectionMethod: 'auction' }),
      );
    });

    it('allows a free user to create a standard (non-auction) draft league', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([{ tier: 'free' }]);
      mockCreateLeague.mockResolvedValue({
        league: {
          id: 2,
          name: 'Standard League',
          owner: 1,
          maxRosterSize: 25,
          currentMatchup: null,
        },
        teams: [],
        leagueMembers: [],
      });

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().createLeagueAndTeams;
      if (!field?.resolve) {
        throw new Error('createLeagueAndTeams resolver not found');
      }

      await field.resolve(
        {},
        { input: { ...baseInput, selectionMethod: 'standard' } },
        mockContext,
        undefined as never,
      );

      expect(mockCreateLeague).toHaveBeenCalledTimes(1);
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ selectionMethod: 'standard' }),
      );
    });
  });

  describe('createLeagueAndTeams mutation — FAAB budget server-side gate (LS-6117)', () => {
    const baseInput = {
      leagueName: 'Waiver League',
      numberOfTeams: 10,
      playerPool: 'all',
      selectionMethod: 'standard',
    };

    it('forces faabBudgetDefault to 100 when a free user submits waiverType=standard with a smuggled-in budget', async () => {
      // A free user bypassing the client PremiumGate (URL hack/devtools) could
      // still submit waiverType='standard' + a non-default faabBudgetDefault.
      // The server must not persist that value dormant (LS-6117).
      mockCreateLeague.mockResolvedValue({
        league: {
          id: 1,
          name: 'Waiver League',
          owner: 1,
          maxRosterSize: 25,
          currentMatchup: null,
        },
        teams: [],
        leagueMembers: [],
      });

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().createLeagueAndTeams;
      if (!field?.resolve) {
        throw new Error('createLeagueAndTeams resolver not found');
      }

      await field.resolve(
        {},
        {
          input: {
            ...baseInput,
            waiverType: 'standard',
            faabBudgetDefault: 500,
          },
        },
        mockContext,
        undefined as never,
      );

      expect(mockCreateLeague).toHaveBeenCalledTimes(1);
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({
          waiverType: 'standard',
          faabBudgetDefault: 100,
        }),
      );
    });

    it('preserves the submitted faabBudgetDefault when waiverType=faab (already entitlement-gated)', async () => {
      const adminContext = {
        user: { id: 1, isAdmin: true },
        db: mockDb,
      };
      mockCreateLeague.mockResolvedValue({
        league: {
          id: 2,
          name: 'Waiver League',
          owner: 1,
          maxRosterSize: 25,
          currentMatchup: null,
        },
        teams: [],
        leagueMembers: [],
      });

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().createLeagueAndTeams;
      if (!field?.resolve) {
        throw new Error('createLeagueAndTeams resolver not found');
      }

      await field.resolve(
        {},
        {
          input: {
            ...baseInput,
            waiverType: 'faab',
            faabBudgetDefault: 500,
          },
        },
        adminContext,
        undefined as never,
      );

      expect(mockCreateLeague).toHaveBeenCalledTimes(1);
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({
          waiverType: 'faab',
          faabBudgetDefault: 500,
        }),
      );
    });
  });
});
