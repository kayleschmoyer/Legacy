/**
 * Unit tests for matchupScores computeFootballGamePoints (LS-4151).
 *
 * Covers:
 *   - DST branch: defense stats adapted and scored via computeDefenseScore
 *   - IDP branch: IDP stats adapted (sacks numeric→number) and scored via computeIDPScore
 *   - Offense/kicking branch: computeScoring applied per stat group
 *   - Fallback: null stats return 0 points for DST and IDP branches
 */

// Mocks required because importing matchupScores.ts triggers top-level
// builder side effects (objectRef, unionType, queryField).

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn(() => ({
      implement: jest.fn(),
    })),
    unionType: jest.fn(),
    queryField: jest.fn(),
  },
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  eq: jest.fn(),
  inArray: jest.fn(),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema: {
    leagues: {},
    matchups: {},
    teams: {},
    matchupPlayers: {},
    leaguePosition: {},
    players: {},
    gameFootballDefense: { $inferSelect: {} },
    gameFootballDefenseIdp: { $inferSelect: {} },
    gameFootballPassing: { $inferSelect: {} },
    gameFootballRushing: { $inferSelect: {} },
    gameFootballReceiving: { $inferSelect: {} },
    gameFootballKicking: { $inferSelect: {} },
    gameBatting: {},
    gamePitching: {},
    gameFielding: {},
    leagueWeekPlayerSeasons: {},
    matchupPlayerGames: {},
  },
  getMatchupFootballPlayerGameStats: jest.fn(),
}));

import { computeFootballGamePoints } from './matchupScores';

// ---------------------------------------------------------------------------
// Minimal stat shapes — only fields that matter to the scoring logic
// ---------------------------------------------------------------------------

type DefenseRow = Parameters<typeof computeFootballGamePoints>[0]['defense'] &
  object;
type IdpRow = Parameters<typeof computeFootballGamePoints>[0]['idpDefense'] &
  object;
// All offensive/kicking stats now live in a single unified offense row.
type OffenseRow = Parameters<typeof computeFootballGamePoints>[0]['offense'] &
  object;

function makeDefenseRow(overrides: Partial<DefenseRow> = {}): DefenseRow {
  return {
    sacks: null,
    interceptions: null,
    fumblesRec: null,
    defTd: null,
    safeties: null,
    ptsAllowed: null,
    ydsAllowed: null,
    passYdsAllowed: null,
    rushYdsAllowed: null,
    // extra columns that the full Drizzle row would have
    playerId: 1,
    season: 2024,
    gameNum: 1,
    gameIdentifier: 'G1',
    ...overrides,
  } as DefenseRow;
}

function makeIdpRow(overrides: Partial<IdpRow> = {}): IdpRow {
  return {
    soloTkl: null,
    astTkl: null,
    sacks: null,
    interceptions: null,
    pd: null,
    ff: null,
    fr: null,
    defTd: null,
    safeties: null,
    playerId: 1,
    season: 2024,
    gameNum: 1,
    gameIdentifier: 'G1',
    ...overrides,
  } as IdpRow;
}

/** Build a unified offense row. Pass only the fields relevant to a given test. */
function makeOffenseRow(overrides: Partial<OffenseRow> = {}): OffenseRow {
  return {
    playerId: 1,
    season: 2024,
    gameNum: 1,
    gameIdentifier: 'G1',
    // passing
    cmp: null,
    passAtt: null,
    passYds: null,
    passTd: null,
    interceptions: null,
    sacked: null,
    sackYds: null,
    rating: null,
    // rushing
    rushAtt: null,
    rushYds: null,
    rushTd: null,
    rushLng: null,
    rushFumbles: null,
    // receiving
    rec: null,
    tgt: null,
    recYds: null,
    recTd: null,
    recLng: null,
    recFumbles: null,
    // kicking
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
    ...overrides,
  } as OffenseRow;
}

function makeGameStats(
  overrides: {
    defense?: DefenseRow | null;
    idpDefense?: IdpRow | null;
    offense?: OffenseRow | null;
  } = {},
) {
  return {
    playerId: 1,
    matchupPlayerId: 1,
    gameNum: 1,
    gameIdentifier: 'G1',
    offense: null,
    defense: null,
    idpDefense: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DST branch (isDst=true)
// ---------------------------------------------------------------------------

describe('computeFootballGamePoints — DST branch', () => {
  it('scores a DST with a sack and shutout correctly', () => {
    // sacks: 1×1 = 1, pts_allowed=0 → pts_0 band = 10 → total = 11
    const pts = computeFootballGamePoints(
      makeGameStats({ defense: makeDefenseRow({ sacks: 1, ptsAllowed: 0 }) }),
      true,
      false,
    );
    expect(pts).toBeCloseTo(11);
  });

  it('scores a DST with interception and mid-range points allowed', () => {
    // int: 1×2 = 2, pts_allowed=20 → pts_18_27 band = 0 → total = 2
    const pts = computeFootballGamePoints(
      makeGameStats({
        defense: makeDefenseRow({ interceptions: 1, ptsAllowed: 20 }),
      }),
      true,
      false,
    );
    expect(pts).toBeCloseTo(2);
  });

  it('scores a DST with defensive TD and fumble recovery', () => {
    // def_td: 1×6 = 6, fumblesRec: 1×2 = 2, pts_allowed=14 → pts_14_17 band = 1 → total = 9
    const pts = computeFootballGamePoints(
      makeGameStats({
        defense: makeDefenseRow({ defTd: 1, fumblesRec: 1, ptsAllowed: 14 }),
      }),
      true,
      false,
    );
    expect(pts).toBeCloseTo(9);
  });

  it('returns 0 when defense row is null', () => {
    const pts = computeFootballGamePoints(
      makeGameStats({ defense: null }),
      true,
      false,
    );
    expect(pts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// IDP branch (isDst=false, isIdp=true)
// ---------------------------------------------------------------------------

describe('computeFootballGamePoints — IDP branch', () => {
  it('scores IDP tackles correctly', () => {
    // solo_tkl: 3×1 = 3, ast_tkl: 2×0.5 = 1 → total = 4
    const pts = computeFootballGamePoints(
      makeGameStats({ idpDefense: makeIdpRow({ soloTkl: 3, astTkl: 2 }) }),
      false,
      true,
    );
    expect(pts).toBeCloseTo(4);
  });

  it('converts sacks from numeric string to number before scoring', () => {
    // sacks: '1.5' stored as numeric → 1.5×2 = 3, plus solo_tkl: 1×1 = 1 → total = 4
    const pts = computeFootballGamePoints(
      makeGameStats({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        idpDefense: makeIdpRow({ sacks: '1.5' as any, soloTkl: 1 }),
      }),
      false,
      true,
    );
    expect(pts).toBeCloseTo(4);
  });

  it('scores IDP with interception and defensive TD', () => {
    // int: 1×3 = 3, def_td: 1×6 = 6 → total = 9
    const pts = computeFootballGamePoints(
      makeGameStats({
        idpDefense: makeIdpRow({ interceptions: 1, defTd: 1 }),
      }),
      false,
      true,
    );
    expect(pts).toBeCloseTo(9);
  });

  it('returns 0 when idpDefense row is null', () => {
    const pts = computeFootballGamePoints(
      makeGameStats({ idpDefense: null }),
      false,
      true,
    );
    expect(pts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Offense / kicking branch (isDst=false, isIdp=false)
// ---------------------------------------------------------------------------

describe('computeFootballGamePoints — offense/kicking branch', () => {
  it('scores a passing performance correctly', () => {
    // passYds: 300×0.04 = 12, passTd: 2×4 = 8 → total = 20
    const pts = computeFootballGamePoints(
      makeGameStats({
        offense: makeOffenseRow({ passYds: 300, passTd: 2, interceptions: 0 }),
      }),
      false,
      false,
    );
    expect(pts).toBeCloseTo(20);
  });

  it('deducts for interceptions in passing', () => {
    // passYds: 200×0.04 = 8, passTd: 1×4 = 4, interceptions: 2×-2 = -4 → total = 8
    const pts = computeFootballGamePoints(
      makeGameStats({
        offense: makeOffenseRow({ passYds: 200, passTd: 1, interceptions: 2 }),
      }),
      false,
      false,
    );
    expect(pts).toBeCloseTo(8);
  });

  it('scores a rushing performance correctly', () => {
    // rushYds: 100×0.1 = 10, rushTd: 1×6 = 6 → total = 16
    const pts = computeFootballGamePoints(
      makeGameStats({
        offense: makeOffenseRow({ rushYds: 100, rushTd: 1 }),
      }),
      false,
      false,
    );
    expect(pts).toBeCloseTo(16);
  });

  it('scores a receiving performance correctly', () => {
    // rec: 5×1 = 5, recYds: 60×0.1 = 6, recTd: 1×6 = 6 → total = 17
    const pts = computeFootballGamePoints(
      makeGameStats({
        offense: makeOffenseRow({ rec: 5, recYds: 60, recTd: 1 }),
      }),
      false,
      false,
    );
    expect(pts).toBeCloseTo(17);
  });

  it('scores a kicker with FG, 50+ FG, and XP correctly', () => {
    // fgm: 2×3=6, fg_50m: 1×5=5, xpm: 3×1=3 → total = 14
    const pts = computeFootballGamePoints(
      makeGameStats({
        offense: makeOffenseRow({ fgm: 2, fg50m: 1, xpm: 3 }),
      }),
      false,
      false,
    );
    expect(pts).toBeCloseTo(14);
  });

  it('accumulates points across multiple stat groups', () => {
    // passing (passYds:150×0.04=6, passTd:1×4=4) + rushing (rushYds:50×0.1=5, rushTd:1×6=6) → total = 21
    const pts = computeFootballGamePoints(
      makeGameStats({
        offense: makeOffenseRow({
          passYds: 150,
          passTd: 1,
          rushYds: 50,
          rushTd: 1,
        }),
      }),
      false,
      false,
    );
    expect(pts).toBeCloseTo(21);
  });

  it('returns 0 when offense row is null', () => {
    const pts = computeFootballGamePoints(makeGameStats(), false, false);
    expect(pts).toBe(0);
  });
});
