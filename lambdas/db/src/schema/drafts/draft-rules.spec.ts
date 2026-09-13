/**
 * Unit tests for loadDraftRules — the league branch (LS-10074).
 *
 * Every rule the draft engine needs used to be read off `leagues` at each call
 * site. This loader is the single place those reads now live, so the values it
 * projects have to match the columns the old call sites read exactly — a
 * mis-mapped field here silently changes which players a draft can pick.
 *
 * `rosterPositions` (LS-10086, ticket comment 20931) is the addition: the
 * starter slot list `getUnfilledPositionTypes` and auto-pick's positional
 * awareness consume, so slice 4's mock drafts need no second code path.
 */

import type { PublicDb } from '@legacy-sports/db-client';

import { DraftNotFoundError, loadDraftRules } from './draft-rules';

const DRAFT_ID = 100;
const LEAGUE_ID = 7;

/** The joined draft + league row shape loadDraftRules selects. */
function joinedRow(overrides: Record<string, unknown> = {}) {
  return {
    draftId: DRAFT_ID,
    kind: 'league',
    leagueId: LEAGUE_ID,
    mockMode: null,
    controlAllTeams: false,
    league: {
      id: LEAGUE_ID,
      sport: 'baseball',
      playerPool: 'nl',
      maxRosterSize: 23,
      defensiveFormat: 'dst',
      baseballEraFilter: 'live_ball',
      customEraStartYear: 1920,
      customEraEndYear: 1960,
      baseballHofOnly: true,
      minCareerGames: 75,
      minCareerSeasons: 4,
      gamesPerMatchup: 6,
      pitcherStartsPerMatchup: 2,
      isMockDraft: false,
    },
    ...overrides,
  };
}

/**
 * drizzle-shaped stub. loadDraftRules issues exactly two queries: the joined
 * draft/league lookup, terminating in `.limit(1)`, then the league's roster
 * positions, terminating in `.orderBy(...)`.
 */
function makeDb(opts: {
  joined?: unknown[];
  positions?: Array<{ positionType: string }>;
}) {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.from = jest.fn(() => chain);
  chain.leftJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => Promise.resolve(opts.joined ?? []));
  chain.orderBy = jest.fn(() => Promise.resolve(opts.positions ?? []));
  return chain as unknown as PublicDb & {
    orderBy: jest.Mock;
    limit: jest.Mock;
  };
}

describe('loadDraftRules — league branch (LS-10074)', () => {
  it('projects every league setting the draft engine reads', async () => {
    const db = makeDb({ joined: [joinedRow()], positions: [] });

    const rules = await loadDraftRules(db, DRAFT_ID);

    // Field-for-field: each of these replaced a direct `leagues` read at a
    // call site, so a rename or a crossed wire has to fail here.
    expect(rules).toEqual({
      draftId: DRAFT_ID,
      kind: 'league',
      leagueId: LEAGUE_ID,
      sport: 'baseball',
      playerPool: 'nl',
      maxRosterSize: 23,
      defensiveFormat: 'dst',
      baseballEraFilter: 'live_ball',
      customEraStartYear: 1920,
      customEraEndYear: 1960,
      baseballHofOnly: true,
      minCareerGames: 75,
      minCareerSeasons: 4,
      gamesPerMatchup: 6,
      pitcherStartsPerMatchup: 2,
      isMock: false,
      mockMode: null,
      controlAllTeams: false,
      rosterPositions: [],
    });
  });

  it('carries the league roster slot list in league-defined order (LS-10086)', async () => {
    // Duplicates are meaningful: two OF rows mean two outfield slots, which is
    // what getUnfilledPositionTypes counts.
    const db = makeDb({
      joined: [joinedRow()],
      positions: [
        { positionType: 'C' },
        { positionType: 'OF' },
        { positionType: 'OF' },
        { positionType: 'SP' },
      ],
    });

    const rules = await loadDraftRules(db, DRAFT_ID);

    expect(rules.rosterPositions).toEqual(['C', 'OF', 'OF', 'SP']);
    // Ordered by league_positions.id so the slot list is stable across calls.
    expect(db.orderBy).toHaveBeenCalledTimes(1);
  });

  it('reports isMock from the league for a legacy mock-draft lobby (LS-9181)', async () => {
    const row = joinedRow();
    const db = makeDb({
      joined: [{ ...row, league: { ...row.league, isMockDraft: true } }],
    });

    const rules = await loadDraftRules(db, DRAFT_ID);

    // A legacy mock draft is still kind='league' — it just never persists
    // rosters. commitDraftPick keys its addPlayerToRoster skip off this.
    expect(rules.kind).toBe('league');
    expect(rules.isMock).toBe(true);
  });

  it('passes a football league its defensive format through unchanged', async () => {
    const row = joinedRow();
    const db = makeDb({
      joined: [
        {
          ...row,
          league: { ...row.league, sport: 'football', defensiveFormat: 'idp' },
        },
      ],
      positions: [{ positionType: 'QB' }, { positionType: 'DL' }],
    });

    const rules = await loadDraftRules(db, DRAFT_ID);

    expect(rules.sport).toBe('football');
    expect(rules.defensiveFormat).toBe('idp');
    expect(rules.rosterPositions).toEqual(['QB', 'DL']);
  });

  it('throws DraftNotFoundError when the draft does not exist', async () => {
    const db = makeDb({ joined: [] });

    await expect(loadDraftRules(db, DRAFT_ID)).rejects.toBeInstanceOf(
      DraftNotFoundError,
    );
    // The roster-position query is never reached.
    expect(db.orderBy).not.toHaveBeenCalled();
  });

  it('refuses a kind="mock" draft until the slice-4 branch lands', async () => {
    const db = makeDb({
      joined: [{ ...joinedRow(), kind: 'mock', leagueId: null, league: null }],
    });

    await expect(loadDraftRules(db, DRAFT_ID)).rejects.toThrow('LS-10076');
  });

  it('treats a league draft with no league row as a data-integrity failure', async () => {
    // drafts_kind_league_ck (LS-10073) makes this unreachable in the database;
    // failing loudly beats projecting undefined settings onto a live draft.
    const db = makeDb({ joined: [{ ...joinedRow(), league: null }] });

    await expect(loadDraftRules(db, DRAFT_ID)).rejects.toThrow(
      'has no league row',
    );
  });
});
