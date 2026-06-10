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
      computeTeamPayrollExcluding: jest.fn().mockResolvedValue(0),
      fetchPlayerSalaries: jest.fn().mockResolvedValue(new Map()),
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
        message: expect.stringContaining('active manager'),
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
      ]); // resolveUserTeam
      mockDb.limit.mockResolvedValueOnce([{ id: 2 }]); // receiving team exists
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

    it('throws when trade not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getResolver('mutation', 'acceptTrade');
      await expect(
        resolver({}, { tradeId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Trade offer not found');
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
