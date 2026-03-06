import type { GraphQLSchema } from 'graphql';
// Removed graphql import - testing resolvers directly to avoid module realm conflicts

describe('Matchup Queries', () => {
  let schema: GraphQLSchema;
  let mockDb: any;
  let mockContext: any;

  beforeEach(async () => {
    jest.resetModules();

    // Mock database operations
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      // Make the mock awaitable - when queries don't have explicit terminators
      // like limit() or orderBy() with mockResolvedValue, they await mockDb itself
      then: jest.fn((resolve) => resolve([])),
    };

    // Mock database utilities
    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    // Mock the database client
    // Import the real functions that we need to pass through
    const actualDbClient = jest.requireActual('@legacy-sports/db-client');

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(), // Mock database service initialization
      runWithPublicClient: jest.fn(async (options, callback) => {
        return callback(mockDb);
      }),
      createLeagueService: jest.fn(() => ({
        createLeague: jest.fn(),
      })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      PublicSchema: {
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
          status: 'status',
        },
        teams: {
          id: 'id',
          name: 'name',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'matchupId',
        },
        leagues: {
          id: 'id',
          name: 'name',
          currentMatchup: 'currentMatchup',
        },
        teamMembers: {
          playerId: 'playerId',
          positionId: 'positionId',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'playerId',
          season: 'season',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
        },
      },
      // Pass through the real matchup-history functions
      calculateStandings: actualDbClient.calculateStandings,
      getHeadToHeadRecord: actualDbClient.getHeadToHeadRecord,
      getMatchupStatusCounts: actualDbClient.getMatchupStatusCounts,
      getSeasonResults: actualDbClient.getSeasonResults,
      getPlayoffQualifications: actualDbClient.getPlayoffQualifications,
      getRecentMatchupsForTeam: actualDbClient.getRecentMatchupsForTeam,
      queryHistoricalMatchups: actualDbClient.queryHistoricalMatchups,
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

    // Mock StandingsService for all resolvers that use it
    jest.doMock('../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: jest.fn(),
        getMatchupStats: jest.fn(),
      },
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

  describe('getMatchupById query', () => {
    const getMatchupByIdQuery = `
      query GetMatchupById($matchupId: Int!) {
        getMatchupById(matchupId: $matchupId) {
          id
          weekNumber
          status
        }
      }
    `;

    it('should return matchup when it exists', async () => {
      const mockMatchup = {
        id: 1,
        leagueId: 1,
        weekNumber: 1,
        status: 'scheduled',
        team1Id: 1,
        team2Id: 2,
        team1Score: null,
        team2Score: null,
      };

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([mockMatchup]);

      const queryType = schema.getQueryType();
      const getMatchupByIdField = queryType?.getFields().getMatchupById;
      if (!getMatchupByIdField?.resolve) {
        throw new Error('getMatchupById resolver not found');
      }

      const result = await getMatchupByIdField.resolve(
        {},
        { matchupId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({
        id: 1,
        weekNumber: 1,
        status: 'scheduled',
      });
    });

    it('should return null when matchup does not exist', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);

      const queryType = schema.getQueryType();
      const getMatchupByIdField = queryType?.getFields().getMatchupById;
      if (!getMatchupByIdField?.resolve) {
        throw new Error('getMatchupById resolver not found');
      }

      const result = await getMatchupByIdField.resolve(
        {},
        { matchupId: 999 },
        mockContext,
        undefined as never,
      );

      expect(result).toBeNull();
    });
  });

  describe('getMatchupsForLeague query', () => {
    const getMatchupsForLeagueQuery = `
      query GetMatchupsForLeague($leagueId: Int!) {
        getMatchupsForLeague(leagueId: $leagueId) {
          id
          weekNumber
          status
        }
      }
    `;

    it('should return all matchups for a league', async () => {
      const mockMatchups = [
        { id: 1, leagueId: 1, weekNumber: 1, status: 'completed' },
        { id: 2, leagueId: 1, weekNumber: 2, status: 'in_progress' },
        { id: 3, leagueId: 1, weekNumber: 3, status: 'scheduled' },
      ];

      // Real resolver uses: db.select().from().where() - no orderBy
      mockDb.select.mockReturnValueOnce(mockDb);
      mockDb.from.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce(mockMatchups);

      const queryType = schema.getQueryType();
      const getMatchupsForLeagueField =
        queryType?.getFields().getMatchupsForLeague;
      if (!getMatchupsForLeagueField?.resolve) {
        throw new Error('getMatchupsForLeague resolver not found');
      }

      const result = await getMatchupsForLeagueField.resolve(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toHaveLength(3);
      expect((result as any)?.[0]?.weekNumber).toBe(1);
    });

    it('should return empty array when league has no matchups', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.orderBy.mockResolvedValue([]);

      const queryType = schema.getQueryType();
      const getMatchupsForLeagueField =
        queryType?.getFields().getMatchupsForLeague;
      if (!getMatchupsForLeagueField?.resolve) {
        throw new Error('getMatchupsForLeague resolver not found');
      }

      const result = await getMatchupsForLeagueField.resolve(
        {},
        { leagueId: 999 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });
  });

  describe('getCurrentMatchupForLeague query', () => {
    const getCurrentMatchupQuery = `
      query GetCurrentMatchup($leagueId: Int!) {
        getCurrentMatchupForLeague(leagueId: $leagueId) {
          id
          weekNumber
          status
        }
      }
    `;

    it('should return the current matchup in progress', async () => {
      const mockLeague = {
        currentWeek: 2,
        currentMatchup: 2,
        currentWeek: 2,
      };

      const mockMatchup = {
        id: 2,
        leagueId: 1,
        weekNumber: 2,
        status: 'in_progress',
      };

      // First query: get league's currentWeek (or fall back to currentMatchup FK)
      mockDb.select.mockReturnValueOnce(mockDb).mockReturnValueOnce(mockDb); // Second query: get matchup details

      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);

      // First limit returns league with currentMatchup ID
      mockDb.limit
        .mockResolvedValueOnce([mockLeague])
        // Second limit returns the actual matchup
        .mockResolvedValueOnce([mockMatchup]);

      const queryType = schema.getQueryType();
      const getCurrentMatchupForLeagueField =
        queryType?.getFields().getCurrentMatchupForLeague;
      if (!getCurrentMatchupForLeagueField?.resolve) {
        throw new Error('getCurrentMatchupForLeague resolver not found');
      }

      const result = await getCurrentMatchupForLeagueField.resolve(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({
        id: 2,
        status: 'in_progress',
      });
    });

    it('should return null when no matchup is in progress', async () => {
      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockReturnValue(mockDb);
      mockDb.orderBy.mockReturnValue(mockDb);
      mockDb.limit.mockResolvedValue([]);

      const queryType = schema.getQueryType();
      const getCurrentMatchupForLeagueField =
        queryType?.getFields().getCurrentMatchupForLeague;
      if (!getCurrentMatchupForLeagueField?.resolve) {
        throw new Error('getCurrentMatchupForLeague resolver not found');
      }

      const result = await getCurrentMatchupForLeagueField.resolve(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toBeNull();
    });
  });

  describe('getMatchupsByWeek query', () => {
    const getMatchupsByWeekQuery = `
      query GetMatchupsByWeek($leagueId: Int!, $weekNumber: Int!) {
        getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
          id
          weekNumber
          status
        }
      }
    `;

    it('should return matchups for a specific week', async () => {
      const mockMatchups = [
        { id: 1, leagueId: 1, weekNumber: 2, status: 'completed' },
        { id: 2, leagueId: 1, weekNumber: 2, status: 'completed' },
      ];

      mockDb.select.mockReturnValue(mockDb);
      mockDb.from.mockReturnValue(mockDb);
      mockDb.where.mockResolvedValue(mockMatchups);

      const queryType = schema.getQueryType();
      const getMatchupsByWeekField = queryType?.getFields().getMatchupsByWeek;
      if (!getMatchupsByWeekField?.resolve) {
        throw new Error('getMatchupsByWeek resolver not found');
      }

      const result = await getMatchupsByWeekField.resolve(
        {},
        { leagueId: 1, weekNumber: 2 },
        mockContext,
        undefined as never,
      );

      expect(result).toHaveLength(2);
      expect((result as any)?.[0]?.weekNumber).toBe(2);
    });
  });

  describe('getLeagueStandings query', () => {
    const getLeagueStandingsQuery = `
      query GetLeagueStandings($leagueId: Int!) {
        getLeagueStandings(leagueId: $leagueId) {
          teamId
          teamName
          wins
          losses
          ties
          pointsFor
          pointsAgainst
        }
      }
    `;

    it('should return standings sorted by wins', async () => {
      // Mock StandingsService.getStandings
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const { StandingsService } = require('../services/standings-service') as {
        StandingsService: { getStandings: jest.Mock };
      };

      const mockStandings = [
        {
          teamId: 1,
          teamName: 'Team A',
          wins: 10,
          losses: 5,
          winPercentage: 0.667,
        },
        {
          teamId: 2,
          teamName: 'Team B',
          wins: 8,
          losses: 7,
          winPercentage: 0.533,
        },
      ];
      StandingsService.getStandings.mockResolvedValue(mockStandings);

      const queryType = schema.getQueryType();
      const getLeagueStandingsField = queryType?.getFields().getLeagueStandings;
      if (!getLeagueStandingsField?.resolve) {
        throw new Error('getLeagueStandings resolver not found');
      }

      const result = await getLeagueStandingsField.resolve(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toHaveLength(2);
      expect((result as any)?.[0]?.wins).toBeGreaterThan(
        (result as any)?.[1]?.wins,
      );
    });

    it('should return empty array for league with no matchups', async () => {
      // Mock StandingsService.getStandings returning empty array
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const { StandingsService } = require('../services/standings-service') as {
        StandingsService: { getStandings: jest.Mock };
      };
      StandingsService.getStandings.mockResolvedValue([]);

      const queryType = schema.getQueryType();
      const getLeagueStandingsField = queryType?.getFields().getLeagueStandings;
      if (!getLeagueStandingsField?.resolve) {
        throw new Error('getLeagueStandings resolver not found');
      }

      const result = await getLeagueStandingsField.resolve(
        {},
        { leagueId: 999 },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual([]);
    });
  });

  describe('getHeadToHeadRecord query', () => {
    const getHeadToHeadQuery = `
      query GetHeadToHead($leagueId: Int!, $team1Id: Int!, $team2Id: Int!) {
        getHeadToHeadRecord(leagueId: $leagueId, team1Id: $team1Id, team2Id: $team2Id) {
          team1Wins
          team2Wins
          ties
          totalMatchups
          team1PointsFor
          team2PointsFor
        }
      }
    `;

    it('should return head-to-head record between two teams', async () => {
      const mockRecord = {
        team1Wins: 2,
        team2Wins: 1,
        ties: 0,
        totalMatchups: 3,
        team1PointsFor: 300,
        team2PointsFor: 250,
      };

      // Mock StandingsService.getHeadToHead
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const { StandingsService } = require('../services/standings-service') as {
        StandingsService: { getHeadToHead: jest.Mock };
      };
      StandingsService.getHeadToHead.mockResolvedValue(mockRecord);

      const queryType = schema.getQueryType();
      const getHeadToHeadRecordField =
        queryType?.getFields().getHeadToHeadRecord;
      if (!getHeadToHeadRecordField?.resolve) {
        throw new Error('getHeadToHeadRecord resolver not found');
      }

      const result = await getHeadToHeadRecordField.resolve(
        {},
        { leagueId: 1, team1Id: 1, team2Id: 2 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({
        team1Wins: 2,
        team2Wins: 1,
        totalMatchups: 3,
      });
    });
  });

  describe('getMatchupStatusCounts query', () => {
    const getStatusCountsQuery = `
      query GetStatusCounts($leagueId: Int!) {
        getMatchupStatusCounts(leagueId: $leagueId) {
          scheduled
          inProgress
          completed
          cancelled
        }
      }
    `;

    it('should return counts of matchups by status', async () => {
      const mockMatchups = [
        { id: 1, leagueId: 1, weekNumber: 1, status: 'scheduled' },
        { id: 2, leagueId: 1, weekNumber: 2, status: 'scheduled' },
        { id: 3, leagueId: 1, weekNumber: 3, status: 'scheduled' },
        { id: 4, leagueId: 1, weekNumber: 4, status: 'scheduled' },
        { id: 5, leagueId: 1, weekNumber: 5, status: 'scheduled' },
        { id: 6, leagueId: 1, weekNumber: 6, status: 'in_progress' },
        { id: 7, leagueId: 1, weekNumber: 7, status: 'in_progress' },
        { id: 8, leagueId: 1, weekNumber: 8, status: 'completed' },
        { id: 9, leagueId: 1, weekNumber: 9, status: 'completed' },
        { id: 10, leagueId: 1, weekNumber: 10, status: 'completed' },
        { id: 11, leagueId: 1, weekNumber: 11, status: 'completed' },
        { id: 12, leagueId: 1, weekNumber: 12, status: 'completed' },
        { id: 13, leagueId: 1, weekNumber: 13, status: 'completed' },
        { id: 14, leagueId: 1, weekNumber: 14, status: 'completed' },
        { id: 15, leagueId: 1, weekNumber: 15, status: 'completed' },
        { id: 16, leagueId: 1, weekNumber: 16, status: 'completed' },
        { id: 17, leagueId: 1, weekNumber: 17, status: 'completed' },
        { id: 18, leagueId: 1, weekNumber: 18, status: 'cancelled' },
      ];

      // Mock StandingsService.getMatchupStats
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const { StandingsService } = require('../services/standings-service') as {
        StandingsService: { getMatchupStats: jest.Mock };
      };

      const mockStats = {
        scheduled: 5,
        inProgress: 2,
        completed: 10,
        cancelled: 1,
        total: 18,
      };
      StandingsService.getMatchupStats.mockResolvedValue(mockStats);

      const queryType = schema.getQueryType();
      const getMatchupStatusCountsField =
        queryType?.getFields().getMatchupStatusCounts;
      if (!getMatchupStatusCountsField?.resolve) {
        throw new Error('getMatchupStatusCounts resolver not found');
      }

      const result = await getMatchupStatusCountsField.resolve(
        {},
        { leagueId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({
        scheduled: 5,
        inProgress: 2,
        completed: 10,
        cancelled: 1,
      });
    });

    it('should return zero counts when league has no matchups', async () => {
      // Mock StandingsService.getMatchupStats returning zero counts
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
      const { StandingsService } = require('../services/standings-service') as {
        StandingsService: { getMatchupStats: jest.Mock };
      };

      const mockStats = {
        scheduled: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        total: 0,
      };
      StandingsService.getMatchupStats.mockResolvedValue(mockStats);

      const queryType = schema.getQueryType();
      const getMatchupStatusCountsField =
        queryType?.getFields().getMatchupStatusCounts;
      if (!getMatchupStatusCountsField?.resolve) {
        throw new Error('getMatchupStatusCounts resolver not found');
      }

      const result = await getMatchupStatusCountsField.resolve(
        {},
        { leagueId: 999 },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({
        scheduled: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
      });
    });
  });

  describe('getMatchupPlayers query', () => {
    const getMatchupPlayersQuery = `
      query GetMatchupPlayers($matchupId: Int!) {
        getMatchupPlayers(matchupId: $matchupId) {
          id
          playerId
          teamId
        }
      }
    `;

    it('should return all players in a matchup', async () => {
      const mockPlayers = [
        { id: 1, matchupId: 1, playerId: 100, teamId: 1 },
        { id: 2, matchupId: 1, playerId: 101, teamId: 1 },
        { id: 3, matchupId: 1, playerId: 200, teamId: 2 },
      ];

      // First query: get matchup with limit(1)
      mockDb.select.mockReturnValueOnce(mockDb);
      mockDb.from.mockReturnValueOnce(mockDb);
      mockDb.where.mockReturnValueOnce(mockDb);
      mockDb.limit.mockResolvedValueOnce([
        { matchupId: 1, leagueId: 1, weekNumber: 1 },
      ]);

      // Second query: get players
      mockDb.select.mockReturnValueOnce(mockDb);
      mockDb.from.mockReturnValueOnce(mockDb);
      mockDb.where.mockResolvedValueOnce(mockPlayers);

      const queryType = schema.getQueryType();
      const getMatchupPlayersField = queryType?.getFields().getMatchupPlayers;
      if (!getMatchupPlayersField?.resolve) {
        throw new Error('getMatchupPlayers resolver not found');
      }

      const result = await getMatchupPlayersField.resolve(
        {},
        { matchupId: 1 },
        mockContext,
        undefined as never,
      );

      expect(result).toHaveLength(3);
      expect((result as any[])[0]).toMatchObject({ playerId: 100, teamId: 1 });
    });
  });
});
