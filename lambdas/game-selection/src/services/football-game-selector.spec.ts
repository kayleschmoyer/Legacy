import type { PublicDb } from '@legacy-sports/db-client';
import {
  selectGamesForMatchupFootball,
  selectGamesForMatchupFootballPlayer,
} from './football-game-selector';

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
  GAMES_PER_MATCHUP_BY_SPORT: {
    baseball: { min: 1, max: 162, default: 5 },
    football: { min: 1, max: 17, default: 5 },
  },
}));

const mockGetFootballScoringSettingsForLeague = jest.fn().mockResolvedValue({});
const mockGetMatchupFootballPlayerGameStats = jest.fn().mockResolvedValue([]);
const mockUpdateMatchupScore = jest.fn().mockResolvedValue(undefined);

jest.mock('@legacy-sports/scoring/server', () => ({
  getFootballScoringSettingsForLeague: (...args: unknown[]) =>
    mockGetFootballScoringSettingsForLeague(...args) as unknown,
}));

jest.mock('@legacy-sports/db-client', () => ({
  getMatchupFootballPlayerGameStats: (...args: unknown[]) =>
    mockGetMatchupFootballPlayerGameStats(...args) as unknown,
  updateMatchupScore: (...args: unknown[]) =>
    mockUpdateMatchupScore(...args) as unknown,
  PublicSchema: {
    gameFootballPassing: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
    },
    gameFootballRushing: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
    },
    gameFootballReceiving: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
    },
    gameFootballKicking: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
    },
    gameFootballDefense: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
    },
    gameFootballDefenseIdp: {
      playerId: 'playerId',
      season: 'season',
      gameIdentifier: 'gameIdentifier',
    },
    matchupPlayerGames: {
      matchupPlayerId: 'matchupPlayerId',
      gameIdentifier: 'gameIdentifier',
      gameNum: 'gameNum',
    },
    matchups: { id: 'id', leagueId: 'leagueId', weekNumber: 'weekNumber' },
    matchupPlayers: {
      matchupId: 'matchupId',
      id: 'id',
      playerId: 'playerId',
      teamId: 'teamId',
      positionId: 'positionId',
    },
    leagueWeekPlayerSeasons: {
      leagueId: 'leagueId',
      weekNumber: 'weekNumber',
      playerId: 'playerId',
      season: 'season',
    },
    players: {
      id: 'id',
      pfrId: 'pfrId',
      isDst: 'isDst',
      position: 'position',
      nflTeam: 'nflTeam',
    },
    leaguePosition: { id: 'id', positionType: 'positionType' },
  },
}));

jest.mock('@legacy-sports/scoring', () => ({
  computeFootballPlayerGamePoints: jest.fn().mockReturnValue(0),
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => args),
  eq: jest.fn((a: unknown, b: unknown) => [a, b]),
  inArray: jest.fn((col: unknown, vals: unknown) => ({ col, vals })),
  isNotNull: jest.fn((col: unknown) => col),
  notInArray: jest.fn((col: unknown, vals: unknown) => ({ col, vals })),
}));

// Mirrors the chain-mocking pattern in season-game-selector.spec.ts: each
// entry in `selectResults` stands in for one sequential `db.select()` call,
// and the returned chain answers both `.limit()` (synchronous) and a bare
// `await` on the `.where()` result (thenable).
function makeSequentialDb(selectResults: unknown[][]): PublicDb {
  let selectIndex = 0;
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
        }),
      };
    }),
  } as unknown as PublicDb;
}

describe('football-game-selector', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('selectGamesForMatchupFootballPlayer', () => {
    it('selects an offensive game when passing stats are cached', async () => {
      const mockDb = makeSequentialDb([
        [{ playerId: 1 }], // hasCachedStats: passing exists
        [], // hasCachedStats: rushing
        [], // hasCachedStats: receiving
        [], // hasCachedStats: kicking
        [], // usedGames
        [{ gameIdentifier: 'nflverse-2020-01' }], // selectOffensiveGameIdentifier (passing)
      ]);

      const result = await selectGamesForMatchupFootballPlayer(
        mockDb,
        100,
        1,
        2020,
        false,
        'QB',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('nflverse-2020-01');
    });

    it('returns statsAreCached=false when no offensive stats exist', async () => {
      const mockDb = makeSequentialDb([
        [], // passing
        [], // rushing
        [], // receiving
        [], // kicking
      ]);

      const result = await selectGamesForMatchupFootballPlayer(
        mockDb,
        100,
        1,
        2020,
        false,
        'RB',
      );

      expect(result.statsAreCached).toBe(false);
      expect(result.gameIdentifier).toBeNull();
    });

    it('selects a DST game from game_football_defense when isDst is true', async () => {
      const mockDb = makeSequentialDb([
        [{ playerId: 2 }], // hasCachedStats -> DST exists
        [], // usedGames
        [{ gameIdentifier: 'nflverse-2021-05' }], // selectDstGameIdentifier
      ]);

      const result = await selectGamesForMatchupFootballPlayer(
        mockDb,
        101,
        2,
        2021,
        true,
        '',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('nflverse-2021-05');
    });

    it('selects an IDP game from game_football_defense_idp for DL/LB/DB positions', async () => {
      const mockDb = makeSequentialDb([
        [{ playerId: 3 }], // hasCachedStats -> IDP exists
        [], // usedGames
        [{ gameIdentifier: 'nflverse-2019-10' }], // selectIdpGameIdentifier
      ]);

      const result = await selectGamesForMatchupFootballPlayer(
        mockDb,
        102,
        3,
        2019,
        false,
        'LB',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('nflverse-2019-10');
    });

    it('recycles from the full pool when the unique games pool is exhausted', async () => {
      const mockDb = makeSequentialDb([
        [{ playerId: 1 }], // hasCachedStats: passing exists
        [], // hasCachedStats: rushing
        [], // hasCachedStats: receiving
        [], // hasCachedStats: kicking
        [{ gameIdentifier: 'nflverse-2020-01' }], // usedGames
        [], // selectOffensiveGameIdentifier (excluding used) -> passing exhausted
        [], // rushing exhausted
        [], // receiving exhausted
        [], // kicking exhausted
        [{ gameIdentifier: 'nflverse-2020-01' }], // recycle: passing (no exclusions)
      ]);

      const result = await selectGamesForMatchupFootballPlayer(
        mockDb,
        100,
        1,
        2020,
        false,
        'QB',
      );

      expect(result.statsAreCached).toBe(true);
      expect(result.gameIdentifier).toBe('nflverse-2020-01');
    });
  });

  describe('selectGamesForMatchupFootball', () => {
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

      const result = await selectGamesForMatchupFootball(mockDb, 999, 1);
      expect(result).toEqual({ playersNeedingStatsLoading: [] });
    });
  });
});
