/**
 * Integration tests for matchupScores resolvers (LS-4151).
 *
 * Covers:
 *   - resolveFootballMatchupScores: data transformation, empty matchups,
 *     both-teams guarantee, DST scoring
 *   - resolveBaseballMatchupScores: data transformation, empty matchups,
 *     batched stat queries
 *   - MatchupStats union type: resolveType discriminator (_type field)
 *   - matchupScores queryField: authentication guard (no user → throws)
 */

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn(() => ({ implement: jest.fn() })),
    unionType: jest.fn(),
    queryField: jest.fn(),
  },
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => ({ _and: args })),
  eq: jest.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
  inArray: jest.fn((col: unknown, vals: unknown) => ({
    _inArray: [col, vals],
  })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../authorization', () => ({
  verifyLeagueMembership: jest.fn().mockResolvedValue({
    leagueId: 1,
    userId: 42,
    teamId: 10,
    permissionLevel: 'general_manager',
  }),
}));

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    leagues: { id: {}, sport: {} },
    matchups: {
      id: {},
      leagueId: {},
      weekNumber: {},
      team1Id: {},
      team2Id: {},
    },
    teams: { id: {}, name: {} },
    matchupPlayers: {
      id: {},
      matchupId: {},
      teamId: {},
      playerId: {},
      positionId: {},
    },
    leaguePosition: { id: {}, positionType: {} },
    players: {
      id: {},
      firstName: {},
      lastName: {},
      isDst: {},
      nflTeam: {},
    },
    gameFootballDefense: { $inferSelect: {} },
    gameFootballDefenseIdp: { $inferSelect: {} },
    gameFootballPassing: { $inferSelect: {} },
    gameFootballRushing: { $inferSelect: {} },
    gameFootballReceiving: { $inferSelect: {} },
    gameFootballKicking: { $inferSelect: {} },
    gameBatting: { $inferSelect: {}, playerId: {}, gameIdentifier: {} },
    gamePitching: { $inferSelect: {}, playerId: {}, gameIdentifier: {} },
    gameFielding: { $inferSelect: {}, playerId: {}, gameIdentifier: {} },
    leagueWeekPlayerSeasons: {
      leagueId: {},
      weekNumber: {},
      playerId: {},
      season: {},
    },
    matchupPlayerGames: { matchupPlayerId: {}, gameIdentifier: {} },
  },
  getMatchupFootballPlayerGameStats: jest.fn(),
}));

import { getMatchupFootballPlayerGameStats } from '@legacy-sports/db-client';
import {
  resolveBaseballMatchupScores,
  resolveFootballMatchupScores,
} from './matchupScores';
import { builder } from '../builder';
import { verifyLeagueMembership } from '../authorization';

const mockVerifyLeagueMembership = verifyLeagueMembership as jest.Mock;

const mockGetFootballStats = getMatchupFootballPlayerGameStats as jest.Mock;

// ---------------------------------------------------------------------------
// Capture builder side-effects at module load time (before any clearAllMocks)
// ---------------------------------------------------------------------------

// Extract resolveType from the MatchupStats union registration.
// jest.mocked(builder) wraps the whole object so property accesses are typed
// as MockedFunction (not unbound class methods), avoiding @typescript-eslint/unbound-method.
const _mockedBuilder = jest.mocked(builder);
const _unionTypeCall = _mockedBuilder.unionType.mock.calls.find(
  ([name]) => name === 'MatchupStats',
);
const resolveType = _unionTypeCall?.[1]?.resolveType as
  | ((value: unknown) => unknown)
  | undefined;

// Extract the matchupScores queryField resolver by invoking the registration
// callback with a minimal mock t object
const _queryFieldEntry = (
  _mockedBuilder.queryField.mock.calls as [string, unknown][]
).find(([name]) => name === 'matchupScores');
let capturedResolve:
  | ((
      root: null,
      args: { leagueId: number; weekNum: number },
      context: { user: unknown; db: unknown },
    ) => Promise<unknown>)
  | undefined;
if (_queryFieldEntry) {
  const callback = _queryFieldEntry[1] as (t: {
    field: (cfg: { resolve: typeof capturedResolve }) => unknown;
    arg: { int: jest.Mock };
  }) => unknown;
  callback({
    field: (cfg) => {
      capturedResolve = cfg.resolve;
    },
    arg: { int: jest.fn(() => ({})) },
  });
}

// ---------------------------------------------------------------------------
// Mock DB helper — sequential queue of select() results
// ---------------------------------------------------------------------------

function buildMockDb(resultQueue: unknown[][]) {
  let callIndex = 0;

  const db = {
    select: jest.fn().mockImplementation(() => {
      const results = resultQueue[callIndex++] ?? [];
      const chain: Record<string, jest.Mock> = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: jest
          .fn()
          .mockImplementation((resolve: (v: unknown) => unknown) =>
            resolve(results),
          ),
      };
      return chain;
    }),
  };

  return db;
}

// ---------------------------------------------------------------------------
// resolveFootballMatchupScores
// ---------------------------------------------------------------------------

describe('resolveFootballMatchupScores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no matchups exist', async () => {
    const db = buildMockDb([
      [], // matchupRows
    ]);

    const result = await resolveFootballMatchupScores(db as never, 1, 1);

    expect(result).toEqual([]);
  });

  it('transforms football stats into correct shape with expected points', async () => {
    // 300 passing yds × 0.04 = 12 pts, 2 TDs × 4 = 8 pts → 20 pts total
    const db = buildMockDb([
      [{ id: 100, team1Id: 10, team2Id: 20 }], // matchupRows
      [
        { id: 10, name: 'Eagles' },
        { id: 20, name: 'Bears' },
      ], // teamRows
      // getMatchupFootballPlayerGameStats is mocked separately below
      [
        {
          matchupPlayerId: 1,
          matchupId: 100,
          teamId: 10,
          playerId: 5,
          positionType: 'QB',
        },
      ], // matchupPlayerRows
      [
        {
          id: 5,
          firstName: 'Patrick',
          lastName: 'Mahomes',
          isDst: false,
          nflTeam: 'KC',
        },
      ], // playerRows
    ]);

    mockGetFootballStats.mockResolvedValueOnce([
      {
        playerId: 5,
        matchupPlayerId: 1,
        gameNum: 1,
        gameIdentifier: '20240901_KC_BAL',
        // offense consolidates passing/rushing/receiving/kicking via view
        offense: {
          passYds: 300,
          passTd: 2,
          interceptions: 0,
          sacked: 0,
          passCmp: 22,
          passAtt: 30,
          rushYds: 0,
          rushTd: 0,
          rushFumbles: 0,
          rec: 0,
          recYds: 0,
          recTd: 0,
          recFumbles: 0,
          fgm: 0,
          fg50m: 0,
          xpm: 0,
        },
        defense: null,
        idpDefense: null,
      },
    ]);

    const result = await resolveFootballMatchupScores(db as never, 1, 1);

    // Both teams should appear; the one with stats should have correct points
    expect(result).toHaveLength(2);

    const eaglesResult = result.find((r) => r.teamId === 10);
    expect(eaglesResult).toBeDefined();
    expect(eaglesResult!.teamName).toBe('Eagles');
    expect(eaglesResult!.players).toHaveLength(1);

    const player = eaglesResult!.players[0];
    expect(player.playerId).toBe(5);
    expect(player.playerName).toBe('Patrick Mahomes');
    expect(player.position).toBe('QB');
    expect(player.isDst).toBe(false);
    expect(player.nflTeam).toBe('KC');
    expect(player.totalPoints).toBeCloseTo(20);
    expect(player.games).toHaveLength(1);
    expect(player.games[0].passing?.yds).toBe(300);
    expect(player.games[0].fantasyPoints).toBeCloseTo(20);
  });

  it('scores DST player using computeDefenseScore (sack + shutout = 11 pts)', async () => {
    const db = buildMockDb([
      [{ id: 100, team1Id: 10, team2Id: 20 }],
      [{ id: 10, name: 'Eagles' }],
      [
        {
          matchupPlayerId: 1,
          matchupId: 100,
          teamId: 10,
          playerId: 99,
          positionType: 'DST',
        },
      ],
      [
        {
          id: 99,
          firstName: 'Eagles',
          lastName: 'DST',
          isDst: true,
          nflTeam: 'PHI',
        },
      ],
    ]);

    mockGetFootballStats.mockResolvedValueOnce([
      {
        playerId: 99,
        matchupPlayerId: 1,
        gameNum: 1,
        gameIdentifier: '20240901_PHI_DAL',
        passing: null,
        rushing: null,
        receiving: null,
        kicking: null,
        defense: {
          id: 1,
          playerId: 99,
          season: 2024,
          gameNum: 1,
          gameIdentifier: '20240901_PHI_DAL',
          sacks: 1,
          int: 0,
          fumblesRec: 0,
          defTd: 0,
          safeties: 0,
          ptsAllowed: 0,
          ydsAllowed: 200,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        idpDefense: null,
      },
    ]);

    const result = await resolveFootballMatchupScores(db as never, 1, 1);

    const eaglesResult = result.find((r) => r.teamId === 10);
    expect(eaglesResult).toBeDefined();
    // 1 sack × 1 = 1 + pts_allowed=0 band = 10 → total = 11
    expect(eaglesResult!.totalPoints).toBeCloseTo(11);
    expect(eaglesResult!.players[0].isDst).toBe(true);
  });

  it('emits both teams even when no game stats have loaded yet', async () => {
    const db = buildMockDb([
      [{ id: 100, team1Id: 10, team2Id: 20 }],
      [
        { id: 10, name: 'Eagles' },
        { id: 20, name: 'Bears' },
      ],
      [], // matchupPlayerRows — empty (no players rostered yet)
      [], // playerRows — no players
    ]);

    mockGetFootballStats.mockResolvedValueOnce([]);

    const result = await resolveFootballMatchupScores(db as never, 1, 1);

    const teamIds = result.map((r) => r.teamId).sort();
    expect(teamIds).toEqual([10, 20]);
    result.forEach((r) => {
      expect(r.totalPoints).toBe(0);
      expect(r.players).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveBaseballMatchupScores
// ---------------------------------------------------------------------------

describe('resolveBaseballMatchupScores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no matchups exist', async () => {
    const db = buildMockDb([
      [], // matchupRows
    ]);

    const result = await resolveBaseballMatchupScores(db as never, 1, 1);

    expect(result).toEqual([]);
  });

  it('transforms baseball batting stats into correct shape with expected points', async () => {
    // 1 HR × 4 = 4 pts (DEFAULT_BATTING_SCORING hr = 4)
    const db = buildMockDb([
      [{ id: 100, team1Id: 10, team2Id: 20 }], // matchupRows
      [
        { id: 10, name: 'Red Sox' },
        { id: 20, name: 'Yankees' },
      ], // teamRows
      // --- batched across all matchups ---
      [
        {
          matchupPlayerId: 1,
          matchupId: 100,
          teamId: 10,
          playerId: 7,
          positionType: 'OF',
        },
      ], // matchupPlayerRows
      [{ playerId: 7, season: 2024 }], // seasonRows
      [{ matchupPlayerId: 1, gameIdentifier: '20240901_BOS_NYY' }], // gameRows
      [{ id: 7, firstName: 'Mike', lastName: 'Trout' }], // playerRows
      // Promise.all: batting, pitching, fielding
      [
        {
          playerId: 7,
          gameIdentifier: '20240901_BOS_NYY',
          gameNum: 1,
          hr: 1,
          h: 2,
          rbi: 2,
          r: 1,
          ab: 4,
          pa: 4,
          sb: 0,
          bb: 0,
          so: 1,
        },
      ], // allBattingRows
      [], // allPitchingRows
      [], // allFieldingRows
    ]);

    const result = await resolveBaseballMatchupScores(db as never, 1, 1);

    const redSox = result.find((r) => r.teamId === 10);
    expect(redSox).toBeDefined();
    expect(redSox!.teamName).toBe('Red Sox');
    expect(redSox!.players).toHaveLength(1);

    const player = redSox!.players[0];
    expect(player.playerId).toBe(7);
    expect(player.playerName).toBe('Mike Trout');
    expect(player.position).toBe('OF');
    // 1 HR × 4 = 4 pts minimum
    expect(player.totalPoints).toBeGreaterThanOrEqual(4);
  });

  it('emits both teams even when no matchup players are rostered', async () => {
    const db = buildMockDb([
      [{ id: 100, team1Id: 10, team2Id: 20 }],
      [
        { id: 10, name: 'Red Sox' },
        { id: 20, name: 'Yankees' },
      ],
      // --- loop matchup 100 ---
      [], // matchupPlayerRows empty → no further queries
    ]);

    const result = await resolveBaseballMatchupScores(db as never, 1, 1);

    const teamIds = result.map((r) => r.teamId).sort();
    expect(teamIds).toEqual([10, 20]);
    result.forEach((r) => {
      expect(r.totalPoints).toBe(0);
      expect(r.players).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// MatchupStats union — resolveType discriminator
// ---------------------------------------------------------------------------

describe('MatchupStats resolveType', () => {
  it('routes football values to FootballMatchupStatsRef', () => {
    expect(resolveType).toBeDefined();
    const result = resolveType!({ _type: 'football', teamId: 1 });
    expect(result).toBeDefined();
  });

  it('routes baseball values (and unknown) to BaseballMatchupStatsRef', () => {
    const result = resolveType!({ _type: 'baseball', teamId: 1 });
    expect(result).toBeDefined();
  });

  it('football and baseball resolve to different ref objects', () => {
    const footballRef = resolveType!({ _type: 'football' });
    const baseballRef = resolveType!({ _type: 'baseball' });
    expect(footballRef).not.toBe(baseballRef);
  });
});

// ---------------------------------------------------------------------------
// matchupScores queryField — authentication guard
// ---------------------------------------------------------------------------

describe('matchupScores queryField — auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyLeagueMembership.mockResolvedValue({
      leagueId: 1,
      userId: 42,
      teamId: 10,
      permissionLevel: 'general_manager',
    });
  });

  it('throws AuthenticationError (UNAUTHENTICATED) when context.user is null', async () => {
    expect(capturedResolve).toBeDefined();
    const mockDb = buildMockDb([]);

    await expect(
      capturedResolve!(
        null,
        { leagueId: 1, weekNum: 1 },
        { user: null, db: mockDb },
      ),
    ).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });

  it('throws ForbiddenError (FORBIDDEN) when user is not a league member', async () => {
    const mockDb = buildMockDb([]);
    mockVerifyLeagueMembership.mockRejectedValueOnce({
      extensions: { code: 'FORBIDDEN' },
    });

    await expect(
      capturedResolve!(
        null,
        { leagueId: 1, weekNum: 1 },
        { user: { id: 42 }, db: mockDb },
      ),
    ).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('does not throw when context.user is a league member (routes to league check)', async () => {
    const mockDb = buildMockDb([
      [], // leagueRows — empty → returns [] immediately
    ]);

    const result = await capturedResolve!(
      null,
      { leagueId: 1, weekNum: 1 },
      { user: { id: 42 }, db: mockDb },
    );

    expect(result).toEqual([]);
    expect(mockVerifyLeagueMembership).toHaveBeenCalledWith(mockDb, 1, 42);
  });
});
