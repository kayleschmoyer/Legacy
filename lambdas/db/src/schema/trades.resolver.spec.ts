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
      groupBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
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
        },
        teams: {
          id: 'id',
          name: 'name',
          leagueId: 'leagueId',
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
      computeTeamPayrollExcluding: jest.fn().mockResolvedValue(0),
      fetchPlayerSalaries: jest.fn().mockResolvedValue(new Map()),
    }));

    // Mock activity-log service
    jest.doMock('../services/activity-log', () => ({
      insertActivityLog: jest.fn().mockResolvedValue(undefined),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
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

    it('returns empty array when no trades exist', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

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

      // Main tradeOffers query chain: select().from().where().orderBy()
      // .where() must return mockDb so .orderBy() can chain; only then does .orderBy resolve
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.orderBy.mockResolvedValueOnce([rawTrade]);
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

    it('returns empty array when no trades exist', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

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

      // Main tradeOffers query: select().from().where().orderBy()
      // The DB would return only the pending trade after filtering by status='pending'
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.orderBy.mockResolvedValueOnce([counterTrade]);
      // hydrateTrades — teams lookup: select().from().where()
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
  });

  // ── acceptTrade ────────────────────────────────────────────────────────────

  describe('acceptTrade mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 5 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Trade offer not found');
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

    it('throws when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'rejectTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Trade offer not found');
    });

    it('throws when trade is not pending', async () => {
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
      ).rejects.toThrow('already been accepted');
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

    it('throws when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'cancelTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Trade offer not found');
    });

    it('throws when trade is not pending', async () => {
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
      ).rejects.toThrow('already been rejected');
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

    it('throws when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'vetoTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Trade offer not found');
    });

    it('throws when trade is not accepted', async () => {
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
      ).rejects.toThrow('Only accepted trades can be vetoed');
    });
  });
});
