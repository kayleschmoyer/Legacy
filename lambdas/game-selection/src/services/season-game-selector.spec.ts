import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { notInArray } from 'drizzle-orm';
import {
  selectGamesForMatchup,
  selectGamesForMatchupPlayer,
} from './season-game-selector';

// Standalone spy for LOGGER.warn. Tests assert on this rather than on
// LOGGER.warn itself, which would trip @typescript-eslint/unbound-method.
// The mock factory forwards through an arrow so the reference resolves at
// call time, after this const is initialised.
const mockLoggerWarn = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: (...args: unknown[]): void => {
      mockLoggerWarn(...args);
    },
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@legacy-sports/utils', () => ({
  cryptoRandomInt: jest.fn((_max: number) => 0),
  cryptoRandomFloat: jest.fn(() => 0.5),
  GAMES_PER_MATCHUP_BY_SPORT: {
    baseball: { min: 1, max: 162, default: 5 },
    football: { min: 1, max: 17, default: 5 },
  },
}));

// Scoring itself lives in one shared function that resolves the league's own
// multipliers internally (LS-9532); this module's remaining responsibility is
// to invoke it with the right matchup and league, and to do so *before*
// statsLoadingStatus flips to 'completed'. What the numbers come out as is
// covered by lib/scoring-utils' own spec.
const mockScoreMatchup = jest.fn();

const SCORE_MATCHUP_RESULT = {
  matchupId: 1,
  team1Score: 12.5,
  team2Score: 9.0,
  team1GamesSelected: 2,
  team2GamesSelected: 2,
  gamesPerMatchup: 2,
  updated: true,
};

jest.mock('@legacy-sports/scoring-utils', () => ({
  scoreMatchup: (...args: unknown[]) => mockScoreMatchup(...args) as unknown,
}));

// The real notInArray, spied: the used-games test asserts the exclusion list
// is pushed into the query.
jest.mock('drizzle-orm', () =>
  mockDrizzleOrm({
    notInArray: jest.fn(
      jest.requireActual<typeof import('drizzle-orm')>('drizzle-orm')
        .notInArray,
    ),
  }),
);

describe('season-game-selector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks resets recorded calls but not implementations, so the
    // rejections the failure-path tests install would leak into every test
    // that ran after them. Re-prime the happy path each time.
    mockScoreMatchup.mockResolvedValue(SCORE_MATCHUP_RESULT);
  });

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

    it('does not repeat a game while the season still has distinct games left (LS-9534)', async () => {
      // AC4: two slots are already filled from a season with more games left.
      // The third slot must exclude what is already used and land on a
      // different game — the recycle path is only for an exhausted pool.
      const selectResults: unknown[][] = [
        // 1. cachedCheck - batting stats exist
        [{ gameIdentifier: 'game-1925-001' }],
        // 2. getPrimaryFieldingPosition
        [{ pos: 'CF', g: 140 }],
        // 3. usedGames - two slots already filled
        [
          { gameIdentifier: 'game-1925-001' },
          { gameIdentifier: 'game-1925-002' },
        ],
        // 4. selectGameIdentifier with exclusions - distinct games remain
        [
          { gameIdentifier: 'game-1925-003' },
          { gameIdentifier: 'game-1925-004' },
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
        1925,
        'non-pitcher',
      );

      expect(result.statsAreCached).toBe(true);
      expect(['game-1925-001', 'game-1925-002']).not.toContain(
        result.gameIdentifier,
      );
      expect(result.gameIdentifier).toBe('game-1925-003');
      // The already-used identifiers are pushed into the query, not filtered
      // after the fact — that is what keeps the slots distinct.
      expect(notInArray).toHaveBeenCalledWith(
        PublicSchema.gameBatting.gameIdentifier,
        ['game-1925-001', 'game-1925-002'],
      );
      // No recycle warning: the pool was not exhausted.
      expect(mockLoggerWarn).not.toHaveBeenCalled();
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
    it('should return empty result and not throw when matchup not found', async () => {
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

      const result = await selectGamesForMatchup(mockDb, 999, 1);
      expect(result).toEqual({ playersNeedingStatsLoading: [] });
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
        // 2. get league sport (LS-4762)
        [{ sport: 'baseball' }],
        // 3. get matchup players
        [{ id: 100, playerId: 1, matchupId: 1 }],
        // 4. get player seasons
        [{ playerId: 1, season: 2023 }],
        // 5. batch pitcher roles
        [],
        // 6. existingGames check - already has games
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

    const buildSeasonlessPlayerDb = (
      matchupSlotRows: Array<{ matchupPlayerId: number; gameNum: number }>,
      insertValues: jest.Mock,
    ) => {
      let selectIndex = 0;
      const selectResults = [
        // 1. get matchup
        [
          {
            id: 1,
            leagueId: 10,
            weekNumber: 1,
            pitcherStartsPerMatchup: 1,
            gamesPerMatchup: 7,
          },
        ],
        // 2. get league sport (LS-4762)
        [{ sport: 'baseball' }],
        // 3. get matchup players
        [{ id: 100, playerId: 1, matchupId: 1 }],
        // 4. get player seasons - no season assigned for player 1
        [],
        // 5. batch pitcher roles
        [],
        // 6. existingGames check - no existing games for this game number
        [],
        // 7. slot rows already in the matchup (LS-10780)
        matchupSlotRows,
      ];

      return {
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
    };

    const noGameDataSlot = (gameNum: number) => ({
      gameNum,
      matchupPlayerId: 100,
      gameIdentifier: null,
      gamePosition: null,
      statsLoadingStatus: 'completed',
      noGameDataFound: true,
    });

    it('marks the slot noGameDataFound for a player with no assigned season (LS-10780)', async () => {
      const insertValues = jest.fn().mockResolvedValue(undefined);
      const mockDb = buildSeasonlessPlayerDb([], insertValues);

      const { playersNeedingStatsLoading } = await selectGamesForMatchup(
        mockDb,
        1,
        1,
      );

      // No game is selected, but the slot is terminally resolved so the
      // player cannot pin the matchup's min resolved count at 0.
      expect(insertValues).toHaveBeenCalledTimes(1);
      expect(insertValues).toHaveBeenCalledWith([noGameDataSlot(1)]);
      expect(playersNeedingStatsLoading).toHaveLength(0);
    });

    it('backfills every slot the matchup already played for a player with no season (LS-10780)', async () => {
      const insertValues = jest.fn().mockResolvedValue(undefined);
      // Teammate 200 already has games 1-3; seasonless player 100 has none —
      // the stuck state from LS-10780, where the week re-queued game 1.
      const mockDb = buildSeasonlessPlayerDb(
        [
          { matchupPlayerId: 200, gameNum: 1 },
          { matchupPlayerId: 200, gameNum: 2 },
          { matchupPlayerId: 200, gameNum: 3 },
        ],
        insertValues,
      );

      await selectGamesForMatchup(mockDb, 1, 1);

      expect(insertValues).toHaveBeenCalledWith([
        noGameDataSlot(1),
        noGameDataSlot(2),
        noGameDataSlot(3),
      ]);
    });

    it('calculates and persists scores before marking completed when all stats are cached (regression: LS-4145)', async () => {
      // Reproduces the LS-3817 race condition in the cached-stats path:
      // when all players already have stats in the DB (e.g. week 2 reuses
      // week 1 data), the game-selection lambda sets statsLoadingStatus =
      // 'completed' directly without invoking the stats-lambda. Without the
      // fix, team1Score / team2Score stay null because calculateMatchupScore
      // was never called for that matchup.

      jest.clearAllMocks();
      mockScoreMatchup.mockResolvedValue(SCORE_MATCHUP_RESULT);

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
        // 2. get league sport (LS-4762)
        [{ sport: 'baseball' }],
        // 3. get matchup players
        [{ id: 200, playerId: 99, matchupId: 1 }],
        // 4. get player seasons
        [{ playerId: 99, season: 2020 }],
        // 5. batch pitcher roles
        [],
        // 6. existingGames check — already has games (skip)
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

      // Score calculation must run before statsLoadingStatus is set to
      // 'completed'. The matchup's league is what the shared function resolves
      // the scoring profile from, so passing it is this module's whole job.
      expect(mockScoreMatchup).toHaveBeenCalledWith(mockDb, 1, 10, {
        forceRecalculation: true,
      });

      // statsLoadingStatus must be set to 'completed' after scores are persisted
      expect(mockUpdateSet).toHaveBeenCalledWith({
        statsLoadingStatus: 'completed',
      });

      // Verify ordering: scoreMatchup before the 'completed' status update.
      // Note: mockUpdateSet[0] is the 'loading' call at function start; [1] is 'completed'.
      const updateScoreOrder = mockScoreMatchup.mock.invocationCallOrder[0];
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
      mockScoreMatchup.mockRejectedValue(calcError);

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
        // get league sport (LS-4762)
        [{ sport: 'baseball' }],
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

    it('skips gracefully when the matchup is deleted before scores can be persisted (LS-8427)', async () => {
      // Reproduces the race where the matchup is deleted between the initial
      // existence check at the top of selectGamesForMatchup and the later
      // scoring call in the all-cached path. scoreMatchup throws
      // `Matchup ${matchupId} not found` when the row is gone; the function
      // must treat this as a non-retriable skip (like the whole-matchup case
      // in LS-8145 and the matchup_player case in LS-8244) instead of throwing
      // and failing the batch.
      jest.clearAllMocks();
      mockScoreMatchup.mockRejectedValue(new Error('Matchup 1 not found'));

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
        [{ sport: 'baseball' }],
        [{ id: 200, playerId: 99, matchupId: 1 }],
        [{ playerId: 99, season: 2020 }],
        [],
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

      expect(playersNeedingStatsLoading).toHaveLength(0);
      expect(mockScoreMatchup).toHaveBeenCalledWith(mockDb, 1, 10, {
        forceRecalculation: true,
      });
    });

    it('skips a player when the insert fails with matchup_player FK violation (LS-8244)', async () => {
      // Reproduces the race condition where a matchup_player row is deleted
      // (via waiver/trade) between the initial SELECT and the INSERT into
      // matchup_player_games. Postgres raises 23503 on the
      // matchup_player_games_matchup_player_fk constraint; the function must
      // skip the player with a warn rather than throwing and failing the whole
      // matchup.

      jest.clearAllMocks();

      let selectIndex = 0;
      const fkError = Object.assign(
        new Error('Failed query: insert into ...'),
        {
          cause: {
            code: '23503',
            constraint_name: 'matchup_player_games_matchup_player_fk',
          },
        },
      );

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
        // 2. get league sport
        [{ sport: 'baseball' }],
        // 3. get matchup players — one player
        [{ id: 2666405, playerId: 7, matchupId: 1 }],
        // 4. get player seasons
        [{ playerId: 7, season: 1990 }],
        // 5. batch pitcher roles
        [],
        // 6. existingGames check — no existing games
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
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockRejectedValue(fkError),
        }),
      } as unknown as PublicDb;

      const { playersNeedingStatsLoading } = await selectGamesForMatchup(
        mockDb,
        1,
        1,
      );

      // Player was skipped — no stats to load, no throw
      expect(playersNeedingStatsLoading).toHaveLength(0);
    });

    it('re-throws non-FK errors from insert (LS-8244)', async () => {
      let selectIndex = 0;
      const otherError = new Error('unexpected DB failure');

      const selectResults = [
        [
          {
            id: 1,
            leagueId: 10,
            weekNumber: 1,
            pitcherStartsPerMatchup: 1,
            gamesPerMatchup: 5,
          },
        ],
        [{ sport: 'baseball' }],
        [{ id: 300, playerId: 8, matchupId: 1 }],
        [{ playerId: 8, season: 2000 }],
        [],
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
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockRejectedValue(otherError),
        }),
      } as unknown as PublicDb;

      await expect(selectGamesForMatchup(mockDb, 1, 1)).rejects.toThrow(
        'unexpected DB failure',
      );
    });
  });
});
