// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetMatchupPlayerGameStats = jest.fn();
const mockUpdateMatchupScore = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  getMatchupPlayerGameStats: (...args: unknown[]): unknown =>
    mockGetMatchupPlayerGameStats(...args),
  updateMatchupScore: (...args: unknown[]): unknown =>
    mockUpdateMatchupScore(...args),
}));

const mockCalculateMatchupScore = jest.fn();

jest.mock('@legacy-sports/scoring', () => ({
  ...jest.requireActual<object>('@legacy-sports/scoring'),
  calculateMatchupScore: (...args: unknown[]): unknown =>
    mockCalculateMatchupScore(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import type { ScoringSettings } from '@legacy-sports/scoring';
import { calculateAndUpdateMatchupScores } from './scoring-utils';

// ── Helpers ─────────────────────────────────────────────────────────────────

const SETTINGS = {
  batting: { hr: 4 },
  pitching: { so: 1 },
  fielding: {},
} as unknown as ScoringSettings;

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

describe('scoring-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateAndUpdateMatchupScores', () => {
    it('throws when matchup is not found', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(undefined);

      await expect(
        calculateAndUpdateMatchupScores(db as never, 999, SETTINGS),
      ).rejects.toThrow('Matchup 999 not found');
    });

    it('returns cached scores without recalculating when scores exist', async () => {
      const db = makeMockDb();
      db.query.matchups.findFirst.mockResolvedValue(
        makeMatchupRow({ team1Score: '12.5', team2Score: '9.3' }),
      );

      const result = await calculateAndUpdateMatchupScores(
        db as never,
        1,
        SETTINGS,
      );

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
        SETTINGS,
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

      const result = await calculateAndUpdateMatchupScores(
        db as never,
        1,
        SETTINGS,
      );

      expect(result).toMatchObject({
        matchupId: 1,
        team1Score: 25.5,
        team2Score: 18.2,
        team1GamesSelected: 5,
        team2GamesSelected: 5,
        gamesPerMatchup: 5,
        updated: true,
      });

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

    it('passes the caller-supplied league scoring settings straight through', async () => {
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

      const customSettings = {
        batting: { hr: 7 },
        pitching: { so: 3 },
        fielding: {},
      } as unknown as ScoringSettings;

      await calculateAndUpdateMatchupScores(db as never, 1, customSettings);

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

      const result = await calculateAndUpdateMatchupScores(
        db as never,
        1,
        SETTINGS,
      );

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

      const result = await calculateAndUpdateMatchupScores(
        db as never,
        1,
        SETTINGS,
      );

      expect(result.team1Score).toBeNull();
      expect(result.team2Score).toBeNull();
      expect(result.team1GamesSelected).toBe(0);
      expect(result.team2GamesSelected).toBe(0);
      expect(result.updated).toBe(true);
    });
  });
});
