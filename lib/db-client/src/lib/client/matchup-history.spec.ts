/**
 * Unit tests for matchup history and standings calculations
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- test mocks use any for DB interactions */
// Test file uses any for mocking database interactions

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  calculateStandings,
  computeClinchStatuses,
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

function createMockDbWithMultipleQueries(
  results: any[],
  executeResults: unknown[][] = [],
): any {
  let queryIndex = 0;
  let executeIndex = 0;

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
    // LS-9525: the game-stat fetches are raw pair-join SQL, issued via
    // db.execute rather than the query builder. node-postgres shapes the
    // result as { rows }.
    execute: jest.fn().mockImplementation(() => {
      const rows = executeResults[executeIndex] ?? [];
      executeIndex++;
      return Promise.resolve({ rows });
    }),
  };

  return mockDb;
}

/**
 * The SQL objects handed to db.execute, typed so tests can assert on the
 * generated query without reaching through the `any`-shaped mock DB.
 */
function executeCallsOf(db: unknown): SQL[] {
  const { execute } = db as { execute: { mock: { calls: [SQL][] } } };
  return execute.mock.calls.map(([query]) => query);
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

interface MockMatchupPlayer {
  id: number;
  matchupId: number;
  playerId: number;
  teamId: number;
}

interface MockMatchupPlayerGame {
  id: number;
  matchupPlayerId: number;
  gameNum: number;
  gameIdentifier: string;
}

interface MockBattingRow {
  playerId: number;
  season: number;
  gameNum: number;
  gameIdentifier: string;
  h: number;
}

function buildStandingsGameData(matchups: SimpleMatchup[]) {
  let mpId = 1;
  let mpgId = 1;
  const matchupPlayers: MockMatchupPlayer[] = [];
  const matchupPlayerGames: MockMatchupPlayerGame[] = [];
  const gameBatting: MockBattingRow[] = [];

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
 * db.select() order:
 *  [0] teams, [1] matchups, [2] matchupPlayers, [3] matchupPlayerGames
 *
 * db.execute() order (LS-9525 pair-join fetches):
 *  [0] gameBatting, [1] gamePitching, [2] gameFielding existence probe,
 *  [3] gameFielding rows (only reached when the probe returns a row)
 */
function buildStandingsMockDb(
  teams: { id: number; name: string }[],
  matchups: SimpleMatchup[],
  extraPrefix: any[] = [],
  executeOverrides?: unknown[][],
) {
  const { matchupPlayers, matchupPlayerGames, gameBatting } =
    buildStandingsGameData(matchups);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- test mock
  return createMockDbWithMultipleQueries(
    [
      ...extraPrefix,
      teams,
      matchups, // the function only reads id, team1Id, team2Id, status
      matchupPlayers,
      matchupPlayerGames,
    ],
    executeOverrides ?? [
      gameBatting,
      [], // pitching
      [], // fielding existence probe -- game_fielding is empty
    ],
  );
}

/**
 * Recursively check whether a drizzle SQL condition object references a
 * given DB column name (e.g. "week_number"). Walks queryChunks/column
 * structures directly rather than JSON.stringify-ing, since drizzle's SQL
 * objects contain circular references (Column -> Table -> Column).
 */
function sqlConditionMentionsColumn(
  value: unknown,
  columnName: string,
  seen = new Set<unknown>(),
): boolean {
  if (value == null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if ((value as { name?: unknown }).name === columnName) return true;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    // Skip the Column -> Table back-reference: every column on the table
    // (including unrelated ones) is reachable through it, which would make
    // this check match columns that aren't actually part of the condition.
    if (key === 'table') continue;
    if (Array.isArray(child)) {
      if (child.some((c) => sqlConditionMentionsColumn(c, columnName, seen)))
        return true;
    } else if (
      child != null &&
      typeof child === 'object' &&
      sqlConditionMentionsColumn(child, columnName, seen)
    ) {
      return true;
    }
  }
  return false;
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

      mockDb = createMockDbChain(mockData);
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

      mockDb = createMockDbChain(mockData);
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

      mockDb = createMockDbChain(mockData);
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

      mockDb = createMockDbChain(mockData);
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

      mockDb = createMockDbChain(mockData);
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

      mockDb = createMockDbChain(mockMatchups);

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

      mockDb = createMockDbChain(mockMatchups);

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

      mockDb = createMockDbChain(mockMatchups);

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

      mockDb = createMockDbChain(mockMatchups);

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

    // LS-6341: historical "standings as of Week N".
    it('scopes the matchups query to weekNumber <= throughWeek when provided', async () => {
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
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);
      await calculateStandings(mockDb, 1, { throughWeek: 3 });

      // The matchups query is the second `.where(...)` call (after teams).
      const matchupsWhereArg =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- test mock is typed any
        mockDb.select.mock.results[1].value.where.mock.calls[0][0];
      expect(sqlConditionMentionsColumn(matchupsWhereArg, 'week_number')).toBe(
        true,
      );
    });

    it('does not scope by week when throughWeek is omitted', async () => {
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
      ];

      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);
      await calculateStandings(mockDb, 1);

      const matchupsWhereArg =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- test mock is typed any
        mockDb.select.mock.results[1].value.where.mock.calls[0][0];
      expect(sqlConditionMentionsColumn(matchupsWhereArg, 'week_number')).toBe(
        false,
      );
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

  // LS-9525: the game-stat fetches moved from two independent IN lists
  // (`player_id IN (...) AND game_identifier IN (...)`) to a pair join over the
  // actual (player_id, game_identifier) combinations. The old shape returned
  // rows for players who appeared in a game selected for a *different* player's
  // matchup; the new one does not. These tests pin down that the dropped rows
  // never contributed to the output, and that fielding is only fetched when
  // game_fielding actually holds data.
  describe('pair-join stat fetch (LS-9525)', () => {
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
        team1Score: 120,
        team2Score: 95,
        status: 'completed',
      },
      {
        id: 2,
        leagueId: 1,
        team1Id: 3,
        team2Id: 4,
        team1Score: 80,
        team2Score: 80,
        status: 'completed',
      },
      {
        id: 3,
        leagueId: 1,
        team1Id: 1,
        team2Id: 3,
        team1Score: 60,
        team2Score: 105,
        status: 'in_progress',
      },
    ];

    /**
     * Every (playerId, gameIdentifier) combination the OLD two-IN-list query
     * would have returned but that no matchup_player_game actually references
     * -- i.e. exactly the rows the pair join stops fetching. Each carries an
     * absurd `h` so that consuming even one of them would blow up the scores.
     */
    function buildOverFetchedBattingRows(
      matchupPlayers: MockMatchupPlayer[],
      matchupPlayerGames: MockMatchupPlayerGame[],
      pairedBatting: MockBattingRow[],
    ): MockBattingRow[] {
      const playerIds = [...new Set(matchupPlayers.map((mp) => mp.playerId))];
      const gameIdentifiers = [
        ...new Set(matchupPlayerGames.map((g) => g.gameIdentifier)),
      ];
      const pairedKeys = new Set(
        pairedBatting.map((r) => `${r.playerId}_${r.gameIdentifier}`),
      );

      const rows: MockBattingRow[] = [];
      for (const playerId of playerIds) {
        for (const gameIdentifier of gameIdentifiers) {
          if (pairedKeys.has(`${playerId}_${gameIdentifier}`)) continue;
          rows.push({
            playerId,
            season: 2024,
            gameNum: 1,
            gameIdentifier,
            h: 9999,
          });
        }
      }
      return rows;
    }

    it('produces identical standings with and without the rows the old query over-fetched', async () => {
      const { matchupPlayers, matchupPlayerGames, gameBatting } =
        buildStandingsGameData(mockMatchups);
      const overFetched = buildOverFetchedBattingRows(
        matchupPlayers,
        matchupPlayerGames,
        gameBatting,
      );

      // Sanity: the scenario must actually exercise the over-fetch, otherwise
      // the equality assertion below is vacuous.
      expect(overFetched.length).toBeGreaterThan(0);

      // Old behaviour: paired rows PLUS every cross-product row.
      const legacyDb = buildStandingsMockDb(
        mockTeams,
        mockMatchups,
        [],
        [[...gameBatting, ...overFetched], [], []],
      );
      // New behaviour: only the paired rows.
      const pairJoinDb = buildStandingsMockDb(
        mockTeams,
        mockMatchups,
        [],
        [gameBatting, [], []],
      );

      const legacyStandings = await calculateStandings(legacyDb, 1);
      const pairJoinStandings = await calculateStandings(pairJoinDb, 1);

      expect(JSON.stringify(pairJoinStandings)).toBe(
        JSON.stringify(legacyStandings),
      );
      // Guard against both sides being trivially empty/zeroed.
      expect(pairJoinStandings).toHaveLength(4);
      expect(pairJoinStandings.some((s) => s.pointsFor > 0)).toBe(true);
      expect(pairJoinStandings.every((s) => s.pointsFor < 9999)).toBe(true);
    });

    it('emits pair-join SQL that can use the composite index', async () => {
      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      await calculateStandings(mockDb, 1);

      const dialect = new PgDialect();
      const [battingCall, pitchingCall] = executeCallsOf(mockDb);
      const batting = dialect.sqlToQuery(battingCall);
      const pitching = dialect.sqlToQuery(pitchingCall);

      for (const { sql: text } of [batting, pitching]) {
        // Pins the shape whose plan was verified on dev RDS. OFFSET 0 is the
        // load-bearing clause -- drop it and game_pitching flattens into a Hash
        // Join over a full Seq Scan. MATERIALIZED is kept alongside it as the
        // cardinality guard; see fetchStatsForLeaguePairs for the measurements.
        expect(text).toContain('WITH pairs AS MATERIALIZED');
        expect(text).toContain('CROSS JOIN LATERAL');
        expect(text).toContain('OFFSET 0');
        // The pair predicate the composite index serves.
        expect(text).toContain('"player_id" = p.player_id');
        expect(text).toContain('"game_identifier" = p.game_identifier');
        // The two independent IN lists are gone.
        expect(text).not.toMatch(/"(player_id|game_identifier)"\s+in\s*\(/i);
      }

      expect(batting.sql).toContain('"game_batting"');
      expect(pitching.sql).toContain('"game_pitching"');
      // League id is bound, not interpolated.
      expect(batting.params).toEqual([1]);

      // Column names diverge between the two tables; both must be projected
      // under the camelCase property name the scoring lookups read.
      expect(batting.sql).toContain('"game_number" AS "gameNum"');
      expect(pitching.sql).toContain('"game_num" AS "gameNum"');
    });

    // LS-6341 x LS-9525: the pair CTE must apply the same weekNumber bound as
    // the matchups query it mirrors. If it does not, a historical "as of Week N"
    // view silently goes back to fetching pairs for every week and discarding
    // the surplus in JS -- exactly the over-fetch this change removed.
    it('bounds the pair CTE by weekNumber when throughWeek is set', async () => {
      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      await calculateStandings(mockDb, 1, { throughWeek: 3 });

      const dialect = new PgDialect();
      const [batting, pitching] = executeCallsOf(mockDb).map((q) =>
        dialect.sqlToQuery(q),
      );

      for (const { sql: text, params } of [batting, pitching]) {
        expect(text).toContain('"week_number" <= ');
        // Bound as a parameter, alongside the league id — never interpolated.
        expect(params).toEqual([1, 3]);
      }
    });

    it('leaves the pair CTE unbounded when throughWeek is omitted', async () => {
      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      await calculateStandings(mockDb, 1);

      const dialect = new PgDialect();
      const [batting] = executeCallsOf(mockDb).map((q) =>
        dialect.sqlToQuery(q),
      );

      expect(batting.sql).not.toContain('week_number');
      expect(batting.params).toEqual([1]);
    });

    it('probes game_fielding once and skips the fetch while the table is empty', async () => {
      mockDb = buildStandingsMockDb(mockTeams, mockMatchups);

      await calculateStandings(mockDb, 1);

      // batting, pitching, fielding existence probe -- and no fielding fetch.
      expect(executeCallsOf(mockDb)).toHaveLength(3);
    });

    it('fetches and scores fielding rows once game_fielding is populated', async () => {
      const { gameBatting } = buildStandingsGameData(mockMatchups);

      // One fielding row per paired (player, game), each worth 1 putout.
      const gameFielding = gameBatting.map((row: MockBattingRow) => ({
        playerId: row.playerId,
        season: row.season,
        gameNum: row.gameNum,
        gameIdentifier: row.gameIdentifier,
        po: 1,
      }));

      // Resolved lazily: a top-level import of ./PublicDbClient would load it
      // before ./matchup-history and trip the circular-init between the two.
      const mockedClient: { getScoringMultipliersForLeague: jest.Mock } =
        jest.requireMock('./PublicDbClient');
      mockedClient.getScoringMultipliersForLeague.mockResolvedValueOnce({
        batting: { h: 1 },
        pitching: {},
        fielding: { po: 2 },
      });

      const populatedDb = buildStandingsMockDb(
        mockTeams,
        mockMatchups,
        [],
        [
          gameBatting,
          [],
          [{ present: 1 }], // existence probe returns a row
          gameFielding,
        ],
      );

      const standings = await calculateStandings(populatedDb, 1);

      expect(executeCallsOf(populatedDb)).toHaveLength(4);
      // Team A: 120 + 60 hits, plus 2 fielding points per game played (2 games).
      const teamA = standings.find((s) => s.teamId === 1);
      expect(teamA?.pointsFor).toBe(120 + 60 + 2 * 2);
    });
  });

  describe('divisionName computation in calculateStandings', () => {
    const noMatchups: SimpleMatchup[] = [];

    it('sets divisionName to null when no divisions are assigned', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A', divisionId: null },
        { id: 2, name: 'Team B', divisionId: null },
      ];
      mockDb = buildStandingsMockDb(mockTeams, noMatchups);
      const standings = await calculateStandings(mockDb, 1);
      for (const s of standings) {
        expect(s.divisionName).toBeNull();
      }
    });

    it('assigns "Division 1" when only one division exists', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A', divisionId: 1 },
        { id: 2, name: 'Team B', divisionId: 1 },
      ];
      mockDb = buildStandingsMockDb(mockTeams, noMatchups);
      const standings = await calculateStandings(mockDb, 1);
      for (const s of standings) {
        expect(s.divisionName).toBe('Division 1');
      }
    });

    it('assigns ordinal labels "Division 1" and "Division 2" for two divisions', async () => {
      const mockTeams = [
        { id: 1, name: 'Team A', divisionId: 1 },
        { id: 2, name: 'Team B', divisionId: 1 },
        { id: 3, name: 'Team C', divisionId: 2 },
        { id: 4, name: 'Team D', divisionId: 2 },
      ];
      mockDb = buildStandingsMockDb(mockTeams, noMatchups);
      const standings = await calculateStandings(mockDb, 1);
      const div1Teams = standings.filter((s) => s.divisionId === 1);
      const div2Teams = standings.filter((s) => s.divisionId === 2);
      expect(div1Teams.every((s) => s.divisionName === 'Division 1')).toBe(
        true,
      );
      expect(div2Teams.every((s) => s.divisionName === 'Division 2')).toBe(
        true,
      );
    });

    it('derives ordinal from sorted rank so non-sequential IDs label correctly', async () => {
      // divisionIds 3 and 7 → sorted rank 1 and 2 → "Division 1" and "Division 2"
      const mockTeams = [
        { id: 1, name: 'Team A', divisionId: 7 },
        { id: 2, name: 'Team B', divisionId: 3 },
        { id: 3, name: 'Team C', divisionId: 3 },
      ];
      mockDb = buildStandingsMockDb(mockTeams, noMatchups);
      const standings = await calculateStandings(mockDb, 1);
      const div3 = standings.filter((s) => s.divisionId === 3);
      const div7 = standings.filter((s) => s.divisionId === 7);
      expect(div3.every((s) => s.divisionName === 'Division 1')).toBe(true);
      expect(div7.every((s) => s.divisionName === 'Division 2')).toBe(true);
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

      // db.select() order (calculateStandings + COUNT GROUP BY run concurrently):
      //  [0] teams        - calculateStandings first db.select()
      //  [1] count rows   - COUNT GROUP BY query (second db.select(), evaluated before first await)
      //  [2] matchups     - calculateStandings second db.select()
      //  [3] matchupPlayers, [4] matchupPlayerGames
      // db.execute() order: [0] batting, [1] pitching, [2] fielding probe
      const { matchupPlayers, matchupPlayerGames, gameBatting } =
        buildStandingsGameData(standingsMatchups);
      const countRows = [
        { status: 'completed', count: 1 },
        { status: 'scheduled', count: 1 },
      ];
      mockDb = createMockDbWithMultipleQueries(
        [
          mockTeams, // [0] calculateStandings: teams
          countRows, // [1] COUNT GROUP BY
          standingsMatchups, // [2] calculateStandings: matchups
          matchupPlayers, // [3]
          matchupPlayerGames, // [4]
        ],
        [
          gameBatting, // execute [0] batting
          [], // execute [1] pitching
          [], // execute [2] fielding existence probe
        ],
      );

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

  describe('computeClinchStatuses', () => {
    it('marks a playoff-spot team CLINCHED once no chaser can catch it', () => {
      // Playoff line = top 2. Team A leads with 10 wins and no games left;
      // the best any chaser (Team C, currently 3rd) can reach is 4 + 3 = 7.
      const standings = [
        { teamId: 1, wins: 10, rank: 1 },
        { teamId: 2, wins: 6, rank: 2 },
        { teamId: 3, wins: 4, rank: 3 },
        { teamId: 4, wins: 2, rank: 4 },
      ];
      const remaining = new Map([
        [1, 0],
        [2, 3],
        [3, 3],
        [4, 3],
      ]);

      const result = computeClinchStatuses(standings, remaining, 2);

      expect(result.get(1)).toBe('CLINCHED');
      expect(result.get(2)).toBe('IN'); // 6 wins, chaser could reach 7 — not clinched
      expect(result.get(3)).toBe('OUT');
      expect(result.get(4)).toBe('OUT');
    });

    it('keeps a playoff-spot team IN when a chaser could still catch it', () => {
      const standings = [
        { teamId: 1, wins: 8, rank: 1 },
        { teamId: 2, wins: 7, rank: 2 },
        { teamId: 3, wins: 5, rank: 3 },
      ];
      // Team 3 could reach 5 + 3 = 8, tying/passing team 2 (7 wins, 2 left -> max 9).
      const remaining = new Map([
        [1, 1],
        [2, 2],
        [3, 3],
      ]);

      const result = computeClinchStatuses(standings, remaining, 2);

      expect(result.get(1)).toBe('IN');
      expect(result.get(2)).toBe('IN');
      expect(result.get(3)).toBe('OUT');
    });

    it('treats every team as CLINCHED when there are no teams outside the playoff line', () => {
      const standings = [
        { teamId: 1, wins: 5, rank: 1 },
        { teamId: 2, wins: 3, rank: 2 },
      ];
      const remaining = new Map([
        [1, 2],
        [2, 2],
      ]);

      const result = computeClinchStatuses(standings, remaining, 2);

      expect(result.get(1)).toBe('CLINCHED');
      expect(result.get(2)).toBe('CLINCHED');
    });

    it('returns an empty map when playoffs are not configured', () => {
      const standings = [{ teamId: 1, wins: 5, rank: 1 }];
      const result = computeClinchStatuses(standings, new Map(), 0);
      expect(result.size).toBe(0);
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

      mockDb = createMockDbChain(mockRows);

      const counts = await getMatchupStatusCounts(mockDb, 1);

      expect(counts.total).toBe(5);
      expect(counts.completed).toBe(2);
      expect(counts.scheduled).toBe(1);
      expect(counts.inProgress).toBe(1);
      expect(counts.cancelled).toBe(1);
    });

    it('should return zeros when no matchups exist', async () => {
      mockDb = createMockDbChain([]);

      const counts = await getMatchupStatusCounts(mockDb, 1);

      expect(counts.total).toBe(0);
      expect(counts.completed).toBe(0);
      expect(counts.scheduled).toBe(0);
      expect(counts.inProgress).toBe(0);
      expect(counts.cancelled).toBe(0);
    });
  });
});
