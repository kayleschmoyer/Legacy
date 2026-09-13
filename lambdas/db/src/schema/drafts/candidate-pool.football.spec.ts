/**
 * Tests for fetchCandidatePool's football branches (LS-9483, LS-9484).
 *
 * Two previously-broken things fed the same symptom ("football auto-pick's
 * bench pick is meaningless"):
 *
 *  1. Every football candidate's projected FPG came from
 *     `players.projected_fantasy_points`, which is NULL for all 20,052
 *     football players (LS-9476 postmortem) — so `info.fpg` was always 0.
 *  2. `computeBestBenchPick`'s slots-coverable query joined the baseball-only
 *     `player_eligible_positions`/`position_slot_mapping` tables
 *     unconditionally — football rows never match, so `slotsCoverable` was
 *     always 0 too, independent of bug #1.
 *
 * `benchScore = fpg * (1 + 0.15 * slotsCoverable)` collapsed to a flat 0 tie
 * across every football candidate regardless of which bug you looked at.
 * This exercises both fixes together through the real exported entry point
 * (`fetchCandidatePool`), using the real drizzle-orm `sql`/`eq`/`inArray` and
 * the real `ALLOWED_POSITIONS_BY_SPORT.football` map (LS-9475, already
 * carries DL/LB/DB) so the position-intersection logic is genuinely
 * exercised, not stubbed.
 */

async function loadCandidatePoolModule(): Promise<
  typeof import('./candidate-pool')
> {
  jest.resetModules();

  jest.doMock('@legacy-sports/logging', () => ({
    LOGGER: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      leagues: { id: 'id', sport: 'sport' },
      footballPlayerEligiblePositions: {
        playerId: 'playerId',
        position: 'position',
      },
    },
    // Identity passthrough — league eligibility filtering (playerPool, min
    // career games, etc.) is exercised by its own test suite, not this one.
    filterPlayerIdsByLeagueEligibility: jest.fn(
      async (_db: unknown, ids: number[]) => ({ eligibleIds: new Set(ids) }),
    ),
  }));

  // fetchCandidatePool attaches the draft's DraftRules (LS-10074). Those
  // come from their own loader with its own coverage; stub it so this suite
  // keeps asserting only the candidate-pool queries it is about.
  jest.doMock('./draft-rules', () => ({
    loadDraftRules: jest.fn(async () => ({
      draftId: DRAFT_ID,
      kind: 'league',
      leagueId: LEAGUE_ID,
      sport: 'football',
      maxRosterSize: 25,
      isMock: false,
      rosterPositions: ['QB', 'RB'],
    })),
  }));

  // Real @legacy-sports/utils — this test genuinely exercises
  // ALLOWED_POSITIONS_BY_SPORT.football's DL/LB/DB entries (LS-9475).
  return import('./candidate-pool');
}

const DRAFT_ID = 1;
const LEAGUE_ID = 10;

/** Thenable + chainable stub matching drizzle's db.select(...).from(...).where(...)[.limit(...)] shape. */
function selectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

type FootballLeagueRow = {
  id: number;
  sport: 'football';
  draftStatus: string;
  gamesPerMatchup: number | null;
  pitcherStartsPerMatchup: number | null;
};

const footballLeague: FootballLeagueRow = {
  id: LEAGUE_ID,
  sport: 'football',
  draftStatus: 'in-progress',
  gamesPerMatchup: 1,
  pitcherStartsPerMatchup: 0,
};

/**
 * Builds a db stub for the full football fetchCandidatePool path:
 *   execute #1: deadline pre-check (drafts row)
 *   select  #1: league lookup
 *   execute #2: fetchUndraftedCandidates
 *   execute #3: computePlayerDraftInfo stats query
 *   select  #2: computePlayerDraftInfo positions query
 *   execute #4: computeBestBenchPick total-slots scalar
 *   execute #5: computeBestBenchPick league_positions rows (football branch)
 */
function makeFootballDb(opts: {
  undraftedRows: Array<{ id: number; fpg: number }>;
  statsRows: Array<{ player_id: number; projected_fpg: number }>;
  positionRows: Array<{ playerId: number; position: string }>;
  totalSlots: number;
  leaguePositionRows: Array<{ position_type: string }>;
}) {
  const executeCalls: unknown[] = [];
  let executeCall = 0;
  let selectCall = 0;

  const execute = jest.fn((query: unknown) => {
    executeCalls.push(query);
    executeCall += 1;
    switch (executeCall) {
      case 1:
        return Promise.resolve({
          rows: [
            {
              id: DRAFT_ID,
              league_id: LEAGUE_ID,
              // The pre-check reads drafts.status since LS-10074 — the
              // separate leagues.draft_status read it replaced is gone.
              status: 'in-progress',
              current_pick: 1,
              current_pick_deadline: new Date('2020-01-01T00:00:00Z'),
            },
          ],
        });
      case 2:
        return Promise.resolve({ rows: opts.undraftedRows });
      case 3:
        return Promise.resolve({ rows: opts.statsRows });
      case 4:
        return Promise.resolve({ rows: [{ total_slots: opts.totalSlots }] });
      case 5:
        return Promise.resolve({ rows: opts.leaguePositionRows });
      default:
        throw new Error(`Unexpected db.execute call #${executeCall}`);
    }
  });

  const select = jest.fn(() => {
    selectCall += 1;
    if (selectCall === 1) return selectChain([footballLeague]);
    if (selectCall === 2) return selectChain(opts.positionRows);
    throw new Error(`Unexpected db.select call #${selectCall}`);
  });

  return { db: { execute, select }, executeCalls };
}

describe('fetchCandidatePool — football (LS-9483, LS-9484)', () => {
  it('ranks candidates by real cached FPG, not always 0', async () => {
    const { fetchCandidatePool } = await loadCandidatePoolModule();
    const { db } = makeFootballDb({
      undraftedRows: [
        { id: 1, fpg: 22.5 },
        { id: 2, fpg: 16.1 },
      ],
      statsRows: [
        { player_id: 1, projected_fpg: 22.5 },
        { player_id: 2, projected_fpg: 16.1 },
      ],
      positionRows: [
        { playerId: 1, position: 'QB' },
        { playerId: 2, position: 'RB' },
      ],
      totalSlots: 9,
      leaguePositionRows: [{ position_type: 'QB' }, { position_type: 'RB' }],
    });

    const pool = await fetchCandidatePool(db as never, DRAFT_ID, LEAGUE_ID);

    expect(pool).not.toBeNull();
    expect(pool?.playerDraftInfo.get(1)?.fpg).toBe(22.5);
    expect(pool?.playerDraftInfo.get(2)?.fpg).toBe(16.1);
  });

  it('counts an IDP DL player against exactly its own DL slots, not 0 and not other slots', async () => {
    const { fetchCandidatePool } = await loadCandidatePoolModule();
    // Single candidate (DL-only) so bestBenchPick unambiguously reflects its
    // own slotsCoverable. League has 2 DL slots + 1 QB slot the player is
    // NOT eligible for — pre-fix this was always 0 (LS-9483: the baseline
    // slots-coverable query never matched any football row); the fix must
    // land on exactly 2, not 0 and not 3 (over-counting the QB slot too).
    const { db } = makeFootballDb({
      undraftedRows: [{ id: 1, fpg: 8 }],
      statsRows: [{ player_id: 1, projected_fpg: 8 }],
      positionRows: [{ playerId: 1, position: 'DL' }],
      totalSlots: 3,
      leaguePositionRows: [
        { position_type: 'QB' },
        { position_type: 'DL' },
        { position_type: 'DL' },
      ],
    });

    const pool = await fetchCandidatePool(db as never, DRAFT_ID, LEAGUE_ID);

    expect(pool?.bestBenchPick).toEqual({
      playerId: 1,
      fpg: 8,
      slotsCoverable: 2,
      totalSlots: 3,
    });
  });

  // LS-9483's literal acceptance criterion: bench ranking must not be a flat
  // tie across distinct football candidates. Pre-fix, EVERY football
  // candidate's benchScore was `0 * (1 + 0.15 * 0) === 0` — a flat tie
  // regardless of who the candidates were. With both bugs fixed, two
  // differently-scored, differently-versatile candidates must resolve to a
  // real, non-tied winner rather than an arbitrary Map-iteration-order pick.
  it('does not produce a flat tie across distinct football candidates', async () => {
    const { fetchCandidatePool } = await loadCandidatePoolModule();
    // Player 1: WR, fpg 13 — covers only the WR slot (benchScore 13 * 1.15 = 14.95).
    // Player 2: QB, fpg 24 — covers only the QB slot (benchScore 24 * 1.15 = 27.6).
    // Player 2 must win: distinctly, not by a degenerate 0-vs-0 coincidence.
    const { db } = makeFootballDb({
      undraftedRows: [
        { id: 1, fpg: 13 },
        { id: 2, fpg: 24 },
      ],
      statsRows: [
        { player_id: 1, projected_fpg: 13 },
        { player_id: 2, projected_fpg: 24 },
      ],
      positionRows: [
        { playerId: 1, position: 'WR' },
        { playerId: 2, position: 'QB' },
      ],
      totalSlots: 2,
      leaguePositionRows: [{ position_type: 'WR' }, { position_type: 'QB' }],
    });

    const pool = await fetchCandidatePool(db as never, DRAFT_ID, LEAGUE_ID);

    expect(pool?.bestBenchPick?.playerId).toBe(2);
    expect(pool?.bestBenchPick?.fpg).not.toBe(0);
  });
});

export {};
