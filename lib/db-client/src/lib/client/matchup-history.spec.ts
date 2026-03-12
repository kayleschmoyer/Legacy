/**
 * Unit tests for matchup history and standings calculations
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- test mocks use any for DB interactions */
// Test file uses any for mocking database interactions

import type { PublicDb } from './PublicDbClient';
import {
  calculateStandings,
  getHeadToHeadRecord,
  getMatchupStatusCounts,
  getPlayoffQualifications,
  getSeasonResults,
  type MatchupHistoryFilters,
  queryHistoricalMatchups,
} from './matchup-history';

// Mock getScoringMultipliersForLeague to avoid DB calls for scoring profiles.
// Uses h=1 as the only batting multiplier so desired scores map directly to hit counts.
// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- test mock
jest.mock('./PublicDbClient', () => ({
  ...jest.requireActual('./PublicDbClient'),
  getScoringMultipliersForLeague: jest.fn().mockResolvedValue({
    batting: { h: 1 },
    pitching: {},
    fielding: {},
  }),
}));

// Helper to create a chainable mock database

function createMockDbChain(finalResult: any): any {
  const chain = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
    groupBy: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- Test helper thenable mock
    then: jest.fn((resolve) => resolve(finalResult)),
  };

  // Make all methods chain and make the chain itself thenable (for await)
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockReturnValue(chain);
  chain.groupBy.mockReturnValue(chain);

  return chain;
}

// Helper to create a mock DB that can return different results for consecutive queries

function createMockDbWithMultipleQueries(results: any[]): any {
  let queryIndex = 0;

  const createChain = () => {
    const currentResult = results[queryIndex] || [];
    queryIndex++;

    const chain = {
      select: jest.fn(),
      from: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      offset: jest.fn(),
      groupBy: jest.fn(),
      leftJoin: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- Test helper thenable mock
      then: jest.fn((resolve) => resolve(currentResult)),
    };

    chain.select.mockReturnValue(chain);
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.offset.mockReturnValue(chain);
    chain.groupBy.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);

    return chain;
  };

  const mockDb = {
    select: jest.fn().mockImplementation(() => createChain()),
  };

  return mockDb;
}

/**
 * Build mock intermediate query results for calculateStandings tests.
 *
 * With the scoring mock set to { batting: { h: 1 } }, each team's score for a
 * matchup equals the total `h` (hits) across its players' games.
 *
 * Each team gets one synthetic player (playerId = teamId * 100) with one game
 * whose `h` value equals the desired team score.
 */
interface SimpleMatchup {
  id: number;
  leagueId: number;
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  status: string;
}

function buildStandingsGameData(matchups: SimpleMatchup[]) {
  let mpId = 1;
  let mpgId = 1;
  const matchupPlayers: any[] = [];
  const matchupPlayerGames: any[] = [];
  const gameBatting: any[] = [];

  for (const m of matchups) {
    // Team 1 player
    const t1PlayerId = m.team1Id * 100;
    const t1MpId = mpId++;
    matchupPlayers.push({
      id: t1MpId,
      matchupId: m.id,
      playerId: t1PlayerId,
      teamId: m.team1Id,
    });
    const t1GameId = `G${String(m.id).padStart(3, '0')}_T1`;
    matchupPlayerGames.push({
      id: mpgId++,
      matchupPlayerId: t1MpId,
      gameNum: 1,
      gameIdentifier: t1GameId,
    });
    gameBatting.push({
      playerId: t1PlayerId,
      season: 2024,
      gameNum: 1,
      gameIdentifier: t1GameId,
      h: m.team1Score,
    });

    // Team 2 player
    const t2PlayerId = m.team2Id * 100;
    const t2MpId = mpId++;
    matchupPlayers.push({
      id: t2MpId,
      matchupId: m.id,
      playerId: t2PlayerId,
      teamId: m.team2Id,
    });
    const t2GameId = `G${String(m.id).padStart(3, '0')}_T2`;
    matchupPlayerGames.push({
      id: mpgId++,
      matchupPlayerId: t2MpId,
      gameNum: 1,
      gameIdentifier: t2GameId,
    });
    gameBatting.push({
      playerId: t2PlayerId,
      season: 2024,
      gameNum: 1,
      gameIdentifier: t2GameId,
      h: m.team2Score,
    });
  }

  return { matchupPlayers, matchupPlayerGames, gameBatting };
}

/**
 * Build mock DB for calculateStandings with game-stat-based scoring.
 *
 * Query order:
 *  [0] teams, [1] matchups, [2] matchupPlayers,
 *  [3] matchupPlayerGames, [4] gameBatting, [5] gamePitching, [6] gameFielding
 */
function buildStandingsMockDb(
  teams: { id: number; name: string }[],
  matchups: SimpleMatchup[],
  extraPrefix: any[] = [],
) {
  const { matchupPlayers, matchupPlayerGames, gameBatting } =
    buildStandingsGameData(matchups);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- test mock
  return createMockDbWithMultipleQueries([
    ...extraPrefix,
    teams,
    matchups, // the function only reads id, team1Id, team2Id, status
    matchupPlayers,
    matchupPlayerGames,
    gameBatting,
    [], // pitching
    [], // fielding
  ]);
}

describe('Matchup History', () => {
  let mockDb: any;

  beforeEach(() => {
    // Create a basic mock for tests that override it completely
    mockDb = createMockDbChain([]);
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
      // Note: selectedSeason removed - seasons are now per-player
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

      const mockMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 100,
          team2Score: 90,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 3,
          team1Score: 95,
          team2Score: 85,
          status: 'completed',
        },
        {
          id: 3,
          leagueId: 1,
          team1Id: 2,
          team2Id: 3,
          team1Score: 105,
          team2Score: 100,
          status: 'completed',
        },
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      const standings = await calculateStandings(mockDb, 1);

      expect(standings).toHaveLength(3);

      // Team A should be first (2-0)
      const teamA = standings.find((s) => s.teamId === 1);
      expect(teamA).toBeDefined();
      if (!teamA) throw new Error('Team A not found');
      expect(teamA.wins).toBe(2);
      expect(teamA.losses).toBe(0);
      expect(teamA.rank).toBe(1);
      expect(teamA.pointsFor).toBe(195);
      expect(teamA.pointsAgainst).toBe(175);

      // Team B should be second (1-1)
      const teamB = standings.find((s) => s.teamId === 2);
      expect(teamB).toBeDefined();
      if (!teamB) throw new Error('Team B not found');
      expect(teamB.wins).toBe(1);
      expect(teamB.losses).toBe(1);

      // Team C should be last (0-2)
      const teamC = standings.find((s) => s.teamId === 3);
      expect(teamC).toBeDefined();
      if (!teamC) throw new Error('Team C not found');
      expect(teamC.wins).toBe(0);
      expect(teamC.losses).toBe(2);
      expect(teamC.rank).toBe(3);
    });

    it('should calculate win percentage correctly', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const mockMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 100,
          team2Score: 90,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 80,
          team2Score: 90,
          status: 'completed',
        },
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      const standings = await calculateStandings(mockDb, 1);

      expect(standings).toHaveLength(2);
      const teamA = standings.find((s) => s.teamId === 1);
      expect(teamA?.winPercentage).toBe(0.5); // 1 win, 1 loss = 50%
    });

    it('should handle ties in win percentage calculation', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const mockMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 100,
          team2Score: 100,
          status: 'completed',
        },
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      const standings = await calculateStandings(mockDb, 1);

      const teamA = standings.find((s) => s.teamId === 1);
      expect(teamA?.ties).toBe(1);
      expect(teamA?.winPercentage).toBe(0.5); // Tie counts as 0.5
    });

    it('should sort by points for when win percentage is tied', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
        { id: 3, name: 'Team C' },
      ];

      const mockMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 3,
          team1Score: 150,
          team2Score: 90,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 2,
          team2Id: 3,
          team1Score: 100,
          team2Score: 85,
          status: 'completed',
        },
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

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

      const mockMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 100,
          team2Score: 90,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 80,
          team2Score: 70,
          status: 'completed',
        },
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      const standings = await calculateStandings(mockDb, 1);

      const teamA = standings.find((s) => s.teamId === 1);
      expect(teamA?.averagePointsFor).toBe(90); // (100 + 80) / 2
      expect(teamA?.averagePointsAgainst).toBe(80); // (90 + 70) / 2
    });

    it('should include in_progress matchups for points but not for record', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const mockMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 100,
          team2Score: 90,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 50,
          team2Score: 60,
          status: 'in_progress',
        },
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      const standings = await calculateStandings(mockDb, 1);

      const teamA = standings.find((s) => s.teamId === 1);
      // W/L record only from completed: 1-0
      expect(teamA?.wins).toBe(1);
      expect(teamA?.losses).toBe(0);
      expect(teamA?.totalMatchups).toBe(1);
      // Points from both matchups: 100 + 50 = 150
      expect(teamA?.pointsFor).toBe(150);
      expect(teamA?.pointsAgainst).toBe(150);
    });
  });

  describe('getSeasonResults', () => {
    it('should return complete season summary', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' },
      ];

      const allMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 100,
          team2Score: 90,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 85,
          team2Score: 95,
          status: 'scheduled',
        },
      ];

      // Only completed+in_progress matchups appear in calculateStandings query
      const standingsMatchups = allMatchups.filter(
        (m) => m.status === 'completed' || m.status === 'in_progress',
      );

      // New query order (calculateStandings + COUNT GROUP BY run concurrently):
      //  [0] teams        - calculateStandings first db.select()
      //  [1] count rows   - COUNT GROUP BY query (second db.select(), evaluated before first await)
      //  [2] matchups     - calculateStandings second db.select()
      //  [3-6] game data
      const { matchupPlayers, matchupPlayerGames, gameBatting } =
        buildStandingsGameData(standingsMatchups);
      const countRows = [
        { status: 'completed', count: 1 },
        { status: 'scheduled', count: 1 },
      ];
      mockDb = createMockDbWithMultipleQueries([
        mockTeams, // [0] calculateStandings: teams
        countRows, // [1] COUNT GROUP BY
        standingsMatchups, // [2] calculateStandings: matchups
        matchupPlayers, // [3]
        matchupPlayerGames, // [4]
        gameBatting, // [5]
        [], // [6] pitching
        [], // [7] fielding
      ]);

      const results = await getSeasonResults(mockDb, 1);

      expect(results.leagueId).toBe(1);
      expect(results.season).toBe(null);
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

      const mockMatchups: SimpleMatchup[] = [
        {
          id: 1,
          leagueId: 1,
          team1Id: 1,
          team2Id: 2,
          team1Score: 100,
          team2Score: 90,
          status: 'completed',
        },
        {
          id: 2,
          leagueId: 1,
          team1Id: 3,
          team2Id: 4,
          team1Score: 95,
          team2Score: 85,
          status: 'completed',
        },
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

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
      // New SQL GROUP BY shape: one row per status with aggregate count
      const mockRows = [
        { status: 'completed', count: 2 },
        { status: 'scheduled', count: 1 },
        { status: 'in_progress', count: 1 },
        { status: 'cancelled', count: 1 },
      ];

      mockDb = createMockDbChain(mockRows) as unknown as PublicDb;

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
