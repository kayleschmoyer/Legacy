import type { PublicDb } from '@legacy-sports/db-client';
import {
  selectGamesForMatchup,
  selectGamesForMatchupPlayer,
} from './season-game-selector';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/utils', () => ({
  cryptoRandomInt: jest.fn((_max: number) => 0),
  cryptoRandomFloat: jest.fn(() => 0.5),
}));

const mockGetMatchupPlayerGameStats = jest.fn().mockResolvedValue([]);
const mockGetScoringMultipliersForLeague = jest.fn().mockResolvedValue({
  batting: {},
  pitching: {},
  fielding: {},
});
const mockUpdateMatchupScore = jest.fn().mockResolvedValue(undefined);

jest.mock('@legacy-sports/db-client', () => ({
  getMatchupPlayerGameStats: (...args: unknown[]) =>
    mockGetMatchupPlayerGameStats(...args) as unknown,
  getScoringMultipliersForLeague: (...args: unknown[]) =>
    mockGetScoringMultipliersForLeague(...args) as unknown,
  updateMatchupScore: (...args: unknown[]) =>
    mockUpdateMatchupScore(...args) as unknown,
  PublicSchema: {
    gameBatting: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
    },
    gamePitching: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
      gs: 'gs',
    },
    matchupPlayerGames: {
      matchupPlayerId: 'matchupPlayerId',
      gameIdentifier: 'gameIdentifier',
      gameNum: 'gameNum',
    },
    seasonFielding: {
      playerId: 'playerId',
      season: 'season',
      pos: 'pos',
      g: 'g',
    },
    matchups: { id: 'id', leagueId: 'leagueId', weekNumber: 'weekNumber' },
    matchupPlayers: { matchupId: 'matchupId', id: 'id', playerId: 'playerId' },
    leagueWeekPlayerSeasons: {
      leagueId: 'leagueId',
      weekNumber: 'weekNumber',
      playerId: 'playerId',
      season: 'season',
    },
    teamMembers: {
      playerId: 'playerId',
      positionId: 'positionId',
      leagueId: 'leagueId',
    },
    leaguePosition: { id: 'id', positionType: 'positionType' },
  },
}));

const mockCalculateMatchupScore = jest.fn().mockReturnValue({
  matchupId: 1,
  team1Score: { totalScore: 10.5, gamesSelected: 1 },
  team2Score: { totalScore: 8.0, gamesSelected: 1 },
  gamesPerMatchup: 2,
});
const mockGetDefaultScoringSettings = jest.fn().mockReturnValue({
  batting: {},
  pitching: {},
  fielding: {},
});

jest.mock('@legacy-sports/scoring', () => ({
  calculateMatchupScore: (...args: unknown[]) =>
    mockCalculateMatchupScore(...args) as unknown,
  getDefaultScoringSettings: (...args: unknown[]) =>
    mockGetDefaultScoringSettings(...args) as unknown,
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => args),
  eq: jest.fn((a: unknown, b: unknown) => [a, b]),
  exists: jest.fn((subquery: unknown) => subquery),
  inArray: jest.fn((col: unknown, vals: unknown) => ({ col, vals })),
  isNotNull: jest.fn((col: unknown) => col),
  isNull: jest.fn((col: unknown) => col),
  ne: jest.fn((col: unknown, val: unknown) => ({ col, val })),
  notInArray: jest.fn((col: unknown, vals: unknown) => ({ col, vals })),
  or: jest.fn((...args: unknown[]) => args),
  sql: jest.fn(),
}));

describe('season-game-selector', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('selectGamesForMatchupPlayer', () => {
    it('should select a game when stats are cached', async () => {
      const mockDb = {
        select: jest.fn(),
      } as unknown as PublicDb;

      // Mock chain for each select call in sequence
      const selectResults = [
        // 1. cachedCheck - batting stats exist
        [{ gameIdentifier: 'game-2023-001' }],
        // 2. getPrimaryFieldingPosition - fielding stats
        [
          { pos: 'SS', g: 100 },
          { pos: '2B', g: 30 },
        ],
        // 3. usedGames - no used games
        [],
        // 4. selectGameIdentifier - available games
        [
          { gameIdentifier: 'game-2023-001' },
          { gameIdentifier: 'game-2023-002' },
        ],
      ];

      let selectIndex = 0;
      (mockDb.select as jest.Mock).mockImplementation(() => {
        const resultIdx = selectIndex++;
        const result = selectResults[resultIdx] ?? [];
        const chainResult = Object.assign([...result], {
          limit: jest.fn().mockReturnValue(result),
        });
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue(chainResult),
          }),
        };
      });

      const result = await selectGamesForMatchupPlayer(
        mockDb,
        100, // matchupPlayerId
        1, // playerId
        2023,
        'non-pitcher',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('game-2023-001');
      expect(result.gamePosition).toBe('SS');
    });

    it('should return statsAreCached=false when no batting stats exist for non-pitcher', async () => {
      const selectResults: unknown[][] = [
        // 1. cachedCheck - no batting stats
        [],
        // 2. getPrimaryFieldingPosition
        [{ pos: 'OF', g: 50 }],
      ];

      let selectIndex = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          const chainResult = Object.assign([...result], {
            limit: jest.fn().mockReturnValue(result),
          });
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(chainResult),
            }),
          };
        }),
      } as unknown as PublicDb;

      const result = await selectGamesForMatchupPlayer(
        mockDb,
        100,
        1,
        2023,
        'non-pitcher',
      );

      expect(result.statsAreCached).toBe(false);
      expect(result.gameIdentifier).toBeNull();
    });

    it('should fall back to pitching log for DH-era pitcher with no batting stats', async () => {
      const selectResults: unknown[][] = [
        // 1. cachedCheck (gameBatting) - no batting stats
        [],
        // 2. getPrimaryFieldingPosition
        [{ pos: 'P', g: 30 }],
        // 3. pitchingCheck - pitching stats exist
        [{ gameIdentifier: 'pitch-game-001' }],
        // 4. usedGames
        [],
        // 5. selectGameIdentifierFromPitching - available pitching games
        [
          { gameIdentifier: 'pitch-game-001' },
          { gameIdentifier: 'pitch-game-002' },
        ],
      ];

      let selectIndex = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          const chainResult = Object.assign([...result], {
            limit: jest.fn().mockReturnValue(result),
          });
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(chainResult),
            }),
          };
        }),
      } as unknown as PublicDb;

      const result = await selectGamesForMatchupPlayer(
        mockDb,
        100,
        1,
        2023,
        'SP',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('pitch-game-001');
    });

    it('should recycle a pitcher game when unique pool exhausted', async () => {
      const selectResults: unknown[][] = [
        // 1. cachedCheck (gameBatting) - no batting stats
        [],
        // 2. getPrimaryFieldingPosition
        [{ pos: 'P', g: 30 }],
        // 3. pitchingCheck - pitching stats exist
        [{ gameIdentifier: 'pitch-game-001' }],
        // 4. usedGames - game already used
        [{ gameIdentifier: 'pitch-game-001' }],
        // 5. selectGameIdentifierFromPitching (with exclusions) - exhausted
        [],
        // 6. selectGameIdentifierFromPitching (full pool, recycle) - returns game
        [{ gameIdentifier: 'pitch-game-001' }],
      ];

      let selectIndex = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          const chainResult = Object.assign([...result], {
            limit: jest.fn().mockReturnValue(result),
          });
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(chainResult),
            }),
          };
        }),
      } as unknown as PublicDb;

      const result = await selectGamesForMatchupPlayer(
        mockDb,
        100,
        1,
        2023,
        'SP',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('pitch-game-001');
    });

    it('should return statsAreCached=false when pitcher full pool is also empty', async () => {
      const selectResults: unknown[][] = [
        // 1. cachedCheck (gameBatting) - no batting stats
        [],
        // 2. getPrimaryFieldingPosition
        [{ pos: 'P', g: 30 }],
        // 3. pitchingCheck - pitching stats exist
        [{ gameIdentifier: 'pitch-game-001' }],
        // 4. usedGames - game already used
        [{ gameIdentifier: 'pitch-game-001' }],
        // 5. selectGameIdentifierFromPitching (with exclusions) - exhausted
        [],
        // 6. selectGameIdentifierFromPitching (full pool) - also empty (all stale)
        [],
      ];

      let selectIndex = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          const chainResult = Object.assign([...result], {
            limit: jest.fn().mockReturnValue(result),
          });
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(chainResult),
            }),
          };
        }),
      } as unknown as PublicDb;

      const result = await selectGamesForMatchupPlayer(
        mockDb,
        100,
        1,
        2023,
        'SP',
      );

      expect(result.statsAreCached).toBe(false);
      expect(result.gameIdentifier).toBeNull();
    });

    it('should recycle a non-pitcher game when unique pool exhausted', async () => {
      const selectResults: unknown[][] = [
        // 1. cachedCheck - batting stats exist
        [{ gameIdentifier: 'game-2023-001' }],
        // 2. getPrimaryFieldingPosition
        [{ pos: 'SS', g: 100 }],
        // 3. usedGames - game already used
        [{ gameIdentifier: 'game-2023-001' }],
        // 4. selectGameIdentifier (with exclusions) - exhausted
        [],
        // 5. selectGameIdentifier (full pool, recycle) - returns game
        [{ gameIdentifier: 'game-2023-001' }],
      ];

      let selectIndex = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          const chainResult = Object.assign([...result], {
            limit: jest.fn().mockReturnValue(result),
          });
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(chainResult),
            }),
          };
        }),
      } as unknown as PublicDb;

      const result = await selectGamesForMatchupPlayer(
        mockDb,
        100,
        1,
        2023,
        'non-pitcher',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('game-2023-001');
    });

    it('should return statsAreCached=false when non-pitcher full pool is also empty', async () => {
      const selectResults: unknown[][] = [
        // 1. cachedCheck - batting stats exist
        [{ gameIdentifier: 'game-2023-001' }],
        // 2. getPrimaryFieldingPosition
        [{ pos: 'SS', g: 100 }],
        // 3. usedGames - game already used
        [{ gameIdentifier: 'game-2023-001' }],
        // 4. selectGameIdentifier (with exclusions) - exhausted
        [],
        // 5. selectGameIdentifier (full pool) - also empty (all stale)
        [],
      ];

      let selectIndex = 0;
      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          const chainResult = Object.assign([...result], {
            limit: jest.fn().mockReturnValue(result),
          });
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue(chainResult),
            }),
          };
        }),
      } as unknown as PublicDb;

      const result = await selectGamesForMatchupPlayer(
        mockDb,
        100,
        1,
        2023,
        'non-pitcher',
      );

      expect(result.statsAreCached).toBe(false);
      expect(result.gameIdentifier).toBeNull();
    });
  });

  describe('selectGamesForMatchup', () => {
    it('should throw error if matchup not found', async () => {
      const mockDb = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              then: (cb: (rows: unknown[]) => unknown) =>
                Promise.resolve(cb([])),
            }),
          }),
        }),
      } as unknown as PublicDb;

      await expect(selectGamesForMatchup(mockDb, 999, 1)).rejects.toThrow(
        'Matchup 999 not found',
      );
    });

    it('should skip players with already selected games', async () => {
      let selectIndex = 0;
      const insertValues = jest.fn().mockResolvedValue(undefined);

      const selectResults = [
        // 1. get matchup
        [
          {
            id: 1,
            leagueId: 10,
            weekNumber: 1,
            pitcherStartsPerMatchup: 1,
            gamesPerMatchup: 5,
          },
        ],
        // 2. get matchup players
        [{ id: 100, playerId: 1, matchupId: 1 }],
        // 3. get player seasons
        [{ playerId: 1, season: 2023 }],
        // 4. batch pitcher roles
        [],
        // 5. existingGames check - already has games
        [{ gameNum: 1, matchupPlayerId: 100 }],
      ];

      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue(result),
                then: (cb: (rows: unknown[]) => unknown) =>
                  Promise.resolve(cb(result)),
                ...result,
              }),
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue(result),
              }),
            }),
          };
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: jest.fn().mockReturnValue({ values: insertValues }),
      } as unknown as PublicDb;

      const { playersNeedingStatsLoading } = await selectGamesForMatchup(
        mockDb,
        1,
        1,
      );

      // Player was skipped because they already had games
      expect(insertValues).not.toHaveBeenCalled();
      expect(playersNeedingStatsLoading).toHaveLength(0);
    });

    it('should skip players with no assigned season', async () => {
      let selectIndex = 0;
      const insertValues = jest.fn().mockResolvedValue(undefined);

      const selectResults = [
        // 1. get matchup
        [
          {
            id: 1,
            leagueId: 10,
            weekNumber: 1,
            pitcherStartsPerMatchup: 1,
            gamesPerMatchup: 5,
          },
        ],
        // 2. get matchup players
        [{ id: 100, playerId: 1, matchupId: 1 }],
        // 3. get player seasons - no season assigned for player 1
        [],
        // 4. batch pitcher roles
        [],
        // 5. existingGames check - no existing games
        [],
      ];

      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue(result),
                then: (cb: (rows: unknown[]) => unknown) =>
                  Promise.resolve(cb(result)),
                ...result,
              }),
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue(result),
              }),
            }),
          };
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: jest.fn().mockReturnValue({ values: insertValues }),
      } as unknown as PublicDb;

      const { playersNeedingStatsLoading } = await selectGamesForMatchup(
        mockDb,
        1,
        1,
      );

      // Player was skipped - no season assigned
      expect(insertValues).not.toHaveBeenCalled();
      expect(playersNeedingStatsLoading).toHaveLength(0);
    });

    it('calculates and persists scores before marking completed when all stats are cached (regression: LS-4145)', async () => {
      // Reproduces the LS-3817 race condition in the cached-stats path:
      // when all players already have stats in the DB (e.g. week 2 reuses
      // week 1 data), the game-selection lambda sets statsLoadingStatus =
      // 'completed' directly without invoking the stats-lambda. Without the
      // fix, team1Score / team2Score stay null because calculateMatchupScore
      // was never called for that matchup.

      jest.clearAllMocks();
      mockGetMatchupPlayerGameStats.mockResolvedValue([]);
      mockGetScoringMultipliersForLeague.mockResolvedValue({
        batting: {},
        pitching: {},
        fielding: {},
      });
      mockCalculateMatchupScore.mockReturnValue({
        matchupId: 1,
        team1Score: { totalScore: 12.5, gamesSelected: 2 },
        team2Score: { totalScore: 9.0, gamesSelected: 2 },
        gamesPerMatchup: 2,
      });

      let selectIndex = 0;
      const mockUpdateSet = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });
      const mockUpdate = jest.fn().mockReturnValue({ set: mockUpdateSet });

      const selectResults = [
        // 1. get matchup (all stats cached path)
        [
          {
            id: 1,
            leagueId: 10,
            weekNumber: 2,
            team1Id: 5,
            team2Id: 6,
            pitcherStartsPerMatchup: 1,
            gamesPerMatchup: 2,
          },
        ],
        // 2. get matchup players
        [{ id: 200, playerId: 99, matchupId: 1 }],
        // 3. get player seasons
        [{ playerId: 99, season: 2020 }],
        // 4. batch pitcher roles
        [],
        // 5. existingGames check — already has games (skip)
        [{ gameNum: 1, matchupPlayerId: 200 }],
      ];

      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue(result),
                then: (cb: (rows: unknown[]) => unknown) =>
                  Promise.resolve(cb(result)),
                ...result,
              }),
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue(result),
              }),
            }),
          };
        }),
        update: mockUpdate,
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
      } as unknown as PublicDb;

      const { playersNeedingStatsLoading } = await selectGamesForMatchup(
        mockDb,
        1,
        1,
      );

      // All stats were cached → no players queued for loading
      expect(playersNeedingStatsLoading).toHaveLength(0);

      // Score calculation must run before statsLoadingStatus is set to 'completed'
      expect(mockGetMatchupPlayerGameStats).toHaveBeenCalledWith(mockDb, 1);
      expect(mockCalculateMatchupScore).toHaveBeenCalled();
      expect(mockUpdateMatchupScore).toHaveBeenCalledWith(mockDb, 1, 12.5, 9.0);

      // statsLoadingStatus must be set to 'completed' after scores are persisted
      expect(mockUpdateSet).toHaveBeenCalledWith({
        statsLoadingStatus: 'completed',
      });

      // Verify ordering: updateMatchupScore before the 'completed' status update.
      // Note: mockUpdateSet[0] is the 'loading' call at function start; [1] is 'completed'.
      const updateScoreOrder =
        mockUpdateMatchupScore.mock.invocationCallOrder[0];
      const completedStatusIndex = (
        mockUpdateSet.mock.calls as Array<[Record<string, unknown>]>
      ).findIndex(([firstArg]) => firstArg?.statsLoadingStatus === 'completed');
      const updateStatusOrder =
        mockUpdateSet.mock.invocationCallOrder[completedStatusIndex];
      expect(updateScoreOrder).toBeLessThan(updateStatusOrder);
    });

    it('does not mark statsLoadingStatus completed when score calculation fails (regression: LS-4145)', async () => {
      jest.clearAllMocks();
      const calcError = new Error('DB connection failed');
      mockGetMatchupPlayerGameStats.mockRejectedValue(calcError);

      let selectIndex = 0;
      const mockUpdateSet = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });
      const mockUpdate = jest.fn().mockReturnValue({ set: mockUpdateSet });

      const selectResults = [
        [
          {
            id: 1,
            leagueId: 10,
            weekNumber: 2,
            team1Id: 5,
            team2Id: 6,
            pitcherStartsPerMatchup: 1,
            gamesPerMatchup: 2,
          },
        ],
        [{ id: 200, playerId: 99, matchupId: 1 }],
        [{ playerId: 99, season: 2020 }],
        [],
        // existingGames check — already has games so playersNeedingStatsLoading stays empty
        [{ gameNum: 1, matchupPlayerId: 200 }],
      ];

      const mockDb = {
        select: jest.fn().mockImplementation(() => {
          const result = selectResults[selectIndex++] ?? [];
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue(result),
                then: (cb: (rows: unknown[]) => unknown) =>
                  Promise.resolve(cb(result)),
                ...result,
              }),
              innerJoin: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue(result),
              }),
            }),
          };
        }),
        update: mockUpdate,
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockResolvedValue(undefined),
        }),
      } as unknown as PublicDb;

      await expect(selectGamesForMatchup(mockDb, 1, 1)).rejects.toThrow(
        'DB connection failed',
      );

      // statsLoadingStatus must NOT be set to 'completed' when scoring fails
      const setArgs = (
        mockUpdateSet.mock.calls as Array<[Record<string, unknown>]>
      ).map(([firstArg]) => firstArg);
      expect(setArgs).not.toContainEqual(
        expect.objectContaining({ statsLoadingStatus: 'completed' }),
      );
    });
  });
});
