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
  gamePosition: null,
  statsLoadingStatus: 'complete',
  pitcherStartSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const rbGame = {
  matchupPlayerId: 102,
  gameNum: 7,
  gameIdentifier: '202410200nyg',
  id: 202,
  gamePosition: null,
  statsLoadingStatus: 'complete',
  pitcherStartSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const dstGame = {
  matchupPlayerId: 103,
  gameNum: 3,
  gameIdentifier: '202409150dal',
  id: 203,
  gamePosition: null,
  statsLoadingStatus: 'complete',
  pitcherStartSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const dlGame = {
  matchupPlayerId: 104,
  gameNum: 5,
  gameIdentifier: '202410060pit',
  id: 204,
  gamePosition: null,
  statsLoadingStatus: 'complete',
  pitcherStartSkipped: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const qbOffenseStats = {
  playerId: 1001,
  season: 2024,
  gameNum: 3,
  gameIdentifier: '202409150dal',
  cmp: 22,
  passAtt: 35,
  passYds: 287,
  passTd: 2,
  interceptions: 1,
  sacked: 1,
  sackYds: -7,
  rating: 94.5,
  rushAtt: null,
  rushYds: null,
  rushTd: null,
  rushLng: null,
  rushFumbles: null,
  rec: null,
  tgt: null,
  recYds: null,
  recTd: null,
  recLng: null,
  recFumbles: null,
  fgm: null,
  fga: null,
  fg0_19m: null,
  fg0_19a: null,
  fg20_29m: null,
  fg20_29a: null,
  fg30_39m: null,
  fg30_39a: null,
  fg40_49m: null,
  fg40_49a: null,
  fg50m: null,
  fg50a: null,
  xpm: null,
  xpa: null,
  kLng: null,
};

const rbOffenseStats = {
  playerId: 1002,
  season: 2024,
  gameNum: 7,
  gameIdentifier: '202410200nyg',
  cmp: null,
  passAtt: null,
  passYds: null,
  passTd: null,
  interceptions: null,
  sacked: null,
  sackYds: null,
  rating: null,
  rushAtt: 18,
  rushYds: 112,
  rushTd: 1,
  rushLng: 28,
  rushFumbles: 0,
  rec: 5,
  tgt: 7,
  recYds: 43,
  recTd: 0,
  recLng: 14,
  recFumbles: 0,
  fgm: null,
  fga: null,
  fg0_19m: null,
  fg0_19a: null,
  fg20_29m: null,
  fg20_29a: null,
  fg30_39m: null,
  fg30_39a: null,
  fg40_49m: null,
  fg40_49a: null,
  fg50m: null,
  fg50a: null,
  xpm: null,
  xpa: null,
  kLng: null,
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

  it('returns offense stats for QB via single view query, defense and idpDefense null', async () => {
    // Query order: matchupInfo, matchupPlayers, matchupPlayerGames, offense (view)
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [qbMatchupPlayer],
      [qbGame],
      [qbOffenseStats],
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
    expect(row.offense).toEqual(qbOffenseStats);
    expect(row.defense).toBeNull();
    expect(row.idpDefense).toBeNull();
  });

  it('returns rushing and receiving for RB via single view query, defense and idpDefense null', async () => {
    // Query order: matchupInfo, matchupPlayers, matchupPlayerGames, offense (view)
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [rbMatchupPlayer],
      [rbGame],
      [rbOffenseStats],
    ]);
    const result = await getMatchupFootballPlayerGameStats(
      db as unknown as PublicDb,
      MATCHUP_ID,
    );
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.playerId).toBe(1002);
    expect(row.offense?.rushAtt).toBe(18);
    expect(row.offense?.rushYds).toBe(112);
    expect(row.offense?.rec).toBe(5);
    expect(row.offense?.recYds).toBe(43);
    expect(row.offense?.passAtt).toBeNull();
    expect(row.defense).toBeNull();
    expect(row.idpDefense).toBeNull();
  });

  it('returns defense for DST player, offense and idpDefense null', async () => {
    // Query order: matchupInfo, matchupPlayers, matchupPlayerGames, defense
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
    expect(row.offense).toBeNull();
    expect(row.idpDefense).toBeNull();
  });

  it('returns idpDefense for IDP DL player, defense and offense null', async () => {
    // Query order: matchupInfo, matchupPlayers, matchupPlayerGames, idpDefense
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
    expect(row.offense).toBeNull();
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
    // Queries: matchupInfo, matchupPlayers(QB+DST+DL), games(3), offense(QB view), DST:defense, DL:idpDefense
    const db = createMockDbWithMultipleQueries([
      matchupInfoResult,
      [qbMatchupPlayer, dstMatchupPlayer, dlMatchupPlayer],
      [qbGame, dstGame, dlGame],
      [qbOffenseStats], // QB offense view
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

    expect(qbRow?.offense).toEqual(qbOffenseStats);
    expect(qbRow?.defense).toBeNull();
    expect(qbRow?.idpDefense).toBeNull();

    expect(dstRow?.defense).toEqual(defenseStats);
    expect(dstRow?.idpDefense).toBeNull();
    expect(dstRow?.offense).toBeNull();

    expect(dlRow?.idpDefense).toEqual(idpDefenseStats);
    expect(dlRow?.defense).toBeNull();
    expect(dlRow?.offense).toBeNull();
  });
});
