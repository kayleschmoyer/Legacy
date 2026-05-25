/**
 * Unit tests for getMatchupFootballPlayerGameStats
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- test mocks use any for DB interactions */

import type { PublicDb } from './PublicDbClient';
import { getMatchupFootballPlayerGameStats } from './PublicDbClient';

function createMockDbWithMultipleQueries(results: any[]): any {
  let queryIndex = 0;

  const createChain = () => {
    const currentResult = results[queryIndex] || [];
    queryIndex++;

    const chain = {
      select: jest.fn(),
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn(),
      leftJoin: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- test mock
      then: jest.fn((resolve: (v: any) => any) => resolve(currentResult)),
    };

    chain.select.mockReturnValue(chain);
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);

    return chain;
  };

  return {
    select: jest.fn().mockImplementation(() => createChain()),
  };
}

const MATCHUP_ID = 42;
const LEAGUE_ID = 1;
const WEEK_NUMBER = 5;

const matchupInfoResult = [{ leagueId: LEAGUE_ID, weekNumber: WEEK_NUMBER }];

const qbMatchupPlayer = {
  matchupPlayerId: 101,
  playerId: 1001,
  season: 2024,
  positionType: 'QB',
};

const rbMatchupPlayer = {
  matchupPlayerId: 102,
  playerId: 1002,
  season: 2024,
  positionType: 'RB',
};

const dstMatchupPlayer = {
  matchupPlayerId: 103,
  playerId: 1003,
  season: 2024,
  positionType: 'DST',
};

const dlMatchupPlayer = {
  matchupPlayerId: 104,
  playerId: 1004,
  season: 2024,
  positionType: 'DL',
};

const qbGame = {
  matchupPlayerId: 101,
  gameNum: 3,
  gameIdentifier: '202409150dal',
  id: 201,
  fieldingGamePos: null,
  statsLoadingStatus: 'complete',
  spSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const rbGame = {
  matchupPlayerId: 102,
  gameNum: 7,
  gameIdentifier: '202410200nyg',
  id: 202,
  fieldingGamePos: null,
  statsLoadingStatus: 'complete',
  spSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const dstGame = {
  matchupPlayerId: 103,
  gameNum: 3,
  gameIdentifier: '202409150dal',
  id: 203,
  fieldingGamePos: null,
  statsLoadingStatus: 'complete',
  spSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const dlGame = {
  matchupPlayerId: 104,
  gameNum: 5,
  gameIdentifier: '202410060pit',
  id: 204,
  fieldingGamePos: null,
  statsLoadingStatus: 'complete',
  spSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const passingStats = {
  playerId: 1001,
  season: 2024,
  gameNum: 3,
  gameIdentifier: '202409150dal',
  cmp: 22,
  att: 35,
  yds: 287,
  td: 2,
  int: 1,
  sacked: 1,
  sackYds: -7,
  rating: 94.5,
};

const rushingStatsRb = {
  playerId: 1002,
  season: 2024,
  gameNum: 7,
  gameIdentifier: '202410200nyg',
  att: 18,
  yds: 112,
  td: 1,
  lng: 28,
  fumbles: 0,
};

const receivingStatsRb = {
  playerId: 1002,
  season: 2024,
  gameNum: 7,
  gameIdentifier: '202410200nyg',
  rec: 5,
  tgt: 7,
  yds: 43,
  td: 0,
  lng: 14,
  fumbles: 0,
};

const defenseStats = {
  playerId: 1003,
  season: 2024,
  gameNum: 3,
  gameIdentifier: '202409150dal',
  sacks: 2,
  int: 1,
  fumblesRec: 0,
  defTd: 0,
  safeties: 0,
  ptsAllowed: 14,
  ydsAllowed: 289,
  passYdsAllowed: 198,
  rushYdsAllowed: 91,
};

const idpDefenseStats = {
  playerId: 1004,
  season: 2024,
  gameNum: 5,
  gameIdentifier: '202410060pit',
  soloTkl: 5,
  astTkl: 2,
  sacks: '1.5',
  int: 0,
  pd: 1,
  ff: 1,
  fr: 0,
  defTd: 0,
  safeties: 0,
};

describe('getMatchupFootballPlayerGameStats', () => {
  it('returns empty array when matchup not found', async () => {
    const db = createMockDbWithMultipleQueries([[]]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toEqual([]);
  });

  it('returns empty array when no matchup players', async () => {
    const db = createMockDbWithMultipleQueries([matchupInfoResult, []]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toEqual([]);
  });

  it('returns passing stats for QB (offensive player), defense and idpDefense null', async () => {
    // Query order: matchupInfo, matchupPlayers, matchupPlayerGames, passing, rushing, receiving, kicking
    // TakeUniqueOrNull receives array results — wrap single rows in arrays, use [] for no-match
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [qbMatchupPlayer],
      [qbGame],
      [passingStats], // passing
      [], // rushing
      [], // receiving
      [], // kicking
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.playerId).toBe(1001);
    expect(row.matchupPlayerId).toBe(101);
    expect(row.gameNum).toBe(3);
    expect(row.passing).toEqual(passingStats);
    expect(row.defense).toBeNull();
    expect(row.idpDefense).toBeNull();
  });

  it('returns rushing and receiving for RB, defense and idpDefense null', async () => {
    // Queries: matchupInfo, matchupPlayers, matchupPlayerGames, passing(null), rushing, receiving, kicking(null)
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [rbMatchupPlayer],
      [rbGame],
      [], // passing
      [rushingStatsRb],
      [receivingStatsRb],
      [], // kicking
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.playerId).toBe(1002);
    expect(row.rushing).toEqual(rushingStatsRb);
    expect(row.receiving).toEqual(receivingStatsRb);
    expect(row.passing).toBeNull();
    expect(row.kicking).toBeNull();
    expect(row.defense).toBeNull();
    expect(row.idpDefense).toBeNull();
  });

  it('returns defense for DST player, offensive stats and idpDefense null', async () => {
    // Queries: matchupInfo, matchupPlayers, matchupPlayerGames, defense
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [dstMatchupPlayer],
      [dstGame],
      [defenseStats],
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.playerId).toBe(1003);
    expect(row.defense).toEqual(defenseStats);
    expect(row.passing).toBeNull();
    expect(row.rushing).toBeNull();
    expect(row.receiving).toBeNull();
    expect(row.kicking).toBeNull();
    expect(row.idpDefense).toBeNull();
  });

  it('returns idpDefense for IDP DL player, defense and offensive stats null', async () => {
    // Queries: matchupInfo, matchupPlayers, matchupPlayerGames, idpDefense
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [dlMatchupPlayer],
      [dlGame],
      [idpDefenseStats],
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.playerId).toBe(1004);
    expect(row.idpDefense).toEqual(idpDefenseStats);
    expect(row.defense).toBeNull();
    expect(row.passing).toBeNull();
    expect(row.rushing).toBeNull();
    expect(row.receiving).toBeNull();
    expect(row.kicking).toBeNull();
  });

  it('skips games with null gameIdentifier', async () => {
    const gameWithNullId = { ...qbGame, gameIdentifier: null };
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [qbMatchupPlayer],
      [gameWithNullId],
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toEqual([]);
  });

  it('skips players with no season selected', async () => {
    const playerNoSeason = { ...qbMatchupPlayer, season: null };
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [playerNoSeason],
      [qbGame],
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toEqual([]);
  });

  it('handles mixed DST, IDP, and offensive players in same matchup', async () => {
    // Queries: matchupInfo, matchupPlayers(QB+DST+DL), games(3), QB:passing+rushing+receiving+kicking, DST:defense, DL:idpDefense
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [qbMatchupPlayer, dstMatchupPlayer, dlMatchupPlayer],
      [qbGame, dstGame, dlGame],
      [passingStats], // QB passing
      [], // QB rushing
      [], // QB receiving
      [], // QB kicking
      [defenseStats], // DST defense
      [idpDefenseStats], // DL idpDefense
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toHaveLength(3);

    const qbRow = result.find((r) => r.playerId === 1001);
    const dstRow = result.find((r) => r.playerId === 1003);
    const dlRow = result.find((r) => r.playerId === 1004);

    expect(qbRow?.passing).toEqual(passingStats);
    expect(qbRow?.defense).toBeNull();
    expect(qbRow?.idpDefense).toBeNull();

    expect(dstRow?.defense).toEqual(defenseStats);
    expect(dstRow?.idpDefense).toBeNull();
    expect(dstRow?.passing).toBeNull();

    expect(dlRow?.idpDefense).toEqual(idpDefenseStats);
    expect(dlRow?.defense).toBeNull();
    expect(dlRow?.passing).toBeNull();
  });
});
