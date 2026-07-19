/**
 * Tests for getMatchupPlayerGameStats — specifically the duplicate-row
 * tolerance added in LS-8224 where multiple game_batting/game_pitching/
 * game_fielding rows for the same (playerId, season, gameIdentifier)
 * previously caused "Found non unique value" to propagate as
 * "Failed to calculate scores for matchup N".
 */

import { getMatchupPlayerGameStats, type PublicDb } from './PublicDbClient';

type MockRow = Record<string, unknown>;

/** Minimal typed stand-in for the Drizzle query-builder chain used by getMatchupPlayerGameStats. */
interface DrizzleMockChain {
  select(): DrizzleMockChain;
  from(): DrizzleMockChain;
  where(): DrizzleMockChain;
  orderBy(): DrizzleMockChain;
  limit(): DrizzleMockChain;
  leftJoin(): DrizzleMockChain;
  then(onFulfilled: (value: MockRow[]) => MockRow[]): MockRow[];
}

/**
 * Build a chainable Drizzle mock that returns results[i] on the i-th select()
 * call. Each chain is thenable so `await chain` resolves to the array.
 */
function createMockDb(results: MockRow[][]): PublicDb {
  let callIndex = 0;

  const makeChain = (): DrizzleMockChain => {
    const result = results[callIndex] ?? [];
    callIndex++;

    return {
      select: jest.fn().mockImplementation(() => makeChain()),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      then: jest.fn((onFulfilled: (value: MockRow[]) => MockRow[]) =>
        onFulfilled(result),
      ),
    };
  };

  return {
    select: jest.fn().mockImplementation(() => makeChain()),
  } as unknown as PublicDb;
}

const MATCHUP_ID = 55077;
const LEAGUE_ID = 10;
const WEEK_NUMBER = 3;
const PLAYER_ID = 100;
const TEAM1_ID = 1;
const MATCHUP_PLAYER_ID = 7;
const GAME_IDENTIFIER = 'ANA202104150';
const SEASON = 2021;

const matchupInfoResult = [{ leagueId: LEAGUE_ID, weekNumber: WEEK_NUMBER }];
const matchupPlayersResult = [
  {
    matchupPlayerId: MATCHUP_PLAYER_ID,
    playerId: PLAYER_ID,
    season: SEASON,
    matchupId: MATCHUP_ID,
  },
];
const gamesResult = [
  { matchupPlayerId: MATCHUP_PLAYER_ID, gameIdentifier: GAME_IDENTIFIER },
];
const matchupResult = [
  { id: MATCHUP_ID, leagueId: LEAGUE_ID, team1Id: TEAM1_ID, team2Id: 2 },
];
const teamMembersResult = [
  { teamId: TEAM1_ID, playerId: PLAYER_ID, leagueId: LEAGUE_ID },
];

const battingRow = {
  playerId: PLAYER_ID,
  season: SEASON,
  gameNum: 1,
  gameIdentifier: GAME_IDENTIFIER,
  h: 2,
  hr: 1,
  rbi: 3,
  pa: 4,
  ab: 4,
  r: 1,
  doubles: 0,
  triples: 0,
  sb: 0,
  cs: 0,
  bb: 0,
  so: 1,
  gidp: 0,
  hbp: 0,
  sh: 0,
  sf: null,
  ibb: 0,
};

describe('getMatchupPlayerGameStats', () => {
  it('returns stats when there is exactly one batting row per game', async () => {
    const db = createMockDb([
      matchupInfoResult,
      matchupPlayersResult,
      gamesResult,
      matchupResult,
      teamMembersResult,
      [battingRow], // batting — single row
      [], // pitching — none
      [], // fielding — none
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);

    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe(PLAYER_ID);
    expect(result[0].battingStats).toEqual(battingRow);
    expect(result[0].pitchingStats).toBeNull();
    expect(result[0].fieldingStats).toBeNull();
  });

  it('does not throw and uses the first row when duplicate batting rows exist (LS-8224)', async () => {
    const duplicateBattingRow = { ...battingRow, h: 99 };

    const result = await getMatchupPlayerGameStats(
      createMockDb([
        matchupInfoResult,
        matchupPlayersResult,
        gamesResult,
        matchupResult,
        teamMembersResult,
        [battingRow, duplicateBattingRow], // two rows — old code threw here
        [],
        [],
      ]),
      MATCHUP_ID,
    );

    expect(result[0].battingStats).toEqual(battingRow);
  });

  it('returns null stats when no game rows exist for a player game', async () => {
    const db = createMockDb([
      matchupInfoResult,
      matchupPlayersResult,
      gamesResult,
      matchupResult,
      teamMembersResult,
      [], // batting — none
      [], // pitching — none
      [], // fielding — none
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);

    expect(result).toHaveLength(1);
    expect(result[0].battingStats).toBeNull();
    expect(result[0].pitchingStats).toBeNull();
    expect(result[0].fieldingStats).toBeNull();
  });

  it('returns empty array when matchup does not exist', async () => {
    const db = createMockDb([
      [], // matchupInfo — not found
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);
    expect(result).toEqual([]);
  });

  it('returns empty array when matchup has no players', async () => {
    const db = createMockDb([
      matchupInfoResult,
      [], // no matchup players
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);
    expect(result).toEqual([]);
  });
});
