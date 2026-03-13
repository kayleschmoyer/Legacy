import type { GraphQLSchema } from 'graphql';

describe('Playoff Resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;
  let mockPlayoffService: any;

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
      // Make the mock directly awaitable when no explicit terminator
      then: jest.fn((resolve) => resolve([])),
    };

    mockPlayoffService = {
      createBracket: jest.fn(),
      advanceBracket: jest.fn(),
      awardChampionship: jest.fn(),
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
        playoffBrackets: {
          id: 'id',
          leagueId: 'leagueId',
          season: 'season',
          format: 'format',
          startWeek: 'startWeek',
          endWeek: 'endWeek',
          championTeamId: 'championTeamId',
          status: 'status',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        playoffMatchups: {
          id: 'id',
          bracketId: 'bracketId',
          round: 'round',
          matchupNumber: 'matchupNumber',
          highSeedTeamId: 'highSeedTeamId',
          lowSeedTeamId: 'lowSeedTeamId',
          winnerTeamId: 'winnerTeamId',
          highSeedScore: 'highSeedScore',
          lowSeedScore: 'lowSeedScore',
          weekNumber: 'weekNumber',
          status: 'status',
          isMultiWeek: 'isMultiWeek',
        },
        playoffSeeds: {
          id: 'id',
          bracketId: 'bracketId',
          teamId: 'teamId',
          seedNumber: 'seedNumber',
          regularSeasonWins: 'regularSeasonWins',
          regularSeasonLosses: 'regularSeasonLosses',
          pointsFor: 'pointsFor',
        },
        championTrophies: {
          id: 'id',
          leagueId: 'leagueId',
          season: 'season',
          teamId: 'teamId',
          championshipWeek: 'championshipWeek',
          finalScore: 'finalScore',
          runnerUpTeamId: 'runnerUpTeamId',
          runnerUpScore: 'runnerUpScore',
          awardedAt: 'awardedAt',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagues: { id: 'id', name: 'name' },
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
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
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

    // Mock the PlayoffService (dynamically imported in resolvers)
    jest.doMock('../services/playoff-service', () => ({
      PlayoffService: mockPlayoffService,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: true },
      db: mockDb,
      loaders: {
        teams: { load: jest.fn().mockResolvedValue({ id: 1, name: 'Team A' }) },
        playoffMatchupsByBracket: { load: jest.fn().mockResolvedValue([]) },
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

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
    loaders: null,
  };

  // ── getPlayoffBracket ──────────────────────────────────────────────────────

  describe('getPlayoffBracket query', () => {
    it('returns null when no bracket exists', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const resolver = getQuery('getPlayoffBracket');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toBeNull();
    });

    it('returns bracket when found', async () => {
      const mockBracket = {
        id: 1,
        leagueId: 1,
        season: 2024,
        format: '4-team',
        startWeek: 14,
        endWeek: 16,
        championTeamId: null,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockDb.limit.mockResolvedValueOnce([mockBracket]);

      const resolver = getQuery('getPlayoffBracket');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ id: 1, leagueId: 1, season: 2024 });
    });

    it('filters by season when provided', async () => {
      const mockBracket = {
        id: 2,
        leagueId: 1,
        season: 2023,
        format: '4-team',
        startWeek: 14,
        endWeek: 16,
        championTeamId: 5,
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockDb.limit.mockResolvedValueOnce([mockBracket]);

      const resolver = getQuery('getPlayoffBracket');
      const result = await resolver(
        {},
        { leagueId: 1, season: 2023 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ season: 2023 });
    });
  });

  // ── getPlayoffSeeds ────────────────────────────────────────────────────────

  describe('getPlayoffSeeds query', () => {
    it('returns empty array when no seeds', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const resolver = getQuery('getPlayoffSeeds');
      const result = await resolver(
        {},
        { bracketId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns seeds for a bracket', async () => {
      const mockSeeds = [
        {
          id: 1,
          bracketId: 1,
          teamId: 1,
          seedNumber: 1,
          regularSeasonWins: 10,
          regularSeasonLosses: 3,
          pointsFor: '1500.5',
        },
        {
          id: 2,
          bracketId: 1,
          teamId: 2,
          seedNumber: 2,
          regularSeasonWins: 9,
          regularSeasonLosses: 4,
          pointsFor: '1400.0',
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockSeeds);

      const resolver = getQuery('getPlayoffSeeds');
      const result = (await resolver(
        {},
        { bracketId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 1, seedNumber: 1 });
    });
  });

  // ── getChampionshipTrophies ────────────────────────────────────────────────

  describe('getChampionshipTrophies query', () => {
    it('returns empty array when no trophies', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const resolver = getQuery('getChampionshipTrophies');
      const result = await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns trophies with ISO string dates', async () => {
      const now = new Date();
      const mockTrophies = [
        {
          id: 1,
          leagueId: 1,
          season: 2023,
          teamId: 4,
          championshipWeek: 16,
          finalScore: '145.6',
          runnerUpTeamId: 7,
          runnerUpScore: '138.2',
          awardedAt: now.toISOString(),
          createdAt: now,
          updatedAt: now,
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockTrophies);

      const resolver = getQuery('getChampionshipTrophies');
      const result = (await resolver(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ season: 2023, teamId: 4 });
      // dates should be ISO strings
      expect(typeof result[0].createdAt).toBe('string');
      expect(typeof result[0].updatedAt).toBe('string');
    });
  });

  // ── createPlayoffBracket ───────────────────────────────────────────────────

  describe('createPlayoffBracket mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('createPlayoffBracket');
      await expect(
        resolver(
          {},
          { leagueId: 1, season: 2024, format: '4-team', startWeek: 14 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('calls PlayoffService.createBracket and returns bracket', async () => {
      const mockBracket = {
        id: 1,
        leagueId: 1,
        season: 2024,
        format: '4-team',
        startWeek: 14,
        endWeek: 16,
        championTeamId: null,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockPlayoffService.createBracket.mockResolvedValueOnce(mockBracket);

      const resolver = getMutation('createPlayoffBracket');
      const result = await resolver(
        {},
        { leagueId: 1, season: 2024, format: '4-team', startWeek: 14 },
        mockContext,
        undefined as never,
      );

      expect(mockPlayoffService.createBracket).toHaveBeenCalledWith(
        mockDb,
        expect.objectContaining({
          leagueId: 1,
          season: 2024,
          format: '4-team',
        }),
      );
      expect(result).toMatchObject({ id: 1, season: 2024 });
    });
  });

  // ── advancePlayoffBracket ──────────────────────────────────────────────────

  describe('advancePlayoffBracket mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('advancePlayoffBracket');
      await expect(
        resolver({}, { bracketId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('calls PlayoffService.advanceBracket and returns bracket', async () => {
      const mockBracket = {
        id: 1,
        leagueId: 1,
        season: 2024,
        format: '4-team',
        startWeek: 14,
        endWeek: 16,
        championTeamId: null,
        status: 'in_progress',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockPlayoffService.advanceBracket.mockResolvedValueOnce(mockBracket);

      const resolver = getMutation('advancePlayoffBracket');
      const result = await resolver(
        {},
        { bracketId: 1 },
        mockContext,
        undefined as never,
      );

      expect(mockPlayoffService.advanceBracket).toHaveBeenCalledWith(mockDb, 1);
      expect(result).toMatchObject({ status: 'in_progress' });
    });
  });

  // ── updatePlayoffMatchup ───────────────────────────────────────────────────

  describe('updatePlayoffMatchup mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('updatePlayoffMatchup');
      await expect(
        resolver(
          {},
          { matchupId: 1, highSeedScore: 100, lowSeedScore: 95 },
          unauthCtx,
          undefined as never,
        ),
      ).rejects.toThrow('Authentication required');
    });

    it('updates matchup and returns result', async () => {
      const mockMatchup = {
        id: 1,
        bracketId: 1,
        round: 'semifinals',
        matchupNumber: 1,
        highSeedTeamId: 1,
        lowSeedTeamId: 2,
        winnerTeamId: null,
        highSeedScore: null,
        lowSeedScore: null,
        weekNumber: 14,
        status: 'scheduled',
        isMultiWeek: false,
      };

      // limit() called when determining winner: returns matchup
      mockDb.limit.mockResolvedValueOnce([mockMatchup]);
      // returning() called for the update
      mockDb.returning.mockResolvedValueOnce([
        {
          ...mockMatchup,
          highSeedScore: '100',
          lowSeedScore: '95',
          status: 'completed',
          winnerTeamId: 1,
        },
      ]);

      const resolver = getMutation('updatePlayoffMatchup');
      const result = (await resolver(
        {},
        { matchupId: 1, highSeedScore: 100, lowSeedScore: 95 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({ id: 1, status: 'completed' });
    });
  });

  // ── awardChampionship ──────────────────────────────────────────────────────

  describe('awardChampionship mutation', () => {
    it('throws when unauthenticated', async () => {
      const resolver = getMutation('awardChampionship');
      await expect(
        resolver({}, { bracketId: 1 }, unauthCtx, undefined as never),
      ).rejects.toThrow('Authentication required');
    });

    it('calls PlayoffService.awardChampionship and returns trophy', async () => {
      const now = new Date();
      const mockTrophy = {
        id: 1,
        leagueId: 1,
        season: 2024,
        teamId: 3,
        championshipWeek: 16,
        finalScore: '155.2',
        runnerUpTeamId: null,
        runnerUpScore: null,
        awardedAt: now.toISOString(),
        createdAt: now,
        updatedAt: now,
      };
      mockPlayoffService.awardChampionship.mockResolvedValueOnce(mockTrophy);
      // badge award: leagueMembers lookup
      mockDb.limit.mockResolvedValueOnce([{ userId: 5 }]);

      const resolver = getMutation('awardChampionship');
      const result = (await resolver(
        {},
        { bracketId: 1 },
        mockContext,
        undefined as never,
      )) as Record<string, unknown>;

      expect(mockPlayoffService.awardChampionship).toHaveBeenCalledWith(
        mockDb,
        1,
      );
      expect(result).toMatchObject({ season: 2024, teamId: 3 });
      expect(typeof result.createdAt).toBe('string');
    });
  });
});
