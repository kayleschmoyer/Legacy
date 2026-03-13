/**
 * Unit tests for the analytics GraphQL resolver (LS-746).
 *
 * Covers:
 *   - getTeamStatistics: auth, DB queries, analytics library delegation
 *   - getPlayoffProjections: auth, projection calculation
 *   - getLeagueAnalytics: auth, league-not-found, comprehensive analytics
 *
 * Note: getHeadToHeadRecord and getPowerRankings are defined in the matchups
 * resolver module (matchups/queries.ts) and tested in matchups.resolver.spec.ts.
 */

import type { GraphQLSchema } from 'graphql';

describe('analytics resolver', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    then: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };
  let mockCalculateTeamStats: jest.Mock;
  let mockCalculateTrends: jest.Mock;
  let mockCalculatePlayoffProjections: jest.Mock;
  let mockGenerateLeagueAnalytics: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockCalculateTeamStats = jest.fn().mockReturnValue([]);
    mockCalculateTrends = jest.fn().mockReturnValue([]);
    mockCalculatePlayoffProjections = jest.fn().mockReturnValue([]);
    mockGenerateLeagueAnalytics = jest.fn().mockReturnValue({
      leagueId: 1,
      leagueName: 'Test League',
      currentWeek: 1,
      totalTeams: 0,
      averagePointsPerMatchup: 0,
      teamStats: [],
      powerRankings: [],
      playoffProjections: [],
    });

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) => resolve([])),
    };

    jest.doMock('@legacy-sports/analytics', () => ({
      calculateTeamStats: mockCalculateTeamStats,
      calculateTrends: mockCalculateTrends,
      calculatePlayoffProjections: mockCalculatePlayoffProjections,
      generateLeagueAnalytics: mockGenerateLeagueAnalytics,
    }));

    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
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
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'currentWeek',
          currentMatchup: 'currentMatchup',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
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
        players: { id: 'id', firstName: 'firstName', lastName: 'lastName' },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
          status: 'status',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'matchupId',
          playerId: 'playerId',
          teamId: 'teamId',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'playerId',
          season: 'season',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'leagueId',
          season: 'season',
          playerId: 'playerId',
          awardType: 'awardType',
          notes: 'notes',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
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
      PublicDb: {},
    }));

    jest.doMock('../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: jest.fn(),
        getMatchupStats: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── getTeamStatistics ──────────────────────────────────────────────────────

  describe('getTeamStatistics query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().getTeamStatistics;
      if (!field?.resolve)
        throw new Error('getTeamStatistics resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          {},
          { leagueId: 1, startWeek: null, endWeek: null },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns team statistics from the analytics library', async () => {
      const expectedStats = [
        {
          teamId: 1,
          teamName: 'Team A',
          wins: 3,
          losses: 1,
          ties: 0,
          totalPoints: 120,
          averagePoints: 30,
          matchupsPlayed: 4,
          winPercentage: 0.75,
          currentStreak: 'W',
          currentStreakCount: 2,
          longestWinStreak: 3,
          longestLoseStreak: 1,
        },
      ];
      mockCalculateTeamStats.mockReturnValue(expectedStats);

      // First then: teams query, Second then: matchups query
      mockDb.then
        .mockImplementationOnce((resolve) =>
          resolve([{ id: 1, name: 'Team A' }]),
        )
        .mockImplementationOnce((resolve) => resolve([]));

      const result = await getResolver()(
        {},
        { leagueId: 1, startWeek: null, endWeek: null },
        mockContext,
        undefined as never,
      );

      expect(mockCalculateTeamStats).toHaveBeenCalled();
      expect(result).toEqual(expectedStats);
    });

    it('passes startWeek and endWeek options to the analytics library', async () => {
      mockCalculateTeamStats.mockReturnValue([]);
      mockDb.then
        .mockImplementationOnce((resolve) => resolve([]))
        .mockImplementationOnce((resolve) => resolve([]));

      await getResolver()(
        {},
        { leagueId: 1, startWeek: 2, endWeek: 8 },
        mockContext,
        undefined as never,
      );

      expect(mockCalculateTeamStats).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ startWeek: 2, endWeek: 8 }),
      );
    });
  });

  // ── getPlayoffProjections ─────────────────────────────────────────────────

  describe('getPlayoffProjections query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().getPlayoffProjections;
      if (!field?.resolve)
        throw new Error('getPlayoffProjections resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()(
          {},
          { leagueId: 1, playoffTeams: null, remainingWeeks: null },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('returns playoff projections from the analytics library', async () => {
      const expectedProjections = [
        {
          teamId: 1,
          teamName: 'Team A',
          currentRecord: '8-2',
          playoffProbability: 0.95,
          projectedWins: 10,
          projectedLosses: 2,
          strengthOfSchedule: 0.52,
          remainingMatchups: 2,
          magicNumber: 1,
          eliminationNumber: null,
        },
      ];
      mockCalculatePlayoffProjections.mockReturnValue(expectedProjections);

      mockDb.then
        .mockImplementationOnce((resolve) => resolve([]))
        .mockImplementationOnce((resolve) => resolve([]));

      const result = await getResolver()(
        {},
        { leagueId: 1, playoffTeams: 4, remainingWeeks: 2 },
        mockContext,
        undefined as never,
      );

      expect(mockCalculatePlayoffProjections).toHaveBeenCalled();
      expect(result).toEqual(expectedProjections);
    });
  });

  // ── getLeagueAnalytics ────────────────────────────────────────────────────

  describe('getLeagueAnalytics query', () => {
    function getResolver() {
      const queryType = schema.getQueryType();
      const field = queryType?.getFields().getLeagueAnalytics;
      if (!field?.resolve)
        throw new Error('getLeagueAnalytics resolver not found');
      return field.resolve.bind(field);
    }

    it('throws UNAUTHENTICATED when no user in context', async () => {
      mockContext.user = null;

      await expect(
        getResolver()({}, { leagueId: 1 }, mockContext, undefined as never),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });

    it('throws when the league is not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // league not found

      await expect(
        getResolver()({}, { leagueId: 99 }, mockContext, undefined as never),
      ).rejects.toThrow('League not found');
    });

    it('returns comprehensive league analytics', async () => {
      const analyticsResult = {
        leagueId: 1,
        leagueName: 'Fantasy Baseball 2024',
        currentWeek: 5,
        totalTeams: 8,
        averagePointsPerMatchup: 85.5,
        teamStats: [],
        powerRankings: [],
        playoffProjections: [],
      };
      mockGenerateLeagueAnalytics.mockReturnValue({ ...analyticsResult });
      mockCalculateTeamStats.mockReturnValue([]);
      mockCalculatePlayoffProjections.mockReturnValue([]);

      // League lookup - limit returns league
      mockDb.limit.mockResolvedValueOnce([
        { id: 1, name: 'Fantasy Baseball 2024', currentMatchup: null },
      ]);
      // Teams and matchups queries (thenable, no limit)
      mockDb.then
        .mockImplementationOnce((resolve) => resolve([])) // teams
        .mockImplementationOnce((resolve) => resolve([])); // matchups

      const result = (await getResolver()(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      )) as typeof analyticsResult;

      expect(mockGenerateLeagueAnalytics).toHaveBeenCalledWith(
        1,
        'Fantasy Baseball 2024',
        expect.any(Number),
        expect.anything(),
        expect.anything(),
      );
      expect(result.leagueId).toBe(1);
    });
  });
});
