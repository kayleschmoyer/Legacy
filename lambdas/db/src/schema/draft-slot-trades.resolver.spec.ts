import type { GraphQLSchema } from 'graphql';

describe('Draft Slot Trades Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;

  beforeEach(async () => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      transaction: jest.fn(),
      then: jest.fn((resolve: (v: unknown[]) => unknown) => resolve([])),
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
        draftSlotTrades: {
          id: 'id',
          leagueId: 'leagueId',
          proposerTeamId: 'proposerTeamId',
          counterpartTeamId: 'counterpartTeamId',
          status: 'status',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        draftTeams: {
          draftId: 'draftId',
          teamId: 'teamId',
          leagueId: 'leagueId',
          draftOrder: 'draftOrder',
        },
        drafts: { id: 'id', leagueId: 'leagueId', createdAt: 'createdAt' },
        teams: {
          id: 'id',
          leagueId: 'leagueId',
          isLocked: 'isLocked',
          name: 'name',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        leagues: {
          id: 'id',
          allowDraftSlotTrading: 'allowDraftSlotTrading',
          draftStatus: 'draftStatus',
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
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, username: 'testuser' },
      db: mockDb,
      notificationService: {
        notifyLeagueChatMessage: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  function getQueryResolver(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} query resolver not found`);
    return field.resolve;
  }

  const unauthCtx = { user: null, db: null, notificationService: null };

  /** Throwaway once-values for the fire-and-forget system-chat notification,
   *  which the resolver calls before its final enrich step — see
   *  postDraftSlotTradeSystemMessage: its own DB calls must be queued (as
   *  harmless empty results) so they don't shift the once-queue meant for the
   *  subsequent enrichDraftSlotTrade calls. */
  function queueNotificationNoOp() {
    mockDb.limit.mockResolvedValueOnce([]); // proposer team name
    mockDb.limit.mockResolvedValueOnce([]); // counterpart team name
    mockDb.returning.mockResolvedValueOnce([]); // chat message insert
  }

  function queueEnrich(trade: Record<string, unknown>) {
    mockDb.limit.mockResolvedValueOnce([trade]); // trade fetch
    mockDb.limit.mockResolvedValueOnce([{ name: 'Proposer FC' }]);
    mockDb.limit.mockResolvedValueOnce([{ name: 'Counterpart FC' }]);
  }

  const openLeague = {
    id: 1,
    allowDraftSlotTrading: true,
    draftStatus: 'not-started',
  };

  // ── proposeDraftSlotTrade ────────────────────────────────────────────────

  describe('proposeDraftSlotTrade', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('proposeDraftSlotTrade');
      await expect(
        resolver(
          {},
          { leagueId: 1, counterpartTeamId: 2 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when draft slot trading is disabled for the league', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { ...openLeague, allowDraftSlotTrading: false },
      ]);
      const resolver = getResolver('proposeDraftSlotTrade');
      await expect(
        resolver(
          {},
          { leagueId: 1, counterpartTeamId: 2 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('not enabled for this league');
    });

    it('throws once the draft has started (locking)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { ...openLeague, draftStatus: 'in-progress' },
      ]);
      const resolver = getResolver('proposeDraftSlotTrade');
      await expect(
        resolver(
          {},
          { leagueId: 1, counterpartTeamId: 2 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('before the draft starts');
    });

    it('throws when the caller has no team in the league', async () => {
      mockDb.limit.mockResolvedValueOnce([openLeague]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: null, permissionLevel: null },
      ]);
      const resolver = getResolver('proposeDraftSlotTrade');
      await expect(
        resolver(
          {},
          { leagueId: 1, counterpartTeamId: 2 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('do not have a team');
    });

    it('throws when proposing a trade with yourself', async () => {
      mockDb.limit.mockResolvedValueOnce([openLeague]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      const resolver = getResolver('proposeDraftSlotTrade');
      await expect(
        resolver(
          {},
          { leagueId: 1, counterpartTeamId: 5 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('cannot trade with yourself');
    });

    it('throws when the counterpart team does not exist in the league', async () => {
      mockDb.limit.mockResolvedValueOnce([openLeague]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      mockDb.limit.mockResolvedValueOnce([]); // counterpart team lookup: not found
      const resolver = getResolver('proposeDraftSlotTrade');
      await expect(
        resolver(
          {},
          { leagueId: 1, counterpartTeamId: 999 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('does not exist in this league');
    });

    it('throws when a pending proposal already exists between the two teams', async () => {
      mockDb.limit.mockResolvedValueOnce([openLeague]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      mockDb.limit.mockResolvedValueOnce([{ id: 9 }]); // counterpart team found
      mockDb.limit.mockResolvedValueOnce([{ id: 42 }]); // already-pending trade found
      const resolver = getResolver('proposeDraftSlotTrade');
      await expect(
        resolver(
          {},
          { leagueId: 1, counterpartTeamId: 9 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('already have a pending draft slot trade');
    });

    it('creates a proposed trade on success', async () => {
      mockDb.limit.mockResolvedValueOnce([openLeague]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      mockDb.limit.mockResolvedValueOnce([{ id: 9 }]);
      mockDb.limit.mockResolvedValueOnce([]); // no duplicate pending

      const insertedTrade = {
        id: 55,
        leagueId: 1,
        proposerTeamId: 5,
        counterpartTeamId: 9,
        status: 'proposed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.returning.mockResolvedValueOnce([insertedTrade]);

      queueNotificationNoOp();
      queueEnrich(insertedTrade);

      const resolver = getResolver('proposeDraftSlotTrade');
      const result = await resolver(
        {},
        { leagueId: 1, counterpartTeamId: 9 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({
        id: 55,
        status: 'proposed',
        proposerTeamName: 'Proposer FC',
        counterpartTeamName: 'Counterpart FC',
      });
    });
  });

  // ── respondDraftSlotTrade ────────────────────────────────────────────────

  describe('respondDraftSlotTrade', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('respondDraftSlotTrade');
      await expect(
        resolver(
          {},
          { tradeId: 1, accept: true },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when the trade does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      const resolver = getResolver('respondDraftSlotTrade');
      await expect(
        resolver(
          {},
          { tradeId: 999, accept: true },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('not found');
    });

    it('throws when the trade is not in proposed status', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'declined',
        },
      ]);
      const resolver = getResolver('respondDraftSlotTrade');
      await expect(
        resolver(
          {},
          { tradeId: 1, accept: true },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('already been declined');
    });

    it('throws when the caller is not the counterpart team', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'proposed',
        },
      ]);
      // caller owns the PROPOSER team, not the counterpart
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      const resolver = getResolver('respondDraftSlotTrade');
      await expect(
        resolver(
          {},
          { tradeId: 1, accept: true },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('counterpart team');
    });

    it('throws when the counterpart-side caller is only an assistant manager', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'proposed',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 9, permissionLevel: 'assistant_manager' },
      ]);
      const resolver = getResolver('respondDraftSlotTrade');
      await expect(
        resolver(
          {},
          { tradeId: 1, accept: true },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('general manager');
    });

    it('throws when the counterpart team is locked', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'proposed',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 9, permissionLevel: 'general_manager' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: true }]);
      const resolver = getResolver('respondDraftSlotTrade');
      await expect(
        resolver(
          {},
          { tradeId: 1, accept: true },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('locked by the commissioner');
    });

    it('accepts a proposed trade (status machine: proposed -> accepted)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'proposed',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 9, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      mockDb.limit.mockResolvedValueOnce([openLeague]); // assertDraftSlotTradingOpen re-check

      // update(...).set(...).where(...) — first 4 .where() calls above chained
      // via the default mockReturnThis(); this 5th .where() is the claim UPDATE's
      // terminal call and must resolve the rowCount.
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      const updatedTrade = {
        id: 1,
        leagueId: 1,
        proposerTeamId: 5,
        counterpartTeamId: 9,
        status: 'accepted',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queueNotificationNoOp();
      queueEnrich(updatedTrade);

      const resolver = getResolver('respondDraftSlotTrade');
      const result = await resolver(
        {},
        { tradeId: 1, accept: true },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ id: 1, status: 'accepted' });
    });

    it('declines a proposed trade (status machine: proposed -> declined)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'proposed',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 9, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      mockDb.limit.mockResolvedValueOnce([openLeague]);

      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce({ rowCount: 1 });

      const updatedTrade = {
        id: 1,
        leagueId: 1,
        proposerTeamId: 5,
        counterpartTeamId: 9,
        status: 'declined',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queueNotificationNoOp();
      queueEnrich(updatedTrade);

      const resolver = getResolver('respondDraftSlotTrade');
      const result = await resolver(
        {},
        { tradeId: 1, accept: false },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ id: 1, status: 'declined' });
    });

    it('throws on a concurrent double-response race (claim rowCount 0)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'proposed',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 9, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      mockDb.limit.mockResolvedValueOnce([openLeague]);

      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce({ rowCount: 0 });

      const resolver = getResolver('respondDraftSlotTrade');
      await expect(
        resolver(
          {},
          { tradeId: 1, accept: true },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('already been responded to');
    });
  });

  // ── approveDraftSlotTrade ────────────────────────────────────────────────

  describe('approveDraftSlotTrade', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getResolver('approveDraftSlotTrade');
      await expect(
        resolver({}, { tradeId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when the trade is not accepted', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'proposed',
        },
      ]);
      const resolver = getResolver('approveDraftSlotTrade');
      await expect(
        resolver({}, { tradeId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Only accepted draft slot trades can be approved');
    });

    it('throws when the caller is not the commissioner', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'accepted',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([
        { permissionLevel: 'general_manager' },
      ]);
      const resolver = getResolver('approveDraftSlotTrade');
      await expect(
        resolver({}, { tradeId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('Only the league Commissioner');
    });

    it('approves and atomically executes the swap (status machine: accepted -> executed)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'accepted',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);
      mockDb.limit.mockResolvedValueOnce([openLeague]); // assertDraftSlotTradingOpen re-check

      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn(),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
      mockTx.where
        .mockResolvedValueOnce({ rowCount: 1 }) // 1. claim: accepted -> approved
        .mockReturnValueOnce(mockTx) // 2. getActiveDraftId chain (-> orderBy().limit())
        .mockReturnValueOnce(mockTx) // 3. ensureDraftTeamsSeeded existing-check chain (-> limit())
        .mockResolvedValueOnce([
          // 4. swapDraftOrder: current draft_teams rows for both sides
          { teamId: 5, draftOrder: 3 },
          { teamId: 9, draftOrder: 7 },
        ])
        .mockResolvedValueOnce(undefined) // 5. sentinel update
        .mockResolvedValueOnce(undefined) // 6. counterpart <- proposer's order
        .mockResolvedValueOnce(undefined) // 7. proposer <- counterpart's order
        .mockResolvedValueOnce(undefined); // 8. final status -> executed
      mockTx.limit
        .mockResolvedValueOnce([{ id: 77 }]) // getActiveDraftId
        .mockResolvedValueOnce([{ teamId: 1 }]); // ensureDraftTeamsSeeded: rows already exist

      mockDb.transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
      );

      const updatedTrade = {
        id: 1,
        leagueId: 1,
        proposerTeamId: 5,
        counterpartTeamId: 9,
        status: 'executed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      queueNotificationNoOp();
      queueEnrich(updatedTrade);

      const resolver = getResolver('approveDraftSlotTrade');
      const result = await resolver(
        {},
        { tradeId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ id: 1, status: 'executed' });
    });

    it('throws on a concurrent double-approval race (claim rowCount 0)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 1,
          leagueId: 1,
          proposerTeamId: 5,
          counterpartTeamId: 9,
          status: 'accepted',
        },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);
      mockDb.limit.mockResolvedValueOnce([openLeague]);

      const mockTx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce({ rowCount: 0 }),
      };
      mockDb.transaction = jest.fn(
        async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
      );

      const resolver = getResolver('approveDraftSlotTrade');
      await expect(
        resolver({}, { tradeId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('already been approved or is no longer accepted');
    });
  });

  // ── leagueDraftSlotTrades ────────────────────────────────────────────────

  describe('leagueDraftSlotTrades', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQueryResolver('leagueDraftSlotTrades');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when the caller is not a member of the league', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // getLeagueMembership: no row
      const resolver = getQueryResolver('leagueDraftSlotTrades');
      await expect(
        resolver({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toThrow('not a member of this league');
    });

    it('returns an empty list when the league has no trades', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]); // getLeagueMembership
      mockDb.orderBy.mockResolvedValueOnce([]); // trades select

      const resolver = getQueryResolver('leagueDraftSlotTrades');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns trades for the league enriched with team names, newest first', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]); // getLeagueMembership
      mockDb.orderBy.mockResolvedValueOnce([
        {
          id: 2,
          leagueId: 1,
          proposerTeamId: 9,
          counterpartTeamId: 5,
          status: 'proposed',
          createdAt: new Date('2026-01-02'),
          updatedAt: new Date('2026-01-02'),
        },
      ]);
      // .where() is called 3x before this point (membership select, trades
      // select before .orderBy()); both chain through via the default
      // mockReturnThis() — only the teams select's .where() is terminal.
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce([
        { id: 5, name: 'Proposer FC' },
        { id: 9, name: 'Counterpart FC' },
      ]); // teams select

      const resolver = getQueryResolver('leagueDraftSlotTrades');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([
        expect.objectContaining({
          id: 2,
          proposerTeamName: 'Counterpart FC',
          counterpartTeamName: 'Proposer FC',
        }),
      ]);
    });
  });
});
