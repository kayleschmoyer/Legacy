// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  captureError: jest.fn(),
  getRollbarConfigFromEnv: jest.fn(() => null),
  initRollbar: jest.fn(),
}));

const mockRunWithPublicClient = jest.fn();
const mockGetMatchupPlayerGameStats = jest.fn();
const mockUpdateMatchupScore = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  getMatchupPlayerGameStats: (...args: unknown[]): unknown =>
    mockGetMatchupPlayerGameStats(...args),
  updateMatchupScore: (...args: unknown[]): unknown =>
    mockUpdateMatchupScore(...args),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

const mockCalculateMatchupScore = jest.fn();
const mockGetDefaultScoringSettings = jest.fn();

jest.mock('@legacy-sports/scoring', () => ({
  calculateMatchupScore: (...args: unknown[]): unknown =>
    mockCalculateMatchupScore(...args),
  getDefaultScoringSettings: (...args: unknown[]): unknown =>
    mockGetDefaultScoringSettings(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import {
  batchCalculateMatchupScores,
  calculateAndUpdateMatchupScores,
  handler,
} from './calculate-matchup-scores';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMockDb() {
  return {
    query: {
      matchups: {
        findFirst: jest.fn(),
      },
    },
  };
}

function makeMatchupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    team1Id: 10,
    team2Id: 20,
    gamesPerMatchup: 5,
    team1Score: null,
    team2Score: null,
    ...overrides,
  };
}

function makePlayerGameStat(
  teamId: number,
  playerId: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    teamId,
    playerId,
    season: 1985,
    gameNum: 1,
    battingStats: {
      pa: 4,
      ab: 4,
      r: 1,
      h: 2,
      doubles: 0,
      triples: 0,
      hr: 1,
      rbi: 2,
      sb: 0,
      cs: 0,
      bb: 0,
      so: 1,
      gidp: 0,
      hbp: 0,
      sh: 0,
      sf: 0,
      ibb: 0,
    },
    pitchingStats: null,
    fieldingStats: null,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('calculate-matchup-scores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDefaultScoringSettings.mockReturnValue({
      batting: {},
      pitching: {},
    });
  });

  // ── calculateAndUpdateMatchupScores ─────────────────────────────────────

  describe('calculateAndUpdateMatchupScores', () => {
    it('throws when matchup is not found', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(undefined);

      await expect(
        calculateAndUpdateMatchupScores(db as never, 999),
      ).rejects.toThrow('Matchup 999 not found');
    });

    it('returns cached scores without recalculating when scores exist', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(
        makeMatchupRow({ team1Score: '12.5', team2Score: '9.3' }),
      );

      const result = await calculateAndUpdateMatchupScores(db as never, 1);

      expect(result).toMatchObject({
        matchupId: 1,
        team1Score: 12.5,
        team2Score: 9.3,
        updated: false,
      });
      expect(mockGetMatchupPlayerGameStats).not.toHaveBeenCalled();
    });

    it('recalculates when forceRecalculation is true even if scores exist', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(
        makeMatchupRow({ team1Score: '12.5', team2Score: '9.3' }),
      );
      mockGetMatchupPlayerGameStats.mockResolvedValue([]);
      mockCalculateMatchupScore.mockReturnValue({
        team1Score: { totalScore: 15, gamesSelected: 5 },
        team2Score: { totalScore: 10, gamesSelected: 5 },
        gamesPerMatchup: 5,
      });
      mockUpdateMatchupScore.mockResolvedValue({
        team1Score: '15',
        team2Score: '10',
      });

      const result = await calculateAndUpdateMatchupScores(
        db as never,
        1,
        undefined,
        true,
      );

      expect(result.updated).toBe(true);
      expect(mockGetMatchupPlayerGameStats).toHaveBeenCalledWith(db, 1);
    });

    it('calculates scores and updates database', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(makeMatchupRow());

      const stats = [
        makePlayerGameStat(10, 100),
        makePlayerGameStat(10, 101),
        makePlayerGameStat(20, 200),
      ];
      mockGetMatchupPlayerGameStats.mockResolvedValue(stats);

      mockCalculateMatchupScore.mockReturnValue({
        team1Score: { totalScore: 25.5, gamesSelected: 5 },
        team2Score: { totalScore: 18.2, gamesSelected: 5 },
        gamesPerMatchup: 5,
      });

      mockUpdateMatchupScore.mockResolvedValue({
        team1Score: '25.5',
        team2Score: '18.2',
      });

      const result = await calculateAndUpdateMatchupScores(db as never, 1);

      expect(result).toMatchObject({
        matchupId: 1,
        team1Score: 25.5,
        team2Score: 18.2,
        team1GamesSelected: 5,
        team2GamesSelected: 5,
        gamesPerMatchup: 5,
        updated: true,
      });

      // Verify scoring was called with default settings
      expect(mockGetDefaultScoringSettings).toHaveBeenCalled();
      expect(mockCalculateMatchupScore).toHaveBeenCalledWith(
        1,
        10,
        20,
        expect.any(Map),
        expect.any(Map),
        5,
        expect.anything(),
      );

      // Verify team1 got 2 players and team2 got 1
      const [, , , team1Map, team2Map] = mockCalculateMatchupScore.mock
        .calls[0] as [
        unknown,
        unknown,
        unknown,
        Map<number, unknown[]>,
        Map<number, unknown[]>,
      ];
      expect(team1Map.size).toBe(2);
      expect(team2Map.size).toBe(1);
    });

    it('uses custom scoring settings when provided', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(makeMatchupRow());
      mockGetMatchupPlayerGameStats.mockResolvedValue([]);
      mockCalculateMatchupScore.mockReturnValue({
        team1Score: null,
        team2Score: null,
        gamesPerMatchup: 5,
      });
      mockUpdateMatchupScore.mockResolvedValue({
        team1Score: null,
        team2Score: null,
      });

      const customSettings = { batting: { hr: 4 }, pitching: { so: 1 } };
      await calculateAndUpdateMatchupScores(
        db as never,
        1,
        customSettings as never,
      );

      expect(mockGetDefaultScoringSettings).not.toHaveBeenCalled();
      expect(mockCalculateMatchupScore).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        customSettings,
      );
    });

    it('handles null gamesPerMatchup with fallback of 0 for response', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(
        makeMatchupRow({
          gamesPerMatchup: null,
          team1Score: '1',
          team2Score: '2',
        }),
      );

      const result = await calculateAndUpdateMatchupScores(db as never, 1);

      expect(result.gamesPerMatchup).toBe(0);
    });

    it('handles null scores from scoring calculation', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(makeMatchupRow());
      mockGetMatchupPlayerGameStats.mockResolvedValue([]);
      mockCalculateMatchupScore.mockReturnValue({
        team1Score: null,
        team2Score: null,
        gamesPerMatchup: 5,
      });
      mockUpdateMatchupScore.mockResolvedValue({
        team1Score: null,
        team2Score: null,
      });

      const result = await calculateAndUpdateMatchupScores(db as never, 1);

      expect(result.team1Score).toBeNull();
      expect(result.team2Score).toBeNull();
      expect(result.team1GamesSelected).toBe(0);
      expect(result.team2GamesSelected).toBe(0);
      expect(result.updated).toBe(true);
    });
  });

  // ── handler ─────────────────────────────────────────────────────────────

  describe('handler', () => {
    it('invokes calculateAndUpdateMatchupScores via runWithPublicClient', async () => {
      mockRunWithPublicClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
          const db = makeMockDb();
          db.query.matchups.findFirst.mockResolvedValue(
            makeMatchupRow({ team1Score: '5', team2Score: '3' }),
          );
          return cb(db);
        },
      );

      const result = await handler({ matchupId: 1 });

      expect(result.matchupId).toBe(1);
      expect(result.team1Score).toBe(5);
      expect(mockRunWithPublicClient).toHaveBeenCalled();
    });

    it('re-throws and captures errors', async () => {
      const err = new Error('db connection failed');
      mockRunWithPublicClient.mockRejectedValue(err);

      await expect(handler({ matchupId: 1 })).rejects.toThrow(
        'db connection failed',
      );
    });
  });

  // ── batchCalculateMatchupScores ─────────────────────────────────────────

  describe('batchCalculateMatchupScores', () => {
    it('processes multiple matchups and returns results', async () => {
      // Each handler call goes through runWithPublicClient
      let callCount = 0;
      mockRunWithPublicClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
          callCount++;
          const db = makeMockDb();
          db.query.matchups.findFirst.mockResolvedValue(
            makeMatchupRow({
              id: callCount,
              team1Score: String(callCount * 10),
              team2Score: String(callCount * 5),
            }),
          );
          return cb(db);
        },
      );

      const results = await batchCalculateMatchupScores([1, 2]);

      expect(results).toHaveLength(2);
      expect(results[0].matchupId).toBe(1);
      expect(results[1].matchupId).toBe(2);
    });

    it('captures errors per-matchup without stopping the batch', async () => {
      mockRunWithPublicClient
        .mockRejectedValueOnce(new Error('matchup 1 failed'))
        .mockImplementationOnce(
          async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
            const db = makeMockDb();
            db.query.matchups.findFirst.mockResolvedValue(
              makeMatchupRow({ id: 2, team1Score: '10', team2Score: '5' }),
            );
            return cb(db);
          },
        );

      const results = await batchCalculateMatchupScores([1, 2]);

      expect(results).toHaveLength(2);
      expect(results[0].error).toBe('matchup 1 failed');
      expect(results[0].updated).toBe(false);
      // batchCalculateMatchupScores calls with forceRecalculation: true
      expect(results[1].updated).toBe(true);
      expect(results[1].error).toBeUndefined();
    });
  });
});
