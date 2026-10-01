// ── Mocks ───────────────────────────────────────────────────────────────────

const mockGetCamelCaseScoringMultipliersForLeague = jest.fn();
const mockGetScoringMultipliersForLeague = jest.fn();
const mockGetMatchupPlayerGameStats = jest.fn();
const mockUpdateMatchupScore = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  getCamelCaseScoringMultipliersForLeague: (...args: unknown[]): unknown =>
    mockGetCamelCaseScoringMultipliersForLeague(...args),
  getScoringMultipliersForLeague: (...args: unknown[]): unknown =>
    mockGetScoringMultipliersForLeague(...args),
  getMatchupPlayerGameStats: (...args: unknown[]): unknown =>
    mockGetMatchupPlayerGameStats(...args),
  updateMatchupScore: (...args: unknown[]): unknown =>
    mockUpdateMatchupScore(...args),
}));

// The scoring engine itself is real — these tests exist to prove the numbers
// that come out of the shared function are right, which a mocked engine cannot
// show. The spy only records the arguments it was handed on the way through.
const calculateMatchupScoreSpy = jest.fn();

jest.mock('@legacy-sports/scoring', () => {
  const actual = jest.requireActual<typeof import('@legacy-sports/scoring')>(
    '@legacy-sports/scoring',
  );
  return {
    ...actual,
    calculateMatchupScore: (
      ...args: Parameters<typeof actual.calculateMatchupScore>
    ) => {
      calculateMatchupScoreSpy(...args);
      return actual.calculateMatchupScore(...args);
    },
  };
});

// ── Imports under test ──────────────────────────────────────────────────────

import type { PublicDb } from '@legacy-sports/db-client';
import type { ScoringSettings } from '@legacy-sports/scoring';
import { createLeagueMatchupScorer, scoreMatchup } from './matchup-score';

// ── Fixtures ────────────────────────────────────────────────────────────────

const LEAGUE_ID = 77;
const MATCHUP_ID = 1;
const TEAM1_ID = 10;
const TEAM2_ID = 20;

/**
 * A league profile in the form `getCamelCaseScoringMultipliersForLeague`
 * returns it: the same weights the DB stores under snake_case
 * `source_column`s, re-keyed to the camelCase names the scoring engine reads.
 */
const CAMEL_CASE_LEAGUE_MULTIPLIERS = {
  batting: { hr: 4, h: 1 },
  pitching: { outsRecorded: 1, so: 1 },
  fielding: { eDef: -1, dpDef: 1 },
};

/** The same profile as it comes out of the DB, before conversion. */
const RAW_LEAGUE_MULTIPLIERS = {
  batting: { hr: 4, h: 1 },
  pitching: { outs_recorded: 1, so: 1 },
  fielding: { e_def: -1, dp_def: 1 },
};

function makeMatchupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCHUP_ID,
    team1Id: TEAM1_ID,
    team2Id: TEAM2_ID,
    gamesPerMatchup: 5,
    team1Score: null,
    team2Score: null,
    ...overrides,
  };
}

/** Pass `null` for `matchupRow` to model a matchup that is not in the table. */
function makeDb(matchupRow: unknown = makeMatchupRow()) {
  const findFirst = jest.fn().mockResolvedValue(matchupRow);
  return {
    db: { query: { matchups: { findFirst } } } as unknown as PublicDb,
    findFirst,
  };
}

/** A batting-only line: 1 HR + 2 H = 4 + 2 = 6 points under the fixture profile. */
function battingRow(teamId: number, playerId: number) {
  return {
    playerId,
    teamId,
    season: 1985,
    gameNum: 1,
    battingStats: { h: 2, hr: 1 },
    pitchingStats: null,
    fieldingStats: null,
  };
}

/**
 * The line that exposed the snake_case bug: `outsRecorded` is the dominant
 * pitching term, and `eDef` / `dpDef` are the fielding pair that went with it.
 */
function pitchingAndFieldingRow(teamId: number, playerId: number) {
  return {
    playerId,
    teamId,
    season: 1985,
    gameNum: 1,
    battingStats: null,
    pitchingStats: { outsRecorded: 18, so: 7 },
    fieldingStats: { eDef: 1, dpDef: 2 },
  };
}

/**
 * The `scoringSettings` argument (7th) of the engine's most recent call.
 *
 * `mock.calls` is loosely typed, so narrow through `unknown[][]` rather than
 * indexing an `any`.
 */
function lastScoringSettings(): ScoringSettings {
  const calls = calculateMatchupScoreSpy.mock.calls as unknown[][];
  return calls[calls.length - 1][6] as ScoringSettings;
}

function expectPersistedScores() {
  expect(mockUpdateMatchupScore).toHaveBeenCalledTimes(1);
  const [, , team1Score, team2Score] = mockUpdateMatchupScore.mock.calls[0] as [
    unknown,
    unknown,
    number | null,
    number | null,
  ];
  return { team1Score, team2Score };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCamelCaseScoringMultipliersForLeague.mockResolvedValue(
    CAMEL_CASE_LEAGUE_MULTIPLIERS,
  );
  mockGetScoringMultipliersForLeague.mockResolvedValue(RAW_LEAGUE_MULTIPLIERS);
  mockGetMatchupPlayerGameStats.mockResolvedValue([]);
  mockUpdateMatchupScore.mockImplementation(
    (_db: unknown, _id: number, team1Score: number, team2Score: number) =>
      Promise.resolve({
        team1Score: team1Score === null ? null : String(team1Score),
        team2Score: team2Score === null ? null : String(team2Score),
      }),
  );
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('scoreMatchup', () => {
  it('throws the matchup-not-found message callers match on', async () => {
    const { db } = makeDb(null);

    // The game-selection and stats pipelines both match this exact string to
    // tell a benign enqueue/delete race apart from a real failure.
    await expect(scoreMatchup(db, 999, LEAGUE_ID)).rejects.toThrow(
      'Matchup 999 not found',
    );
  });

  it('leaves an already-scored matchup alone unless recalculation is forced', async () => {
    const { db } = makeDb(
      makeMatchupRow({ team1Score: '12.5', team2Score: '9.3' }),
    );

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(result).toMatchObject({
      matchupId: MATCHUP_ID,
      team1Score: 12.5,
      team2Score: 9.3,
      updated: false,
    });
    expect(mockGetMatchupPlayerGameStats).not.toHaveBeenCalled();
    expect(mockUpdateMatchupScore).not.toHaveBeenCalled();
  });

  it('rescores an already-scored matchup when recalculation is forced', async () => {
    const { db } = makeDb(
      makeMatchupRow({ team1Score: '12.5', team2Score: '9.3' }),
    );
    mockGetMatchupPlayerGameStats.mockResolvedValue([
      battingRow(TEAM1_ID, 100),
    ]);

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID, {
      forceRecalculation: true,
    });

    expect(result.updated).toBe(true);
    expect(result.team1Score).toBe(6);
    expect(mockGetMatchupPlayerGameStats).toHaveBeenCalledWith(db, MATCHUP_ID);
  });

  it('partitions stat rows onto the two teams', async () => {
    const { db } = makeDb();
    mockGetMatchupPlayerGameStats.mockResolvedValue([
      battingRow(TEAM1_ID, 100),
      battingRow(TEAM1_ID, 101),
      battingRow(TEAM2_ID, 200),
      // A row for a team in neither side of this matchup is dropped.
      battingRow(999, 300),
    ]);

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(result.team1Score).toBe(12);
    expect(result.team2Score).toBe(6);
    expect(result.team1GamesSelected).toBe(2);
    expect(result.team2GamesSelected).toBe(1);
  });

  it('reports gamesPerMatchup from the matchup row', async () => {
    const { db } = makeDb(makeMatchupRow({ gamesPerMatchup: 3 }));

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(result.gamesPerMatchup).toBe(3);
  });

  it('reports null scores when neither team has any stats', async () => {
    const { db } = makeDb(makeMatchupRow({ team1Id: null, team2Id: null }));

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(result.team1Score).toBeNull();
    expect(result.team2Score).toBeNull();
    expect(result.team1GamesSelected).toBe(0);
    expect(result.team2GamesSelected).toBe(0);
    expect(result.updated).toBe(true);
  });

  it('persists the score through exactly one write', async () => {
    // LS-9665 stamps matchups.scored_at at that write site, so there must stay
    // exactly one of them for every entry point.
    const { db } = makeDb();
    mockGetMatchupPlayerGameStats.mockResolvedValue([
      battingRow(TEAM1_ID, 100),
      battingRow(TEAM2_ID, 200),
    ]);

    await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    const { team1Score, team2Score } = expectPersistedScores();
    expect(team1Score).toBe(6);
    expect(team2Score).toBe(6);
  });
});

describe('scoreMatchup — scoring settings are resolved internally (LS-9532)', () => {
  it('reads the league profile through the camelCasing accessor, never the raw one', async () => {
    const { db } = makeDb();

    await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(mockGetCamelCaseScoringMultipliersForLeague).toHaveBeenCalledWith(
      db,
      LEAGUE_ID,
    );
    // The raw accessor keys weights by snake_case source_column. Reaching for
    // it here is the bug this function was extracted to make unreachable.
    expect(mockGetScoringMultipliersForLeague).not.toHaveBeenCalled();
  });

  it('hands the scoring engine the league profile, not defaults', async () => {
    const { db } = makeDb();

    await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(lastScoringSettings()).toEqual({
      batting: CAMEL_CASE_LEAGUE_MULTIPLIERS.batting,
      pitching: CAMEL_CASE_LEAGUE_MULTIPLIERS.pitching,
      fielding: CAMEL_CASE_LEAGUE_MULTIPLIERS.fielding,
    });
  });

  it('scores outs_recorded, e_def and dp_def instead of silently dropping them', async () => {
    // The regression that motivated the consolidation: with raw snake_case
    // multipliers these three stats miss their lookup and resolve to weight 0,
    // producing a plausible-looking but materially under-scored matchup rather
    // than an error. outsRecorded 18×1 + so 7×1 + eDef 1×-1 + dpDef 2×1 = 26.
    const { db } = makeDb();
    mockGetMatchupPlayerGameStats.mockResolvedValue([
      pitchingAndFieldingRow(TEAM1_ID, 100),
    ]);

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(result.team1Score).toBe(26);

    // Had the raw profile been used, only `so` would have matched — 7.
    expect(result.team1Score).not.toBe(7);
  });
});

describe('scoreMatchup — N-times semantics (LS-9532)', () => {
  it('counts a game selected into N slots N times', async () => {
    // getMatchupPlayerGameStats returns one row per selected slot, so the same
    // game filling three slots arrives three times. Each must contribute:
    // 3 × 6 = 18, not 6.
    const { db } = makeDb();
    const repeated = battingRow(TEAM1_ID, 100);
    mockGetMatchupPlayerGameStats.mockResolvedValue([
      repeated,
      { ...repeated },
      { ...repeated },
    ]);

    const result = await scoreMatchup(db, MATCHUP_ID, LEAGUE_ID);

    expect(result.team1Score).toBe(18);
    expect(result.team1GamesSelected).toBe(3);
  });
});

describe('createLeagueMatchupScorer', () => {
  it('reads the league scoring profile once for many matchups', async () => {
    const findFirst = jest
      .fn()
      .mockImplementation(() => Promise.resolve(makeMatchupRow()));
    const db = {
      query: { matchups: { findFirst } },
    } as unknown as PublicDb;
    mockGetMatchupPlayerGameStats.mockResolvedValue([
      battingRow(TEAM1_ID, 100),
    ]);

    const scorer = await createLeagueMatchupScorer(db, LEAGUE_ID);
    for (const matchupId of [1, 2, 3]) {
      await scorer.scoreMatchup(matchupId, { forceRecalculation: true });
    }

    expect(scorer.leagueId).toBe(LEAGUE_ID);
    expect(mockGetCamelCaseScoringMultipliersForLeague).toHaveBeenCalledTimes(
      1,
    );
    expect(mockUpdateMatchupScore).toHaveBeenCalledTimes(3);
  });

  it('scores identically to the one-shot entry point', async () => {
    mockGetMatchupPlayerGameStats.mockResolvedValue([
      pitchingAndFieldingRow(TEAM1_ID, 100),
    ]);

    const oneShot = await scoreMatchup(makeDb().db, MATCHUP_ID, LEAGUE_ID);
    const viaScorer = await (
      await createLeagueMatchupScorer(makeDb().db, LEAGUE_ID)
    ).scoreMatchup(MATCHUP_ID);

    expect(viaScorer).toEqual(oneShot);
  });
});
