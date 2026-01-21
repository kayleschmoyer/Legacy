/**
 * Unit tests for matchup history and standings calculations
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-argument */
// Test file uses any for mocking database interactions

import type { PublicDb } from './PublicDbClient';
import {
  calculateStandings,
  getHeadToHeadRecord,
  getMatchupStatusCounts,
  getPlayoffQualifications,
  getRecentMatchupsForTeam,
  getSeasonResults,
  type MatchupHistoryFilters,
  queryHistoricalMatchups,
} from './matchup-history';
import * as Schema from '../../drizzle/public/schema';

// Helper to create a chainable mock database
function createMockDbChain(finalResult: any): any {
  const chain = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };

  // Make all methods chain and also resolve to finalResult (for functions that don't call orderBy)
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);

  // where() can be awaited directly OR chained to orderBy()
  const whereResult = Object.assign(Promise.resolve(finalResult), chain);
  chain.where.mockReturnValue(whereResult);

  chain.orderBy.mockResolvedValue(finalResult);
  chain.limit.mockResolvedValue(finalResult);

  return chain;
}

// Helper to create a mock database that returns different results for multiple sequential queries
function createMockDbWithSequentialResults(results: any[]): any {
  const mockDb = {} as any;
  let callIndex = 0;

  mockDb.select = jest.fn().mockImplementation(() => {
    const currentResult = results[callIndex] || [];
    callIndex++;

    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
    };

    // where() can be awaited directly OR chained
    const whereResult = Object.assign(Promise.resolve(currentResult), {
      orderBy: jest.fn().mockResolvedValue(currentResult),
      limit: jest.fn().mockResolvedValue(currentResult),
    });
    chain.where.mockReturnValue(whereResult);
    chain.orderBy.mockResolvedValue(currentResult);
    chain.limit.mockResolvedValue(currentResult);

    return chain;
  });

  return mockDb;
}

describe('Matchup History', () => {
  let mockDb: PublicDb;

  beforeEach(() => {
    // Create a fresh mock for each test
    mockDb = createMockDbChain([]) as unknown as PublicDb;
  });

  describe('queryHistoricalMatchups', () => {
    it('should query matchups by league only', async () => {
      const mockData = [
        {
          id: 1,
          leagueId: 1,
          weekNumber: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100.5',
          team2Score: '95.0',
          status: 'completed',
          selectedSeason: 2023,
        },
      ];

      mockDb = createMockDbChain(mockData) as unknown as PublicDb;
      const filters: MatchupHistoryFilters = {
        leagueId: 1,
      };

      const results = await queryHistoricalMatchups(mockDb, filters);

      expect(results).toHaveLength(1);
      expect(results[0].leagueId).toBe(1);
    });

    it('should filter by season', async () => {
      const mockData = [
        {
          id: 1,
          leagueId: 1,
          selectedSeason: 2023,
          status: 'completed',
        },
      ];
      mockDb = createMockDbChain(mockData) as unknown as PublicDb;

      const filters: MatchupHistoryFilters = {
        leagueId: 1,
        season: 2023,
      };

      const results = await queryHistoricalMatchups(mockDb, filters);

      expect(results).toHaveLength(1);
      expect(results[0].selectedSeason).toBe(2023);
    });

    it('should filter by null season', async () => {
      const mockData = [
        {
          id: 1,
          leagueId: 1,
          selectedSeason: null,
          status: 'completed',
        },
      ];
      mockDb = createMockDbChain(mockData) as unknown as PublicDb;

      const filters: MatchupHistoryFilters = {
        leagueId: 1,
        season: null,
      };

      const results = await queryHistoricalMatchups(mockDb, filters);

      expect(results).toHaveLength(1);
    });

    it('should filter by team participation', async () => {
      const mockData = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 5,
          team2Id: 3,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 7,
          team2Id: 5,
          status: 'completed',
        },
      ];
      mockDb = createMockDbChain(mockData) as unknown as PublicDb;

      const filters: MatchupHistoryFilters = {
        leagueId: 1,
        teamId: 5,
      };

      const results = await queryHistoricalMatchups(mockDb, filters);

      expect(results).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const mockData = [
        {
          id: 1,
          leagueId: 1,
          status: 'completed',
        },
      ];
      mockDb = createMockDbChain(mockData) as unknown as PublicDb;

      const filters: MatchupHistoryFilters = {
        leagueId: 1,
        status: 'completed',
      };

      const results = await queryHistoricalMatchups(mockDb, filters);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('completed');
    });
  });

  describe('getHeadToHeadRecord', () => {
    it('should calculate head-to-head record with team1 winning more', async () => {
      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '85',
          team2Score: '95',
          status: 'completed',
        },
        {
          id: 3,
          leagueId: 1,
          team1Id: 2,
          team2Id: 1,
          team1Score: '80',
          team2Score: '90',
          status: 'completed',
        },
      ];

      mockDb = createMockDbChain(mockMatchups) as unknown as PublicDb;

      const record = await getHeadToHeadRecord(mockDb, 1, 1, 2);

      expect(record.team1Id).toBe(1);
      expect(record.team2Id).toBe(2);
      expect(record.team1Wins).toBe(2);
      expect(record.team2Wins).toBe(1);
      expect(record.ties).toBe(0);
      expect(record.totalMatchups).toBe(3);
      expect(record.team1TotalPoints).toBe(275);
      expect(record.team2TotalPoints).toBe(265);
    });

    it('should handle ties correctly', async () => {
      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '100',
          status: 'completed',
        },
      ];

      mockDb = createMockDbChain(mockMatchups) as unknown as PublicDb;

      const record = await getHeadToHeadRecord(mockDb, 1, 1, 2);

      expect(record.team1Wins).toBe(0);
      expect(record.team2Wins).toBe(0);
      expect(record.ties).toBe(1);
    });

    it('should handle reversed team positions in matchups', async () => {
      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 2,
          team2Id: 1,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
      ];

      mockDb = createMockDbChain(mockMatchups) as unknown as PublicDb;

      const record = await getHeadToHeadRecord(mockDb, 1, 1, 2);

      // Team 1 should have 0 wins, team 2 should have 1 win
      expect(record.team1Wins).toBe(0);
      expect(record.team2Wins).toBe(1);
      expect(record.team1TotalPoints).toBe(90);
      expect(record.team2TotalPoints).toBe(100);
    });

    it('should calculate average scores correctly', async () => {
      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '80',
          team2Score: '70',
          status: 'completed',
        },
      ];

      mockDb = createMockDbChain(mockMatchups) as unknown as PublicDb;

      const record = await getHeadToHeadRecord(mockDb, 1, 1, 2);

      expect(record.averageTeam1Score).toBe(90); // (100 + 80) / 2
      expect(record.averageTeam2Score).toBe(80); // (90 + 70) / 2
    });
  });

  describe('calculateStandings', () => {
    it('should calculate standings correctly for multiple teams', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
        { id: 3, name: 'Team C' },
      ];

      const mockMatchups = [
        // Team A wins over Team B
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
        // Team A wins over Team C
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 3,
          team1Score: '95',
          team2Score: '85',
          status: 'completed',
        },
        // Team B wins over Team C
        {
          id: 3,
          leagueId: 1,
          team1Id: 2,
          team2Id: 3,
          team1Score: '105',
          team2Score: '100',
          status: 'completed',
        },
      ];

      mockDb = createMockDbWithSequentialResults([
        mockTeams,
        mockMatchups,
      ]) as unknown as PublicDb;

      const standings = await calculateStandings(mockDb, 1);

      expect(standings).toHaveLength(3);

      // Team A should be first (2-0)
      const teamA = standings.find((s) => s.teamId === 1);
      expect(teamA).toBeDefined();
      expect(teamA!.wins).toBe(2);
      expect(teamA!.losses).toBe(0);
      expect(teamA!.rank).toBe(1);
      expect(teamA!.pointsFor).toBe(195);
      expect(teamA!.pointsAgainst).toBe(175);

      // Team B should be second (1-1)
      const teamB = standings.find((s) => s.teamId === 2);
      expect(teamB).toBeDefined();
      expect(teamB!.wins).toBe(1);
      expect(teamB!.losses).toBe(1);

      // Team C should be last (0-2)
      const teamC = standings.find((s) => s.teamId === 3);
      expect(teamC).toBeDefined();
      expect(teamC!.wins).toBe(0);
      expect(teamC!.losses).toBe(2);
      expect(teamC!.rank).toBe(3);
    });

    it('should calculate win percentage correctly', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '80',
          team2Score: '90',
          status: 'completed',
        },
      ];

      mockDb = createMockDbWithSequentialResults([
        mockTeams,
        mockMatchups,
      ]) as unknown as PublicDb;

      const standings = await calculateStandings(mockDb, 1);

      expect(standings).toHaveLength(2);
      expect(standings[0].winPercentage).toBe(0.5); // 1 win, 1 loss = 50%
    });

    it('should handle ties in win percentage calculation', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '100',
          status: 'completed',
        },
      ];

      mockDb = createMockDbWithSequentialResults([
        mockTeams,
        mockMatchups,
      ]) as unknown as PublicDb;

      const standings = await calculateStandings(mockDb, 1);

      expect(standings[0].ties).toBe(1);
      expect(standings[0].winPercentage).toBe(0.5); // Tie counts as 0.5
    });

    it('should sort by points for when win percentage is tied', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
        { id: 3, name: 'Team C' },
      ];

      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 3,
          team1Score: '150',
          team2Score: '90',
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 2,
          team2Id: 3,
          team1Score: '100',
          team2Score: '85',
          status: 'completed',
        },
      ];

      mockDb = createMockDbWithSequentialResults([
        mockTeams,
        mockMatchups,
      ]) as unknown as PublicDb;

      const standings = await calculateStandings(mockDb, 1);

      // Both Team A and Team B have 1-0 records
      // Team A should rank higher due to more points (150 vs 100)
      expect(standings[0].teamId).toBe(1);
      expect(standings[1].teamId).toBe(2);
    });

    it('should calculate average points correctly', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '80',
          team2Score: '70',
          status: 'completed',
        },
      ];

      mockDb = createMockDbWithSequentialResults([
        mockTeams,
        mockMatchups,
      ]) as unknown as PublicDb;

      const standings = await calculateStandings(mockDb, 1);

      expect(standings[0].averagePointsFor).toBe(90); // (100 + 80) / 2
      expect(standings[0].averagePointsAgainst).toBe(80); // (90 + 70) / 2
    });
  });

  describe('getSeasonResults', () => {
    it('should return complete season summary', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          selectedSeason: 2023,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          selectedSeason: 2023,
          team1Id: 1,
          team2Id: 2,
          team1Score: '85',
          team2Score: '95',
          status: 'scheduled',
        },
      ];

      const mockDbWithSequence = mockDb as any;
      let callCount = 0;
      mockDbWithSequence.where = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1 || callCount === 2) {
          return Promise.resolve(mockMatchups);
        } else if (callCount === 3) {
          return Promise.resolve(mockTeams);
        } else {
          return Promise.resolve([mockMatchups[0]]); // Only completed
        }
      });

      const results = await getSeasonResults(mockDb, 1, 2023);

      expect(results.leagueId).toBe(1);
      expect(results.season).toBe(2023);
      expect(results.totalMatchups).toBe(2);
      expect(results.completedMatchups).toBe(1);
      expect(results.standings).toHaveLength(2);
    });
  });

  describe('getPlayoffQualifications', () => {
    it('should mark correct teams as qualified', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
        { id: 3, name: 'Team C' },
        { id: 4, name: 'Team D' },
      ];

      const mockMatchups = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: '100',
          team2Score: '90',
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 3,
          team2Id: 4,
          team1Score: '95',
          team2Score: '85',
          status: 'completed',
        },
      ];

      mockDb = createMockDbWithSequentialResults([
        mockTeams,
        mockMatchups,
      ]) as unknown as PublicDb;

      const qualifications = await getPlayoffQualifications(mockDb, 1, null, 2);

      expect(qualifications).toHaveLength(4);

      // Top 2 teams should be qualified
      const qualified = qualifications.filter((q) => q.isQualified);
      expect(qualified).toHaveLength(2);
      expect(qualified[0].seedNumber).toBe(1);
      expect(qualified[1].seedNumber).toBe(2);

      // Bottom 2 teams should not be qualified
      const notQualified = qualifications.filter((q) => !q.isQualified);
      expect(notQualified).toHaveLength(2);
      expect(notQualified[0].seedNumber).toBeNull();
    });
  });

  describe('getMatchupStatusCounts', () => {
    it('should count matchups by status correctly', async () => {
      const mockMatchups = [
        { id: 1, leagueId: 1, status: 'completed' },
        { id: 2, leagueId: 1, status: 'completed' },
        { id: 3, leagueId: 1, status: 'scheduled' },
        { id: 4, leagueId: 1, status: 'in_progress' },
        { id: 5, leagueId: 1, status: 'cancelled' },
      ];

      mockDb = createMockDbChain(mockMatchups) as unknown as PublicDb;

      const counts = await getMatchupStatusCounts(mockDb, 1);

      expect(counts.total).toBe(5);
      expect(counts.completed).toBe(2);
      expect(counts.scheduled).toBe(1);
      expect(counts.inProgress).toBe(1);
      expect(counts.cancelled).toBe(1);
    });

    it('should return zeros when no matchups exist', async () => {
      mockDb = createMockDbChain([]) as unknown as PublicDb;

      const counts = await getMatchupStatusCounts(mockDb, 1);

      expect(counts.total).toBe(0);
      expect(counts.completed).toBe(0);
      expect(counts.scheduled).toBe(0);
      expect(counts.inProgress).toBe(0);
      expect(counts.cancelled).toBe(0);
    });
  });
});
