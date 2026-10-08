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
/** A lineup slot (league_positions.id); bench rows carry null. */
const STARTER_POSITION_ID = 3;

const matchupInfoResult = [{ leagueId: LEAGUE_ID, weekNumber: WEEK_NUMBER }];
const matchupPlayersResult = [
  {
    matchupPlayerId: MATCHUP_PLAYER_ID,
    playerId: PLAYER_ID,
    season: SEASON,
    matchupId: MATCHUP_ID,
    positionId: STARTER_POSITION_ID,
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

/**
 * LS-9602 — repeated game selections must each contribute.
 *
 * LS-9534 decided (2026-08-23) that one real game MAY legitimately fill several
 * slots of a matchup. getMatchupPlayerGameStats used to collapse those with
 * `new Set(gameIdentifiers)`, so a game filling five slots scored once and the
 * other four selections were silently discarded — under-counting the persisted
 * matchups.team1_score / team2_score the UI renders.
 */
describe('getMatchupPlayerGameStats — repeated game selections (LS-9602)', () => {
  /** Build N matchup_player_games rows all pointing at the same real game. */
  const slotsOnSameGame = (count: number): MockRow[] =>
    Array.from({ length: count }, (_, i) => ({
      matchupPlayerId: MATCHUP_PLAYER_ID,
      gameNum: i + 1,
      gameIdentifier: GAME_IDENTIFIER,
    }));

  const selectCallCount = (db: PublicDb): number =>
    (db as unknown as { select: jest.Mock }).select.mock.calls.length;

  it('returns one entry per slot when the same game fills three slots', async () => {
    const db = createMockDb([
      matchupInfoResult,
      matchupPlayersResult,
      slotsOnSameGame(3),
      matchupResult,
      teamMembersResult,
      [battingRow],
      [], // pitching
      [], // fielding
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);

    // Previously 1 — the dedupe collapsed all three slots into a single entry.
    expect(result).toHaveLength(3);
    for (const entry of result) {
      expect(entry.playerId).toBe(PLAYER_ID);
      expect(entry.season).toBe(SEASON);
      expect(entry.teamId).toBe(TEAM1_ID);
      expect(entry.battingStats).toEqual(battingRow);
    }
  });

  it('multiplies the contribution by the slot count (all five slots on one game)', async () => {
    const db = createMockDb([
      matchupInfoResult,
      matchupPlayersResult,
      slotsOnSameGame(5),
      matchupResult,
      teamMembersResult,
      [battingRow],
      [],
      [],
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);

    expect(result).toHaveLength(5);
    // The scoring layer aggregates these entries additively, so N identical
    // entries are worth N times the single-slot contribution.
    const totalHits = result.reduce(
      (sum, entry) => sum + (entry.battingStats?.h ?? 0),
      0,
    );
    expect(totalHits).toBe(battingRow.h * 5);
  });

  it('does not issue extra stat queries for repeated slots', async () => {
    // Stat rows are a pure function of (playerId, season, gameIdentifier), so
    // five slots on one game must still cost exactly one batting + one pitching
    // + one fielding fetch. Guards the N+1 risk called out in LS-9602.
    const oneSlot = createMockDb([
      matchupInfoResult,
      matchupPlayersResult,
      slotsOnSameGame(1),
      matchupResult,
      teamMembersResult,
      [battingRow],
      [],
      [],
    ]);
    await getMatchupPlayerGameStats(oneSlot, MATCHUP_ID);

    const fiveSlots = createMockDb([
      matchupInfoResult,
      matchupPlayersResult,
      slotsOnSameGame(5),
      matchupResult,
      teamMembersResult,
      [battingRow],
      [],
      [],
    ]);
    const result = await getMatchupPlayerGameStats(fiveSlots, MATCHUP_ID);

    expect(result).toHaveLength(5);
    expect(selectCallCount(fiveSlots)).toBe(selectCallCount(oneSlot));
  });

  it('keeps distinct games distinct while repeating duplicated ones', async () => {
    const otherGameId = 'BOS202105200';
    const otherBattingRow = {
      ...battingRow,
      gameIdentifier: otherGameId,
      gameNum: 2,
      h: 1,
    };

    const db = createMockDb([
      matchupInfoResult,
      matchupPlayersResult,
      [
        {
          matchupPlayerId: MATCHUP_PLAYER_ID,
          gameNum: 1,
          gameIdentifier: GAME_IDENTIFIER,
        },
        {
          matchupPlayerId: MATCHUP_PLAYER_ID,
          gameNum: 2,
          gameIdentifier: GAME_IDENTIFIER,
        },
        {
          matchupPlayerId: MATCHUP_PLAYER_ID,
          gameNum: 3,
          gameIdentifier: otherGameId,
        },
      ],
      matchupResult,
      teamMembersResult,
      [battingRow], // first game — batting
      [], // first game — pitching
      [], // first game — fielding
      [otherBattingRow], // second game — batting
      [], // second game — pitching
      [], // second game — fielding
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);

    expect(result).toHaveLength(3);
    expect(
      result.filter((r) => r.battingStats?.gameIdentifier === GAME_IDENTIFIER),
    ).toHaveLength(2);
    expect(
      result.filter((r) => r.battingStats?.gameIdentifier === otherGameId),
    ).toHaveLength(1);
  });

  it('does not merge game lists across two matchup_player rows for one player', async () => {
    // matchup_players is unique on (matchup_id, player_id, team_id), so the same
    // player can hold two rows in one matchup. Keying the map by playerId merged
    // their game lists and applied the FIRST row's season to both.
    const secondMatchupPlayerId = MATCHUP_PLAYER_ID + 1;
    const secondSeason = 1998;
    const secondGameId = 'CHN199804060';

    const db = createMockDb([
      matchupInfoResult,
      [
        {
          matchupPlayerId: MATCHUP_PLAYER_ID,
          playerId: PLAYER_ID,
          season: SEASON,
          matchupId: MATCHUP_ID,
          positionId: STARTER_POSITION_ID,
        },
        {
          matchupPlayerId: secondMatchupPlayerId,
          playerId: PLAYER_ID,
          season: secondSeason,
          matchupId: MATCHUP_ID,
          positionId: STARTER_POSITION_ID,
        },
      ],
      [
        {
          matchupPlayerId: MATCHUP_PLAYER_ID,
          gameNum: 1,
          gameIdentifier: GAME_IDENTIFIER,
        },
        {
          matchupPlayerId: secondMatchupPlayerId,
          gameNum: 1,
          gameIdentifier: secondGameId,
        },
      ],
      matchupResult,
      teamMembersResult,
      [battingRow], // first matchup player
      [],
      [],
      [{ ...battingRow, season: secondSeason, gameIdentifier: secondGameId }],
      [],
      [],
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);

    expect(result).toHaveLength(2);
    // Each matchup_player row keeps its own resolved season.
    expect(result.map((r) => r.season).sort()).toEqual([secondSeason, SEASON]);
  });
});

/**
 * LS-10681: matchup_players holds the whole roster (bench rows have a null
 * positionId) and game selection picks games for every row, so the persisted
 * score summed starters AND bench — roughly doubling it against every client
 * view, which counts starters only.
 */
describe('getMatchupPlayerGameStats — bench players do not score (LS-10681)', () => {
  const BENCH_MATCHUP_PLAYER_ID = MATCHUP_PLAYER_ID + 1;
  const BENCH_PLAYER_ID = PLAYER_ID + 1;
  const BENCH_GAME_ID = 'BOS202105200';

  it('returns stat rows for starters only, skipping a bench player with selected games', async () => {
    const db = createMockDb([
      matchupInfoResult,
      [
        ...matchupPlayersResult,
        {
          matchupPlayerId: BENCH_MATCHUP_PLAYER_ID,
          playerId: BENCH_PLAYER_ID,
          season: SEASON,
          matchupId: MATCHUP_ID,
          positionId: null,
        },
      ],
      [
        ...gamesResult,
        {
          matchupPlayerId: BENCH_MATCHUP_PLAYER_ID,
          gameIdentifier: BENCH_GAME_ID,
        },
      ],
      matchupResult,
      [
        ...teamMembersResult,
        { teamId: TEAM1_ID, playerId: BENCH_PLAYER_ID, leagueId: LEAGUE_ID },
      ],
      [battingRow], // starter's game only — the bench game is never fetched
      [],
      [],
    ]);

    const result = await getMatchupPlayerGameStats(db, MATCHUP_ID);

    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe(PLAYER_ID);
    expect(result.some((r) => r.playerId === BENCH_PLAYER_ID)).toBe(false);
  });
});
