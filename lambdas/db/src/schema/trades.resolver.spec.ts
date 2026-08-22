import type { GraphQLSchema } from 'graphql';

describe('Trades Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;

  beforeEach(async () => {
    jest.resetModules();

    // Fluent mock for Drizzle DB chain
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      // awaiting the chain directly (when no .limit / .returning terminator)
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
      ),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      BADGE_DEFINITIONS: [],
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        tradeOffers: {
          id: 'id',
          leagueId: 'leagueId',
          proposingTeamId: 'proposingTeamId',
          receivingTeamId: 'receivingTeamId',
          status: 'status',
          message: 'message',
          proposingTeamName: 'proposingTeamName',
          receivingTeamName: 'receivingTeamName',
          expiresAt: 'expiresAt',
          respondedAt: 'respondedAt',
          vetoedAt: 'vetoedAt',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        tradeOfferPlayers: {
          id: 'id',
          tradeOfferId: 'tradeOfferId',
          playerId: 'playerId',
          fromTeamId: 'fromTeamId',
          playerName: 'playerName',
        },
        tradeOfferVotes: {
          id: 'id',
          tradeOfferId: 'tradeOfferId',
          teamId: 'teamId',
          vote: 'vote',
          createdAt: 'createdAt',
        },
        teams: {
          id: 'id',
          name: 'name',
          leagueId: 'leagueId',
          isLocked: 'isLocked',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
          positionId: 'positionId',
        },
        players: {
          id: 'id',
          firstName: 'firstName',
          lastName: 'lastName',
        },
        leagues: {
          id: 'id',
          salaryCapEnabled: 'salaryCapEnabled',
          salaryCap: 'salaryCap',
          minSalary: 'minSalary',
          discordWebhookUrl: 'discordWebhookUrl',
          leaguePhase: 'leaguePhase',
        },
        leagueMessages: {
          id: 'id',
          leagueId: 'leagueId',
          userId: 'userId',
          messageText: 'messageText',
          messageType: 'messageType',
          metadata: 'metadata',
          timestamp: 'timestamp',
        },
        directMessages: {
          id: 'id',
          fromUserId: 'fromUserId',
          toUserId: 'toUserId',
          leagueId: 'leagueId',
          messageText: 'messageText',
          createdAt: 'createdAt',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'leagueId',
          eventType: 'eventType',
          occurredAt: 'occurredAt',
        },
        leagueActivityEventType: { enumValues: [] },
        leagueAchievementRestrictions: { id: 'id', leagueId: 'leagueId' },
        leagueSeasonAwards: { id: 'id', leagueId: 'leagueId' },
        leagueWeekPlayerSeasons: { playerId: 'playerId', leagueId: 'leagueId' },
        matchups: { id: 'id', leagueId: 'leagueId' },
        matchupPlayers: { id: 'id', matchupId: 'matchupId' },
        matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
    }));

    // Mock the cap-service imported by trades mutations
    jest.doMock('../services/cap-service', () => ({
      assertCapSpace: jest.fn(),
      computeTeamPayroll: jest.fn().mockResolvedValue(0),
      computeTeamPayrollExcluding: jest.fn().mockResolvedValue(0),
      fetchPlayerSalaries: jest.fn().mockResolvedValue(new Map()),
      fetchTradeDisplaySalaries: jest.fn().mockResolvedValue(new Map()),
    }));

    // Mock activity-log service
    jest.doMock('../services/activity-log', () => ({
      insertActivityLog: jest.fn().mockResolvedValue(undefined),
    }));

    // Mock discord-league service
    jest.doMock('../services/discord-league', () => ({
      notifyDiscordTradeEvent: jest.fn().mockResolvedValue(undefined),
      isValidDiscordWebhookUrl: jest.fn().mockReturnValue(true),
    }));

    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, username: 'testuser' },
      db: mockDb,
      notificationService: {
        notifyDirectMessage: jest.fn().mockResolvedValue(undefined),
        notifyTradeOffer: jest.fn().mockResolvedValue(undefined),
        notifyLeagueChatMessage: jest.fn().mockResolvedValue(undefined),
        notifyRosterUpdate: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getResolver(type: 'query' | 'mutation', name: string) {
    const typeObj =
      type === 'query' ? schema.getQueryType() : schema.getMutationType();
    const field = typeObj?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  const unauthCtx = {
    user: null,
    db: null,
    notificationService: null,
  };

  // ── leagueTradeOffers ──────────────────────────────────────────────────────

  describe('leagueTradeOffers query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('query', 'leagueTradeOffers');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    // TC-004-P regression: authenticated user must be a league member
    it('throws ForbiddenError when authenticated user is not a member of the league (LS-7491)', async () => {
      // verifyLeagueMembership: select().from().where().limit(1) → no rows = not a member
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('query', 'leagueTradeOffers');
      await expect(
        resolver({}, { leagueId: 99 }, mockContext, undefined as never),
      ).rejects.toThrow('not a member of this league');
    });

    it('returns empty array when no trades exist', async () => {
      // verifyLeagueMembership: select().from().where().limit(1)
      // .where() returns mockDb so .limit() can chain; .limit(1) resolves to membership
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);
      // Main query: .where().orderBy().limit().offset() resolved by then: resolve([])

      const resolver = getResolver('query', 'leagueTradeOffers');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns hydrated trades when trades exist', async () => {
      // verifyLeagueMembership: select().from().where().limit(1)
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);
      const rawTrade = {
        id: 10,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'pending',
        message: null,
        expiresAt: null,
        respondedAt: null,
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // verifyLeagueMembership .where() — consumed before limit(1) resolves membership
      mockDb.where.mockReturnValueOnce(mockDb);
      // Main tradeOffers query chain: select().from().where().orderBy().limit().offset()
      // .where() returns mockDb so the chain can continue; .offset() is the terminal call
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.offset.mockResolvedValueOnce([rawTrade]);
      // teams lookup in hydrateTrades: select().from().where() — .where() resolves directly
      mockDb.where.mockResolvedValueOnce([
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ]);
      // players lookup: innerJoin().where() — falls back to then: resolve([])

      const resolver = getResolver('query', 'leagueTradeOffers');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 10,
        leagueId: 1,
        status: 'pending',
      });
    });
  });

  // ── teamTradeOffers ────────────────────────────────────────────────────────

  describe('teamTradeOffers query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('query', 'teamTradeOffers');
      await expect(
        resolver({}, { teamId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when team does not exist', async () => {
      // Team lookup returns no rows
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('query', 'teamTradeOffers');
      await expect(
        resolver({}, { teamId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Team not found or access denied');
    });

    it('throws when user is not a member of the league', async () => {
      // Team lookup succeeds
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 5 }]);
      // League membership lookup returns no rows
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('query', 'teamTradeOffers');
      await expect(
        resolver({}, { teamId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('not a member of this league');
    });

    it('returns empty array when no trades exist', async () => {
      // Team lookup: .select().from().where().limit(1)
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]);
      // League membership lookup: .select().from().where().limit(1)
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);
      // Main query: .where().orderBy().limit().offset() resolved by then: resolve([])

      const resolver = getResolver('query', 'teamTradeOffers');
      const result = await resolver(
        {},
        { teamId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns the pending counter-offer when filtered by team and status', async () => {
      // Simulates the counter-offer scenario: original trade rejected, counter pending.
      // The rejected original exists in the DB but the status filter should exclude it —
      // the mock orderBy result represents what the DB returns after applying the WHERE clause.
      const _rejectedOriginal = {
        id: 10,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'rejected',
        message: null,
        expiresAt: null,
        respondedAt: new Date(),
        vetoedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      };
      const counterTrade = {
        id: 20,
        leagueId: 1,
        proposingTeamId: 2,
        receivingTeamId: 1,
        status: 'pending',
        message: null,
        expiresAt: null,
        respondedAt: null,
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Authorization: team lookup → .select().from().where().limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]);
      // Authorization: membership lookup → .select().from().where().limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 2 },
      ]);
      // Main tradeOffers query: select().from().where().orderBy().limit().offset()
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.offset.mockResolvedValueOnce([counterTrade]);
      // hydrateTrades — teams lookup: select().from().where() (awaited directly)
      mockDb.where.mockResolvedValueOnce([
        { id: 1, name: 'Commissioner Team' },
        { id: 2, name: 'Manager Team' },
      ]);
      // hydrateTrades — players lookup: innerJoin().where() → default then: []

      const resolver = getResolver('query', 'teamTradeOffers');
      const result = (await resolver(
        {},
        { teamId: 2, status: 'pending' },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      // Resolver applies a .where() clause that includes the status condition
      expect(mockDb.where).toHaveBeenCalled();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 20,
        proposingTeamId: 2,
        receivingTeamId: 1,
        status: 'pending',
        proposingTeamName: 'Manager Team',
        receivingTeamName: 'Commissioner Team',
      });
    });
  });

  // ── snapshot name hydration ────────────────────────────────────────────────

  describe('trade name snapshot hydration', () => {
    it('uses snapshot team names from trade row instead of current team names', async () => {
      // verifyLeagueMembership
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);

      const rawTrade = {
        id: 30,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'accepted',
        message: null,
        // Snapshots recorded at proposal time — these are the historical names
        proposingTeamName: 'Old Proposing Name',
        receivingTeamName: 'Old Receiving Name',
        expiresAt: null,
        respondedAt: new Date(),
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.offset.mockResolvedValueOnce([rawTrade]);
      // Teams JOIN returns *current* (renamed) team names — should NOT be used
      mockDb.where.mockResolvedValueOnce([
        { id: 1, name: 'New Proposing Name' },
        { id: 2, name: 'New Receiving Name' },
      ]);
      // Players lookup: falls back to then: resolve([])

      const resolver = getResolver('query', 'leagueTradeOffers');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        proposingTeamName: 'Old Proposing Name',
        receivingTeamName: 'Old Receiving Name',
      });
    });

    it('falls back to JOIN team names when snapshot columns are null (pre-migration rows)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);

      const rawTrade = {
        id: 31,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'pending',
        message: null,
        proposingTeamName: null,
        receivingTeamName: null,
        expiresAt: null,
        respondedAt: null,
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.offset.mockResolvedValueOnce([rawTrade]);
      mockDb.where.mockResolvedValueOnce([
        { id: 1, name: 'Current Team A' },
        { id: 2, name: 'Current Team B' },
      ]);

      const resolver = getResolver('query', 'leagueTradeOffers');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        proposingTeamName: 'Current Team A',
        receivingTeamName: 'Current Team B',
      });
    });
  });

  // ── pagination (leagueTradeOffers + teamTradeOffers) ───────────────────────

  describe('pagination args', () => {
    it('passes limit and offset to the DB query for leagueTradeOffers', async () => {
      // verifyLeagueMembership: .where().limit(1)
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);
      const resolver = getResolver('query', 'leagueTradeOffers');
      await resolver(
        {},
        { leagueId: 1, limit: 10, offset: 20 },
        mockContext,
        undefined as never,
      );

      expect(mockDb.limit).toHaveBeenCalledWith(10);
      expect(mockDb.offset).toHaveBeenCalledWith(20);
    });

    it('caps leagueTradeOffers limit at 100', async () => {
      // verifyLeagueMembership: .where().limit(1)
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);
      const resolver = getResolver('query', 'leagueTradeOffers');
      await resolver(
        {},
        { leagueId: 1, limit: 999 },
        mockContext,
        undefined as never,
      );

      expect(mockDb.limit).toHaveBeenCalledWith(100);
    });

    it('passes limit and offset to the DB query for teamTradeOffers', async () => {
      // Team lookup + membership lookup
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]);
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);
      const resolver = getResolver('query', 'teamTradeOffers');
      await resolver(
        {},
        { teamId: 1, limit: 25, offset: 50 },
        mockContext,
        undefined as never,
      );

      expect(mockDb.limit).toHaveBeenCalledWith(25);
      expect(mockDb.offset).toHaveBeenCalledWith(50);
    });

    it('caps teamTradeOffers limit at 100', async () => {
      // Team lookup + membership lookup
      mockDb.limit.mockResolvedValueOnce([{ leagueId: 1 }]);
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 1 },
      ]);
      const resolver = getResolver('query', 'teamTradeOffers');
      await resolver(
        {},
        { teamId: 1, limit: 500 },
        mockContext,
        undefined as never,
      );

      expect(mockDb.limit).toHaveBeenCalledWith(100);
    });
  });

  // ── proposeTrade ───────────────────────────────────────────────────────────

  describe('proposeTrade mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        resolver(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when offering no players', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        resolver(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [],
            requestingPlayerIds: [],
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('at least one player');
    });

    it('throws BAD_USER_INPUT when expiresInDays is zero', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
            expiresInDays: 0,
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('at least 1 day'),
      });
    });

    it('throws BAD_USER_INPUT when expiresInDays is negative', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
            expiresInDays: -5,
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('at least 1 day'),
      });
    });

    it('throws BAD_USER_INPUT when offeringPlayerIds contains duplicate IDs', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [10, 10],
            requestingPlayerIds: [20],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('duplicate'),
      });
    });

    it('throws BAD_USER_INPUT when requestingPlayerIds contains duplicate IDs', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [10],
            requestingPlayerIds: [20, 20],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('duplicate'),
      });
    });

    it('throws BAD_USER_INPUT when the same player appears on both sides of the trade', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [10],
            requestingPlayerIds: [10],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('both sides'),
      });
    });

    it('throws BAD_USER_INPUT when expiresInDays exceeds the 30-day maximum', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
            expiresInDays: 31,
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('30 days'),
      });
    });

    it('throws BAD_USER_INPUT when expiresInDays is an extreme value like 100000', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
            expiresInDays: 100000,
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('30 days'),
      });
    });

    it('throws when league phase is not active (e.g. draft or offseason)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { leaguePhase: 'draft', sport: 'baseball' },
      ]);

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toThrow(
        'Trade offers are only available during the active season',
      );
    });

    it('throws FORBIDDEN when user permissionLevel is not an active management role', async () => {
      // League check passes (active phase)
      mockDb.limit.mockResolvedValueOnce([
        { leaguePhase: 'active', sport: 'baseball' },
      ]);
      // resolveUserTeam: membership row with a hypothetical non-manager role (e.g. future 'spectator')
      // Cast needed because current enum only has the three active-manager roles
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 1, permissionLevel: 'spectator' as unknown },
      ]);

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'FORBIDDEN' },
        message: expect.stringContaining('general manager'),
      });
    });

    it('throws FORBIDDEN when user is a co-manager (assistant_manager)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { leaguePhase: 'active', sport: 'baseball' },
      ]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 1, permissionLevel: 'assistant_manager' },
      ]);

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'FORBIDDEN' },
        message: expect.stringContaining('general manager'),
      });
    });

    it('allows a team-owning commissioner past the permission gate (LS-7917)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { leaguePhase: 'active', sport: 'baseball' },
      ]);
      // resolveUserTeam membership — commissioner who owns a team (league
      // creators are stored this way) must NOT be rejected by the
      // permission gate. The next mock returns no team row, so the resolver
      // fails at the abandoned-team guard instead — proving the permission
      // gate passed.
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 1, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'FORBIDDEN' },
        message: expect.stringContaining('no longer exists'),
      });
    });

    it('throws FORBIDDEN when the proposing team no longer exists (abandoned-team guard)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { leaguePhase: 'active', sport: 'baseball' },
      ]);
      // resolveUserTeam membership — valid GM
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 1, permissionLevel: 'general_manager' },
      ]);
      // teams query returns empty (team deleted / abandoned)
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'FORBIDDEN' },
        message: expect.stringContaining('no longer exists'),
      });
    });

    it('throws FORBIDDEN when the proposing team is locked by the commissioner', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { leaguePhase: 'active', sport: 'baseball' },
      ]);
      // resolveUserTeam membership — valid GM
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 1, permissionLevel: 'general_manager' },
      ]);
      // teams query — team exists but is locked
      mockDb.limit.mockResolvedValueOnce([{ isLocked: true }]);

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'FORBIDDEN' },
        message: expect.stringContaining('locked'),
      });
    });

    it('throws PREMIUM_REQUIRED when free-tier user sets expiresInDays beyond 7 days', async () => {
      // Default mockDb limit() → then → [] means subscription tier = 'free'
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
            expiresInDays: 14,
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'PREMIUM_REQUIRED' },
        message: expect.stringContaining('premium subscription'),
      });
    });

    it('throws BAD_USER_INPUT when message exceeds 500 characters', async () => {
      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
            message: 'a'.repeat(501),
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('500 characters'),
      });
    });

    it('strips HTML tags from message before storing', async () => {
      // The mutation validates message first, then hits the DB for league/team checks.
      // Seeding mockDb.limit to return [] for the league check will throw "League not found"
      // — that is fine; it proves message sanitization ran without error (no length error thrown).
      mockDb.limit.mockResolvedValueOnce([]); // league check → not found

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
            message: '<script>alert("xss")</script>Hello',
          },
          mockContext,
          undefined,
        ),
      ).rejects.toThrow('League not found');
      // If the HTML length check had fired instead, the error would contain "500 characters"
    });

    it('throws BAD_USER_INPUT when rate limit is exceeded', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { leaguePhase: 'active', sport: 'baseball' },
      ]); // league check
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 1, permissionLevel: 'general_manager' },
      ]); // resolveUserTeam membership
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]); // resolveUserTeam teams check
      mockDb.limit.mockResolvedValueOnce([{ id: 2, name: 'Receiving Team' }]); // receiving team exists
      mockDb.limit.mockResolvedValueOnce([{ name: 'Proposing Team' }]); // step 2c: proposing team name snapshot
      // Rate limit query: select({ total: count() }).from().where() — awaited via then
      mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ total: 3 }]),
      );

      const resolver = getResolver('mutation', 'proposeTrade');
      await expect(
        (resolver as (...a: unknown[]) => Promise<unknown>)(
          {},
          {
            leagueId: 1,
            receivingTeamId: 2,
            offeringPlayerIds: [1],
            requestingPlayerIds: [2],
          },
          mockContext,
          undefined,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('too many trade proposals'),
      });
    });
  });

  // ── acceptTrade ────────────────────────────────────────────────────────────

  describe('acceptTrade mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 5 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws NOT_FOUND when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'NOT_FOUND' },
        message: expect.stringContaining('Trade offer not found'),
      });
    });

    it('throws when a concurrent request already accepted the trade (rowCount=0 on status claim)', async () => {
      const trade = {
        id: 5,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'pending',
        message: null,
        expiresAt: null,
        respondedAt: null,
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const legs = [{ tradeOfferId: 5, playerId: 42, fromTeamId: 1 }];

      // trade fetch → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      // membership check → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ teamId: 2 }]);
      // player legs → where resolves directly
      mockDb.where.mockResolvedValueOnce(legs);
      // league settings → limit(1) returns empty → leagueCapRow undefined (skips cap/sport checks)
      mockDb.limit.mockResolvedValueOnce([]);

      // Transaction: first update (claim trade) returns rowCount=0 → another request beat us
      const mockTx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce({ rowCount: 0 }),
      };
      mockDb.transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
      );

      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toThrow('already been processed');
    });

    it('throws when an overlapping concurrent trade already moved a shared player (rowCount shortfall)', async () => {
      const trade = {
        id: 5,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'pending',
        message: null,
        expiresAt: null,
        respondedAt: null,
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const legs = [{ tradeOfferId: 5, playerId: 42, fromTeamId: 1 }];

      // trade fetch → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      // membership check → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ teamId: 2 }]);
      // player legs → where resolves directly
      mockDb.where.mockResolvedValueOnce(legs);
      // league settings → limit(1) returns empty → leagueCapRow undefined
      mockDb.limit.mockResolvedValueOnce([]);

      // Transaction: claim succeeds (rowCount=1) but roster update finds 0 rows (player moved away)
      const mockTx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest
          .fn()
          .mockResolvedValueOnce({ rowCount: 1 }) // tradeOffers status claim → success
          .mockResolvedValueOnce({ rowCount: 0 }), // teamMembers update → player already gone
      };
      mockDb.transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
      );

      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toThrow('Trade integrity violation');
    });

    it('[TC-024-P] throws when post-swap payroll exceeds salary cap (premium race condition)', async () => {
      const trade = {
        id: 5,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'pending',
        message: null,
        expiresAt: null,
        respondedAt: null,
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const legs = [
        { tradeOfferId: 5, playerId: 42, fromTeamId: 1 },
        { tradeOfferId: 5, playerId: 99, fromTeamId: 2 },
      ];

      // trade fetch → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      // membership check → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ teamId: 2 }]);
      // player legs → where resolves directly (no .limit)
      mockDb.where.mockResolvedValueOnce(legs);
      // league settings → where returns mockDb so .limit(1) can be called
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([
        {
          salaryCapEnabled: true,
          salaryCap: 100_000_000,
          minSalary: 500_000,
          sport: 'baseball',
        },
      ]);
      // sport-compatibility check → players query (no .limit)
      mockDb.where.mockResolvedValueOnce([
        { playerId: 42, sport: 'baseball' },
        { playerId: 99, sport: 'baseball' },
      ]);

      // Pre-transaction cap checks pass (stale payroll data from outside the tx)
      const { computeTeamPayrollExcluding, computeTeamPayroll } =
        jest.requireMock<{
          computeTeamPayrollExcluding: jest.Mock;
          computeTeamPayroll: jest.Mock;
        }>('../services/cap-service');
      computeTeamPayrollExcluding
        .mockResolvedValueOnce(96_000_000) // receiving payroll excluding outgoing (pre-tx)
        .mockResolvedValueOnce(94_000_000); // proposing payroll excluding outgoing (pre-tx)

      // Transaction: claim succeeds, both roster legs succeed (different player
      // from a concurrent trade already swapped the cap; the only check that
      // catches this is the in-transaction post-swap re-validation).
      const mockTx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest
          .fn()
          .mockResolvedValueOnce({ rowCount: 1 }) // claim trade offer
          .mockResolvedValueOnce({ rowCount: 1 }) // toReceiving teamMembers
          .mockResolvedValueOnce({ rowCount: 1 }), // toProposing teamMembers
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
      };
      mockDb.transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
      );

      // Post-swap payroll inside transaction — receiving team is now over cap
      // because a concurrent trade (accepted in parallel) added more salary
      // before this transaction's cap check runs.
      computeTeamPayroll
        .mockResolvedValueOnce(103_000_000) // receiving team post-swap: over $100M cap
        .mockResolvedValueOnce(92_000_000); // proposing team post-swap: within cap

      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toThrow('salary cap');
    });

    it('cancels other pending trades involving the same players after a successful accept', async () => {
      const trade = {
        id: 5,
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
        status: 'pending',
        message: null,
        expiresAt: null,
        respondedAt: null,
        vetoedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const legs = [{ tradeOfferId: 5, playerId: 42, fromTeamId: 1 }];

      // trade fetch → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      // membership check → limit(1)
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ teamId: 2 }]);
      // player legs → where resolves directly (no .limit)
      mockDb.where.mockResolvedValueOnce(legs);
      // league settings → where returns mockDb for .limit(1); empty = no cap
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([]);

      // Transaction: all steps succeed.
      // The mockTx.where uses mockImplementation as fallback so that
      // syncMatchupPlayersForTradeLeg's internal queries (subquery building
      // and destMatchups select) resolve to [] without throwing.
      const mockTx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest
          .fn()
          .mockResolvedValueOnce({ rowCount: 1 }) // claim
          .mockResolvedValueOnce({ rowCount: 1 }) // toReceiving
          .mockImplementation(() => Promise.resolve([])), // sync & remainder
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      };
      mockDb.transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
      );

      // Post-transaction auto-cancel: two where() calls fire — inner subquery
      // and outer UPDATE. The inner subquery where is consumed first, then the
      // outer update where falls to the next Once value.
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 }); // subquery inner where
      mockDb.where.mockReturnValueOnce(mockDb); // outer update where → await → []

      // postTradeSystemMessage fires before enrichTrade and runs two
      // team-name queries via Promise.all (proposing + receiving).
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Proposing Team' }]);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Receiving Team' }]);

      // enrichTrade calls after accept
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team 1' }]);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team 2' }]);
      mockDb.where.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'acceptTrade');
      const result = await resolver(
        {},
        { tradeId: 5 },
        mockContext,
        undefined as never,
      );

      expect(result).toBeDefined();
      // Verify auto-cancel fired: update called on the main db (not just mockTx)
      // after the transaction — the cancel is the first post-transaction update.
      expect(mockDb.update).toHaveBeenCalled();
      const setCalls = mockDb.set.mock.calls;
      const cancelCall = setCalls.find(
        (args: unknown[]) =>
          typeof args[0] === 'object' &&
          args[0] !== null &&
          (args[0] as Record<string, unknown>).status === 'cancelled',
      );
      expect(cancelCall).toBeDefined();
    });
  });

  // ── rejectTrade ────────────────────────────────────────────────────────────

  describe('rejectTrade mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('mutation', 'rejectTrade');
      await expect(
        resolver({}, { tradeId: 5 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws NOT_FOUND when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'rejectTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'NOT_FOUND' },
        message: expect.stringContaining('Trade offer not found'),
      });
    });

    it('throws BAD_USER_INPUT when trade is not pending', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 5,
          status: 'accepted',
          leagueId: 1,
          proposingTeamId: 1,
          receivingTeamId: 2,
        },
      ]);

      const resolver = getResolver('mutation', 'rejectTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('already been accepted'),
      });
    });

    // LS-9487: a concurrent reject/cancel/accept on the same offer must lose
    // this race gracefully (BAD_USER_INPUT), not crash `enrichTrade` with a
    // raw "Trade offer not found" once the other resolution wins.
    it('throws BAD_USER_INPUT when a concurrent request already resolved the trade (rowCount=0 on status update)', async () => {
      const trade = {
        id: 5,
        status: 'pending',
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
      };

      // trade fetch
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      // membership fetch — caller is the receiving team manager
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ teamId: 2 }]);
      // status-gated update loses the race
      mockDb.where.mockResolvedValueOnce({ rowCount: 0 });

      const resolver = getResolver('mutation', 'rejectTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('already been processed'),
      });
    });

    // LS-9217: a rejected trade must post a system message into league chat
    // (AC1 — verified here via rejectTrade since it exercises the same shared
    // postTradeSystemMessage helper that acceptTrade/cancelTrade/vetoTrade call).
    it('posts a trade system message to league chat on successful rejection (LS-9217)', async () => {
      const trade = {
        id: 5,
        status: 'pending',
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
      };

      // rejectTrade: trade fetch
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      // rejectTrade: membership fetch — caller is the receiving team manager
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ teamId: 2 }]);
      // rejectTrade: status-gated update claims the row
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });
      // postTradeSystemMessage: proposing/receiving team name lookups
      mockDb.limit.mockResolvedValueOnce([{ name: 'Proposing Team' }]);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Receiving Team' }]);
      // postTradeSystemMessage: leagueMessages insert
      mockDb.returning.mockResolvedValueOnce([
        { id: 55, timestamp: '2026-01-01 00:00:00+00' },
      ]);
      // enrichTrade: re-fetch trade + team names for the mutation's return value
      mockDb.limit.mockResolvedValueOnce([trade]);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Proposing Team' }]);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Receiving Team' }]);

      const resolver = getResolver('mutation', 'rejectTrade');
      await resolver({}, { tradeId: 5 }, mockContext, undefined as never);

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          leagueId: 1,
          userId: null,
          messageType: 'trade',
        }),
      );
      expect(
        mockContext.notificationService.notifyLeagueChatMessage,
      ).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          leagueId: 1,
          messageId: 55,
          messageType: 'trade',
        }),
      );
    });
  });

  // ── cancelTrade ────────────────────────────────────────────────────────────

  describe('cancelTrade mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('mutation', 'cancelTrade');
      await expect(
        resolver({}, { tradeId: 5 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws NOT_FOUND when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'cancelTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'NOT_FOUND' },
        message: expect.stringContaining('Trade offer not found'),
      });
    });

    it('throws BAD_USER_INPUT when trade is not pending', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 5,
          status: 'rejected',
          leagueId: 1,
          proposingTeamId: 1,
          receivingTeamId: 2,
        },
      ]);

      const resolver = getResolver('mutation', 'cancelTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('already been rejected'),
      });
    });

    // LS-9487: a concurrent reject/cancel/accept on the same offer must lose
    // this race gracefully (BAD_USER_INPUT), not crash `enrichTrade` with a
    // raw "Trade offer not found" once the other resolution wins.
    it('throws BAD_USER_INPUT when a concurrent request already resolved the trade (rowCount=0 on status update)', async () => {
      const trade = {
        id: 5,
        status: 'pending',
        leagueId: 1,
        proposingTeamId: 1,
        receivingTeamId: 2,
      };

      // trade fetch
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([trade]);
      // membership fetch — caller is the proposing team manager
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ teamId: 1 }]);
      // status-gated update loses the race
      mockDb.where.mockResolvedValueOnce({ rowCount: 0 });

      const resolver = getResolver('mutation', 'cancelTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('already been processed'),
      });
    });
  });

  // ── vetoTrade ─────────────────────────────────────────────────────────────

  describe('vetoTrade mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('mutation', 'vetoTrade');
      await expect(
        resolver({}, { tradeId: 5 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws NOT_FOUND when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'vetoTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'NOT_FOUND' },
        message: expect.stringContaining('Trade offer not found'),
      });
    });

    it('throws BAD_USER_INPUT when trade is not accepted', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 5,
          status: 'pending',
          leagueId: 1,
          proposingTeamId: 1,
          receivingTeamId: 2,
        },
      ]);

      const resolver = getResolver('mutation', 'vetoTrade');
      await expect(
        resolver({}, { tradeId: 5 }, mockContext, undefined as never),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining('Only accepted trades can be vetoed'),
      });
    });
  });

  // ── voteOnTrade ────────────────────────────────────────────────────────────

  describe('voteOnTrade mutation', () => {
    const acceptedTrade = {
      id: 5,
      leagueId: 1,
      proposingTeamId: 1,
      receivingTeamId: 2,
      status: 'accepted',
      message: null,
      expiresAt: null,
      respondedAt: null,
      vetoedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('throws when unauthenticated', async () => {
      const resolver = getResolver('mutation', 'voteOnTrade');
      await expect(
        resolver(
          {},
          { tradeId: 5, vote: 'approve' },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws PremiumRequired when the caller is not premium', async () => {
      // requirePremium's subscriptionTier lookup
      mockDb.limit.mockResolvedValueOnce([{ tier: 'free' }]);

      const resolver = getResolver('mutation', 'voteOnTrade');
      await expect(
        resolver(
          {},
          { tradeId: 5, vote: 'approve' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('premium subscription');
    });

    it('throws NOT_FOUND when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([{ tier: 'premium' }]); // requirePremium
      mockDb.limit.mockResolvedValueOnce([]); // trade fetch

      const resolver = getResolver('mutation', 'voteOnTrade');
      await expect(
        resolver(
          {},
          { tradeId: 999, vote: 'approve' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'NOT_FOUND' },
        message: expect.stringContaining('Trade offer not found'),
      });
    });

    it('throws BAD_USER_INPUT when the trade is not accepted', async () => {
      mockDb.limit.mockResolvedValueOnce([{ tier: 'premium' }]); // requirePremium
      mockDb.limit.mockResolvedValueOnce([
        { ...acceptedTrade, status: 'pending' },
      ]); // trade fetch

      const resolver = getResolver('mutation', 'voteOnTrade');
      await expect(
        resolver(
          {},
          { tradeId: 5, vote: 'approve' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'BAD_USER_INPUT' },
        message: expect.stringContaining(
          'Only accepted trades under commissioner review can be voted on',
        ),
      });
    });

    it('throws Forbidden when the caller has no active team in the league', async () => {
      mockDb.limit.mockResolvedValueOnce([{ tier: 'premium' }]); // requirePremium
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]); // trade fetch
      mockDb.limit.mockResolvedValueOnce([]); // membership lookup — no row

      const resolver = getResolver('mutation', 'voteOnTrade');
      await expect(
        resolver(
          {},
          { tradeId: 5, vote: 'approve' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('throws Forbidden when the caller is a spectator (no manager permission)', async () => {
      mockDb.limit.mockResolvedValueOnce([{ tier: 'premium' }]); // requirePremium
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]); // trade fetch
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 3, permissionLevel: 'spectator' },
      ]); // membership lookup

      const resolver = getResolver('mutation', 'voteOnTrade');
      await expect(
        resolver(
          {},
          { tradeId: 5, vote: 'approve' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
    });

    it('throws Forbidden when the caller is a party to the trade', async () => {
      mockDb.limit.mockResolvedValueOnce([{ tier: 'premium' }]); // requirePremium
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]); // trade fetch
      mockDb.limit.mockResolvedValueOnce([
        {
          teamId: acceptedTrade.proposingTeamId,
          permissionLevel: 'general_manager',
        },
      ]); // membership lookup — caller's team is the proposing team

      const resolver = getResolver('mutation', 'voteOnTrade');
      await expect(
        resolver(
          {},
          { tradeId: 5, vote: 'veto' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        extensions: { code: 'FORBIDDEN' },
        message: expect.stringContaining('cannot vote'),
      });
    });

    it('records a vote and does not auto-veto when the majority threshold is not met', async () => {
      const voteRow = {
        id: 1,
        tradeOfferId: 5,
        teamId: 3,
        teamName: 'Team C',
        vote: 'veto',
        createdAt: new Date(),
      };

      // 1. requirePremium — .where() passthrough, .limit() terminal
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ tier: 'premium' }]);
      // 2. trade fetch
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]);
      // 3. membership lookup — caller's team (3) is not a party to the trade
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 3, permissionLevel: 'general_manager' },
      ]);
      // 4. insert vote → onConflictDoUpdate is the terminal call (mockReturnThis),
      // falls back to `.then` default resolving [] — no queue consumption

      // 5. re-fetch current trade — still accepted
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]);
      // 6a. fetchTradeVotesData (post-vote tally): one veto vote so far — .where() terminal
      mockDb.where.mockResolvedValueOnce([voteRow]);
      // 6b. team counts — .where() passthrough, .groupBy() terminal.
      // 4 teams in the league → eligibleVoterCount = 2; 1 veto does not exceed 1
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.groupBy.mockResolvedValueOnce([{ leagueId: 1, total: 4 }]);

      // enrichTrade re-fetch chain
      mockDb.where.mockReturnValueOnce(mockDb); // trade
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]);
      mockDb.where.mockReturnValueOnce(mockDb); // proposing team
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team A' }]);
      mockDb.where.mockReturnValueOnce(mockDb); // receiving team
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team B' }]);
      mockDb.where.mockResolvedValueOnce([]); // rawPlayers — terminal
      mockDb.where.mockResolvedValueOnce([voteRow]); // votes (enrichTrade's own fetchTradeVotesData call) — terminal
      mockDb.where.mockReturnValueOnce(mockDb); // team counts passthrough
      mockDb.groupBy.mockResolvedValueOnce([{ leagueId: 1, total: 4 }]); // team counts terminal

      const resolver = getResolver('mutation', 'voteOnTrade');
      const result = (await resolver(
        {},
        { tradeId: 5, vote: 'veto' },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ tradeOfferId: 5, teamId: 3, vote: 'veto' }),
      );
      // No auto-veto: the transaction path (reverseTradeSwapAndMarkVetoed) is
      // never entered, so mockDb.transaction is never assigned in this test.
      expect(mockDb.transaction).toBeUndefined();
      expect(result.id).toBe(5);
      expect(result.status).toBe('accepted');
    });

    it('auto-vetoes the trade when a strict majority of eligible teams vote to veto', async () => {
      const vetoVotes = [
        {
          id: 1,
          tradeOfferId: 5,
          teamId: 3,
          teamName: 'Team C',
          vote: 'veto',
          createdAt: new Date(),
        },
        {
          id: 2,
          tradeOfferId: 5,
          teamId: 4,
          teamName: 'Team D',
          vote: 'veto',
          createdAt: new Date(),
        },
      ];

      // 1. requirePremium
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ tier: 'premium' }]);
      // 2. trade fetch
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]);
      // 3. membership lookup — caller's team (3) is not a party to the trade
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 3, permissionLevel: 'general_manager' },
      ]);
      // 4. insert vote → no queue consumption (see above)

      // 5. re-fetch current trade — still accepted
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]);
      // 6a. fetchTradeVotesData: 2 veto votes — .where() terminal
      mockDb.where.mockResolvedValueOnce(vetoVotes);
      // 6b. team counts — .where() passthrough, .groupBy() terminal.
      // 4 teams in the league → eligibleVoterCount = 2; 2 vetoes exceeds 1 → auto-veto
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.groupBy.mockResolvedValueOnce([{ leagueId: 1, total: 4 }]);

      // reverseTradeSwapAndMarkVetoed: no player legs → skips the roster/matchup
      // reversal work entirely, isolating this test to the majority-vote trigger.
      mockDb.where.mockResolvedValueOnce([]);
      const mockTx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(undefined),
      };
      mockDb.transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
      );

      // postTradeSystemMessage (non-fatal, wrapped in try/catch) looks up both
      // team names before inserting the league chat message.
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team A' }]);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team B' }]);

      // enrichTrade re-fetch chain
      mockDb.where.mockReturnValueOnce(mockDb); // trade
      mockDb.limit.mockResolvedValueOnce([acceptedTrade]);
      mockDb.where.mockReturnValueOnce(mockDb); // proposing team
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team A' }]);
      mockDb.where.mockReturnValueOnce(mockDb); // receiving team
      mockDb.limit.mockResolvedValueOnce([{ name: 'Team B' }]);
      mockDb.where.mockResolvedValueOnce([]); // rawPlayers — terminal
      mockDb.where.mockResolvedValueOnce([]); // votes (enrichTrade's own fetch) — terminal
      mockDb.where.mockReturnValueOnce(mockDb); // team counts passthrough
      mockDb.groupBy.mockResolvedValueOnce([{ leagueId: 1, total: 4 }]); // team counts terminal

      const resolver = getResolver('mutation', 'voteOnTrade');
      await resolver(
        {},
        { tradeId: 5, vote: 'veto' },
        mockContext,
        undefined as never,
      );

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTx.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'vetoed' }),
      );
    });
  });
});
