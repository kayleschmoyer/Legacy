import type { GraphQLSchema } from 'graphql';

process.setMaxListeners(20);

describe('Statistics Resolver', () => {
  let schema: GraphQLSchema;
  let mockStatistics: any;

  beforeEach(async () => {
    jest.resetModules();

    mockStatistics = {
      getCareerBattingStats: jest.fn().mockResolvedValue([]),
      getCareerBattingStatsCount: jest.fn().mockResolvedValue(0),
      getCareerPitchingStats: jest.fn().mockResolvedValue([]),
      countCareerPitchingStats: jest.fn().mockResolvedValue(0),
      getCareerFieldingStats: jest.fn().mockResolvedValue([]),
      getPlayerCareerBatting: jest.fn().mockResolvedValue(null),
      getPlayerCareerPitching: jest.fn().mockResolvedValue(null),
      getPlayerCareerFielding: jest.fn().mockResolvedValue(null),
      getSeasonBattingStats: jest.fn().mockResolvedValue([]),
      getSeasonPitchingStats: jest.fn().mockResolvedValue([]),
      getSeasonFieldingStats: jest.fn().mockResolvedValue([]),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        statistics: mockStatistics,
      })),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb({}),
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
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
        },
        matchups: { id: 'id', leagueId: 'leagueId' },
        leagues: { id: 'id', name: 'name' },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
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
        commissionerAuditLog: { id: 'id', leagueId: 'leagueId' },
        leagueActivityEventType: { enumValues: [] },
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getQuery(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} resolver not found`);
    return field.resolve;
  }

  const emptyCtx = {} as never;

  // ── careerBattingStats ────────────────────────────────────────────────────

  describe('careerBattingStats query', () => {
    it('returns empty connection with no data', async () => {
      mockStatistics.getCareerBattingStats.mockResolvedValueOnce([]);
      mockStatistics.getCareerBattingStatsCount.mockResolvedValueOnce(0);

      const resolver = getQuery('careerBattingStats');
      const result = (await resolver(
        {},
        {},
        emptyCtx,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({
        edges: [],
        totalCount: 0,
        pageInfo: expect.objectContaining({
          hasNextPage: false,
          hasPreviousPage: false,
        }),
      });
    });

    it('returns paginated connection with data', async () => {
      const batting = [{ playerId: 1, homeRuns: 50 }];
      mockStatistics.getCareerBattingStats.mockResolvedValueOnce(batting);
      mockStatistics.getCareerBattingStatsCount.mockResolvedValueOnce(100);

      const resolver = getQuery('careerBattingStats');
      const result = (await resolver(
        {},
        { first: 1 },
        emptyCtx,
        undefined as never,
      )) as Record<string, unknown>;

      expect(result).toMatchObject({
        totalCount: 100,
        edges: [expect.objectContaining({ node: batting[0] })],
        pageInfo: expect.objectContaining({ hasNextPage: true }),
      });
    });

    it('passes filters to statistics service', async () => {
      mockStatistics.getCareerBattingStats.mockResolvedValueOnce([]);
      mockStatistics.getCareerBattingStatsCount.mockResolvedValueOnce(0);

      const resolver = getQuery('careerBattingStats');
      await resolver(
        {},
        { first: 10, minHomeRuns: 20, searchTerm: 'ruth' },
        emptyCtx,
        undefined as never,
      );

      expect(mockStatistics.getCareerBattingStats).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          filters: expect.objectContaining({
            minHomeRuns: 20,
            searchTerm: 'ruth',
          }),
        }),
      );
    });

    it('caps first at MAX_CAREER_BATTING_LIMIT (5000) when client requests more', async () => {
      mockStatistics.getCareerBattingStats.mockResolvedValueOnce([]);
      mockStatistics.getCareerBattingStatsCount.mockResolvedValueOnce(0);

      const resolver = getQuery('careerBattingStats');
      await resolver({}, { first: 30000 }, emptyCtx, undefined as never);

      expect(mockStatistics.getCareerBattingStats).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5000 }),
      );
    });

    it('clamps negative first to 0', async () => {
      mockStatistics.getCareerBattingStats.mockResolvedValueOnce([]);
      mockStatistics.getCareerBattingStatsCount.mockResolvedValueOnce(0);

      const resolver = getQuery('careerBattingStats');
      await resolver({}, { first: -1 }, emptyCtx, undefined as never);

      expect(mockStatistics.getCareerBattingStats).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 0 }),
      );
    });

    it('uses default limit of 25 when first is omitted', async () => {
      mockStatistics.getCareerBattingStats.mockResolvedValueOnce([]);
      mockStatistics.getCareerBattingStatsCount.mockResolvedValueOnce(0);

      const resolver = getQuery('careerBattingStats');
      await resolver({}, {}, emptyCtx, undefined as never);

      expect(mockStatistics.getCareerBattingStats).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 }),
      );
    });

    it('passes team filter to both data and count service calls', async () => {
      mockStatistics.getCareerBattingStats.mockResolvedValueOnce([]);
      mockStatistics.getCareerBattingStatsCount.mockResolvedValueOnce(0);

      const resolver = getQuery('careerBattingStats');
      await resolver({}, { team: 'NYY' }, emptyCtx, undefined as never);

      expect(mockStatistics.getCareerBattingStats).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ team: 'NYY' }),
        }),
      );
      expect(mockStatistics.getCareerBattingStatsCount).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ team: 'NYY' }),
        }),
      );
    });
  });

  // ── careerPitchingStats ────────────────────────────────────────────────────

  describe('careerPitchingStats query', () => {
    it('returns empty array when no data', async () => {
      const resolver = getQuery('careerPitchingStats');
      const result = await resolver({}, {}, emptyCtx, undefined as never);

      expect(result).toEqual([]);
    });

    it('returns pitching stats', async () => {
      const stats = [{ playerId: 1, wins: 20 }];
      mockStatistics.getCareerPitchingStats.mockResolvedValueOnce(stats);

      const resolver = getQuery('careerPitchingStats');
      const result = await resolver(
        {},
        { limit: 10 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(stats);
      expect(mockStatistics.getCareerPitchingStats).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('passes team filter to service', async () => {
      mockStatistics.getCareerPitchingStats.mockResolvedValueOnce([]);

      const resolver = getQuery('careerPitchingStats');
      await resolver({}, { team: 'BOS' }, emptyCtx, undefined as never);

      expect(mockStatistics.getCareerPitchingStats).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ team: 'BOS' }),
        }),
      );
    });
  });

  // ── careerPitchingStatsCount ───────────────────────────────────────────────

  describe('careerPitchingStatsCount query', () => {
    it('returns count', async () => {
      mockStatistics.countCareerPitchingStats.mockResolvedValueOnce(42);

      const resolver = getQuery('careerPitchingStatsCount');
      const result = await resolver({}, {}, emptyCtx, undefined as never);

      expect(result).toBe(42);
    });

    it('passes team filter to service', async () => {
      mockStatistics.countCareerPitchingStats.mockResolvedValueOnce(7);

      const resolver = getQuery('careerPitchingStatsCount');
      const result = await resolver(
        {},
        { team: 'LAD' },
        emptyCtx,
        undefined as never,
      );

      expect(result).toBe(7);
      expect(mockStatistics.countCareerPitchingStats).toHaveBeenCalledWith(
        expect.objectContaining({ team: 'LAD' }),
      );
    });
  });

  // ── careerFieldingStats ────────────────────────────────────────────────────

  describe('careerFieldingStats query', () => {
    it('returns fielding stats', async () => {
      const stats = [{ playerId: 1, fielding: 0.985 }];
      mockStatistics.getCareerFieldingStats.mockResolvedValueOnce(stats);

      const resolver = getQuery('careerFieldingStats');
      const result = await resolver({}, {}, emptyCtx, undefined as never);

      expect(result).toEqual(stats);
    });
  });

  // ── playerCareerBatting ────────────────────────────────────────────────────

  describe('playerCareerBatting query', () => {
    it('returns null when player not found', async () => {
      const resolver = getQuery('playerCareerBatting');
      const result = await resolver(
        {},
        { playerId: 999 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toBeNull();
    });

    it('returns player career batting stats', async () => {
      const stats = { playerId: 1, homeRuns: 100 };
      mockStatistics.getPlayerCareerBatting.mockResolvedValueOnce(stats);

      const resolver = getQuery('playerCareerBatting');
      const result = await resolver(
        {},
        { playerId: 1 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(stats);
      expect(mockStatistics.getPlayerCareerBatting).toHaveBeenCalledWith(1);
    });
  });

  // ── playerCareerPitching ───────────────────────────────────────────────────

  describe('playerCareerPitching query', () => {
    it('returns null when player not found', async () => {
      const resolver = getQuery('playerCareerPitching');
      const result = await resolver(
        {},
        { playerId: 999 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toBeNull();
    });

    it('returns player career pitching stats', async () => {
      const stats = { playerId: 2, wins: 200 };
      mockStatistics.getPlayerCareerPitching.mockResolvedValueOnce(stats);

      const resolver = getQuery('playerCareerPitching');
      const result = await resolver(
        {},
        { playerId: 2 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(stats);
    });
  });

  // ── playerCareerFielding ───────────────────────────────────────────────────

  describe('playerCareerFielding query', () => {
    it('returns null when player not found', async () => {
      const resolver = getQuery('playerCareerFielding');
      const result = await resolver(
        {},
        { playerId: 999 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toBeNull();
    });

    it('returns player career fielding stats', async () => {
      const stats = { playerId: 3, assists: 500 };
      mockStatistics.getPlayerCareerFielding.mockResolvedValueOnce(stats);

      const resolver = getQuery('playerCareerFielding');
      const result = await resolver(
        {},
        { playerId: 3 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(stats);
    });
  });

  // ── seasonBattingStats ─────────────────────────────────────────────────────

  describe('seasonBattingStats query', () => {
    it('returns empty array when no data', async () => {
      const resolver = getQuery('seasonBattingStats');
      const result = await resolver({}, {}, emptyCtx, undefined as never);

      expect(result).toEqual([]);
    });

    it('returns season batting stats with filters', async () => {
      const stats = [{ playerId: 1, season: 2022, homeRuns: 30 }];
      mockStatistics.getSeasonBattingStats.mockResolvedValueOnce(stats);

      const resolver = getQuery('seasonBattingStats');
      const result = await resolver(
        {},
        { season: 2022, playerId: 1 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(stats);
      expect(mockStatistics.getSeasonBattingStats).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ season: 2022, playerId: 1 }),
        }),
      );
    });
  });

  // ── seasonPitchingStats ────────────────────────────────────────────────────

  describe('seasonPitchingStats query', () => {
    it('returns season pitching stats', async () => {
      const stats = [{ playerId: 1, season: 2021, strikeouts: 200 }];
      mockStatistics.getSeasonPitchingStats.mockResolvedValueOnce(stats);

      const resolver = getQuery('seasonPitchingStats');
      const result = await resolver(
        {},
        { season: 2021 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(stats);
    });
  });

  // ── seasonFieldingStats ────────────────────────────────────────────────────

  describe('seasonFieldingStats query', () => {
    it('returns season fielding stats', async () => {
      const stats = [{ playerId: 1, season: 2020, putouts: 300 }];
      mockStatistics.getSeasonFieldingStats.mockResolvedValueOnce(stats);

      const resolver = getQuery('seasonFieldingStats');
      const result = await resolver({}, {}, emptyCtx, undefined as never);

      expect(result).toEqual(stats);
    });
  });

  // ── playerSeasonBatting ────────────────────────────────────────────────────

  describe('playerSeasonBatting query', () => {
    it('returns empty array when no seasons found', async () => {
      const resolver = getQuery('playerSeasonBatting');
      const result = await resolver(
        {},
        { playerId: 1 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual([]);
    });

    it('returns player season batting history', async () => {
      const seasons = [
        { playerId: 1, season: 2022, homeRuns: 30 },
        { playerId: 1, season: 2021, homeRuns: 22 },
      ];
      mockStatistics.getSeasonBattingStats.mockResolvedValueOnce(seasons);

      const resolver = getQuery('playerSeasonBatting');
      const result = await resolver(
        {},
        { playerId: 1 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toHaveLength(2);
      expect(mockStatistics.getSeasonBattingStats).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ playerId: 1 }),
        }),
      );
    });
  });

  // ── playerSeasonPitching ───────────────────────────────────────────────────

  describe('playerSeasonPitching query', () => {
    it('returns player season pitching history', async () => {
      const seasons = [{ playerId: 2, season: 2022, wins: 15 }];
      mockStatistics.getSeasonPitchingStats.mockResolvedValueOnce(seasons);

      const resolver = getQuery('playerSeasonPitching');
      const result = await resolver(
        {},
        { playerId: 2, season: 2022 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(seasons);
    });
  });

  // ── playerSeasonFielding ───────────────────────────────────────────────────

  describe('playerSeasonFielding query', () => {
    it('returns player season fielding history', async () => {
      const seasons = [{ playerId: 3, season: 2023, assists: 80 }];
      mockStatistics.getSeasonFieldingStats.mockResolvedValueOnce(seasons);

      const resolver = getQuery('playerSeasonFielding');
      const result = await resolver(
        {},
        { playerId: 3 },
        emptyCtx,
        undefined as never,
      );

      expect(result).toEqual(seasons);
    });
  });
});
