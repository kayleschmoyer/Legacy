import type { GraphQLSchema } from 'graphql';

describe('Waivers Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;
  let mockWaiverProcessor: any;

  beforeEach(async () => {
    jest.resetModules();

    mockWaiverProcessor = {
      process: jest.fn().mockResolvedValue({ processed: 0, failed: 0 }),
    };

    // Fluent Drizzle mock
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
      execute: jest.fn().mockResolvedValue({ rows: [] }),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    const actualDbClient = jest.requireActual('@legacy-sports/db-client');
    jest.doMock('@legacy-sports/db-client', () => ({
      ...actualDbClient,
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
        waiverClaims: {
          id: 'id',
          leagueId: 'leagueId',
          teamId: 'teamId',
          userId: 'userId',
          playerId: 'playerId',
          dropPlayerId: 'dropPlayerId',
          faabBid: 'faabBid',
          status: 'status',
          errorMessage: 'errorMessage',
          processedAt: 'processedAt',
          createdAt: 'createdAt',
        },
        players: {
          id: 'id',
          firstName: 'firstName',
          lastName: 'lastName',
          brefId: 'brefId',
        },
        leagues: {
          id: 'id',
          name: 'name',
          minCareerGames: 'minCareerGames',
          minCareerSeasons: 'minCareerSeasons',
          playerPool: 'playerPool',
          maxRosterSize: 'maxRosterSize',
          waiverType: 'waiverType',
          waiverEnabled: 'waiverEnabled',
          draftStatus: 'draftStatus',
          salaryCapEnabled: 'salaryCapEnabled',
          minSalary: 'minSalary',
          salaryCap: 'salaryCap',
          sport: 'sport',
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
        },
        playerSalaries: {
          leagueId: 'leagueId',
          playerId: 'playerId',
          currentSalary: 'currentSalary',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        matchups: { id: 'id', leagueId: 'leagueId' },
        matchupPlayers: { id: 'id', matchupId: 'matchupId' },
        matchupPlayerGames: { matchupPlayerId: 'matchupPlayerId' },
        leagueWeekPlayerSeasons: { playerId: 'playerId', leagueId: 'leagueId' },
        leagueAchievementRestrictions: { id: 'id', leagueId: 'leagueId' },
        leagueSeasonAwards: { id: 'id', leagueId: 'leagueId' },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'leagueId',
          eventType: 'eventType',
          occurredAt: 'occurredAt',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
    }));

    jest.doMock('../services/cap-service', () => ({
      assertCapSpace: jest.fn(),
      computeTeamPayroll: jest.fn().mockResolvedValue(0),
      computeTeamPayrollExcluding: jest.fn().mockResolvedValue(0),
      fetchPlayerSalaries: jest.fn().mockResolvedValue(new Map()),
    }));

    jest.doMock('../services/roster-service', () => ({
      checkRosterCapacity: jest
        .fn()
        .mockResolvedValue({ isFull: false, count: 5 }),
      isPlayerOnRoster: jest.fn().mockResolvedValue(false),
    }));

    jest.doMock('../services/waiver-processor', () => ({
      WaiverClaimProcessor: jest
        .fn()
        .mockImplementation(() => mockWaiverProcessor),
    }));

    jest.doMock('../services/activity-log', () => ({
      insertActivityLog: jest.fn().mockResolvedValue(undefined),
    }));

    jest.doMock('./waivers/helpers', () => ({
      validateFaabBudget: jest.fn().mockResolvedValue(undefined),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: true },
      db: mockDb,
      notificationService: {
        notifyRosterUpdate: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getQuery(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  function getMutation(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  const unauthCtx = {
    user: null,
    db: null,
    notificationService: null,
  };

  // ── freeAgents ─────────────────────────────────────────────────────────────

  describe('freeAgents query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('freeAgents');
      await expect(
        resolver({}, { leagueId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when league not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getQuery('freeAgents');
      await expect(
        resolver({}, { leagueId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('League not found');
    });

    it('returns empty array when no free agents', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { minCareerGames: 50, minCareerSeasons: 3, playerPool: null },
      ]);
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const resolver = getQuery('freeAgents');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns mapped player data from raw SQL rows', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { minCareerGames: 0, minCareerSeasons: 0, playerPool: null },
      ]);
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            id: 42,
            first_name: 'Babe',
            last_name: 'Ruth',
            bref_id: 'ruthba01',
            stats_last_fetched_at: null,
            all_star_selections: 0,
            gold_gloves: 0,
            silver_sluggers: 0,
            mvp_awards: 1,
            cy_young_awards: 0,
            world_series_rings: 7,
            hall_of_fame: true,
            rookie_of_the_year: false,
          },
        ],
      });

      const resolver = getQuery('freeAgents');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 42,
        firstName: 'Babe',
        lastName: 'Ruth',
        brefId: 'ruthba01',
        hallOfFame: true,
      });
    });

    it('includes sport filter in SQL for a football league', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          minCareerGames: 0,
          minCareerSeasons: 0,
          playerPool: null,
          sport: 'football',
        },
      ]);
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const resolver = getQuery('freeAgents');
      await resolver({}, { leagueId: 1 }, mockContext, undefined as never);

      const executeCalls = mockDb.execute.mock.calls as unknown[][];
      const sqlText = JSON.stringify(executeCalls[0]?.[0]);
      expect(sqlText).toContain('football');
    });

    it('defaults sport filter to baseball when league sport is null', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          minCareerGames: 0,
          minCareerSeasons: 0,
          playerPool: null,
          sport: null,
        },
      ]);
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const resolver = getQuery('freeAgents');
      await resolver({}, { leagueId: 1 }, mockContext, undefined as never);

      const executeCalls = mockDb.execute.mock.calls as unknown[][];
      const sqlText = JSON.stringify(executeCalls[0]?.[0]);
      expect(sqlText).toContain('baseball');
    });
  });

  // ── teamWaiverClaims ───────────────────────────────────────────────────────

  describe('teamWaiverClaims query', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getQuery('teamWaiverClaims');
      await expect(
        resolver({}, { teamId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('returns empty array when no claims', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const resolver = getQuery('teamWaiverClaims');
      const result = await resolver(
        {},
        { teamId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });
  });

  // ── cancelWaiverClaim ──────────────────────────────────────────────────────

  describe('cancelWaiverClaim mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('cancelWaiverClaim');
      await expect(
        resolver({}, { claimId: 5 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when claim not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getMutation('cancelWaiverClaim');
      await expect(
        resolver({}, { claimId: 999 }, mockContext, undefined as never),
      ).rejects.toThrow('Waiver claim not found');
    });

    it('throws when caller does not own the claim', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 5,
          userId: 999,
          status: 'pending',
          leagueId: 1,
          teamId: 1,
          playerId: 10,
        },
      ]);

      const resolver = getMutation('cancelWaiverClaim');
      await expect(
        resolver({}, { claimId: 5 }, mockContext, undefined as never),
      ).rejects.toThrow('cancel your own waiver claims');
    });

    it('throws when claim is not pending', async () => {
      mockDb.limit.mockResolvedValueOnce([
        {
          id: 5,
          userId: 1,
          status: 'completed',
          leagueId: 1,
          teamId: 1,
          playerId: 10,
        },
      ]);

      const resolver = getMutation('cancelWaiverClaim');
      await expect(
        resolver({}, { claimId: 5 }, mockContext, undefined as never),
      ).rejects.toThrow('Cannot cancel a waiver claim with status "completed"');
    });

    it('successfully cancels a pending claim', async () => {
      const mockClaim = {
        id: 5,
        userId: 1,
        status: 'pending',
        leagueId: 1,
        teamId: 2,
        playerId: 10,
      };
      mockDb.limit.mockResolvedValueOnce([mockClaim]);
      mockDb.returning.mockResolvedValueOnce([
        { ...mockClaim, status: 'cancelled' },
      ]);

      const resolver = getMutation('cancelWaiverClaim');
      const result = (await resolver(
        {},
        { claimId: 5 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ id: 5, status: 'cancelled' });
    });
  });

  // ── claimFreeAgent ─────────────────────────────────────────────────────────

  describe('claimFreeAgent mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('claimFreeAgent');
      await expect(
        resolver(
          {},
          { leagueId: 1, playerId: 10 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('throws when user has no team in the league', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // no membership

      const resolver = getMutation('claimFreeAgent');
      await expect(
        resolver(
          {},
          { leagueId: 1, playerId: 10 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('You do not have a team in this league');
    });

    it('throws when league not found', async () => {
      // membership found
      mockDb.limit
        .mockResolvedValueOnce([{ teamId: 2 }])
        // isPlayerOnRoster: select teamMembers, limit 1
        .mockResolvedValueOnce([])
        // existingClaim: limit 1
        .mockResolvedValueOnce([])
        // leagueRow: limit 1
        .mockResolvedValueOnce([]);

      const resolver = getMutation('claimFreeAgent');
      await expect(
        resolver(
          {},
          { leagueId: 1, playerId: 10 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('League not found');
    });

    it('throws when draft is not completed (new league)', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ teamId: 2 }]) // membership
        .mockResolvedValueOnce([
          {
            draftStatus: 'not-started',
            waiverEnabled: true,
            waiverType: 'standard',
            maxRosterSize: 25,
            salaryCapEnabled: false,
            minSalary: 1,
            salaryCap: null,
          },
        ]); // leagueRow → draftStatus !== 'completed' → throws

      const resolver = getMutation('claimFreeAgent');
      await expect(
        resolver(
          {},
          { leagueId: 1, playerId: 10 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(
        'Free agent claims are not available until the draft has been completed',
      );
    });

    it('throws when draft is in-progress (not yet completed)', async () => {
      mockDb.limit
        .mockResolvedValueOnce([{ teamId: 2 }]) // membership
        .mockResolvedValueOnce([
          {
            draftStatus: 'in-progress',
            waiverEnabled: true,
            waiverType: 'standard',
            maxRosterSize: 25,
            salaryCapEnabled: false,
            minSalary: 1,
            salaryCap: null,
          },
        ]); // leagueRow → draftStatus !== 'completed' → throws

      const resolver = getMutation('claimFreeAgent');
      await expect(
        resolver(
          {},
          { leagueId: 1, playerId: 10 },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow(
        'Free agent claims are not available until the draft has been completed',
      );
    });
  });

  // ── processWaiverClaims ────────────────────────────────────────────────────

  describe('processWaiverClaims mutation', () => {
    it('calls WaiverClaimProcessor.process and returns result', async () => {
      mockWaiverProcessor.process.mockResolvedValueOnce({
        processed: 5,
        failed: 1,
        results: [],
      });

      const resolver = getMutation('processWaiverClaims');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockWaiverProcessor.process).toHaveBeenCalledWith({ leagueId: 1 });
      expect(result).toMatchObject({ processed: 5, failed: 1 });
    });
  });
});
