/**
 * Unit tests for loadDraftRules — the league branch (LS-10074) and the mock
 * branch (LS-10076).
 *
 * Every rule the draft engine needs used to be read off `leagues` at each call
 * site. This loader is the single place those reads now live, so the values it
 * projects have to match the columns the old call sites read exactly — a
 * mis-mapped field here silently changes which players a draft can pick.
 *
 * `rosterPositions` (LS-10086, ticket comment 20931) is the addition: the
 * starter slot list `getUnfilledPositionTypes` and auto-pick's positional
 * awareness consume, so the mock branch needs no second code path — it derives
 * the same list from the sport defaults instead of `league_positions`.
 */

import type { PublicDb } from '@legacy-sports/db-client';
import {
  GAMES_PER_MATCHUP_BY_SPORT,
  getDefaultRosterPositions,
} from '@legacy-sports/utils';

import { DraftNotFoundError, loadDraftRules } from './draft-rules';

const DRAFT_ID = 100;
const LEAGUE_ID = 7;

/** The joined draft + league + mock_draft_settings row loadDraftRules selects. */
function joinedRow(overrides: Record<string, unknown> = {}) {
  return {
    draftId: DRAFT_ID,
    kind: 'league',
    sport: 'baseball',
    leagueId: LEAGUE_ID,
    mockMode: null,
    controlAllTeams: false,
    mock: null,
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

  it('treats a league draft with no league row as a data-integrity failure', async () => {
    // drafts_kind_league_ck (LS-10073) makes this unreachable in the database;
    // failing loudly beats projecting undefined settings onto a live draft.
    const db = makeDb({ joined: [{ ...joinedRow(), league: null }] });

    await expect(loadDraftRules(db, DRAFT_ID)).rejects.toThrow(
      'has no league row',
    );
  });
});

describe('loadDraftRules — mock branch (LS-10076)', () => {
  /** The same joined row for a league-less mock draft. */
  function mockRow(overrides: { mock?: Record<string, unknown> | null } = {}) {
    return {
      ...joinedRow(),
      kind: 'mock',
      leagueId: null,
      league: null,
      mockMode: 'solo',
      mock:
        overrides.mock === undefined
          ? {
              draftId: DRAFT_ID,
              playerPool: 'al',
              rosterSize: 20,
              defensiveFormat: 'dst',
              eraFilter: 'modern',
              hofOnly: false,
              customEraStartYear: null,
              customEraEndYear: null,
              minCareerGames: 10,
              minCareerSeasons: 1,
            }
          : overrides.mock,
    };
  }

  it('projects mock_draft_settings onto the same rule contract', async () => {
    const db = makeDb({ joined: [mockRow()] });

    const rules = await loadDraftRules(db, DRAFT_ID);

    expect(rules).toEqual({
      draftId: DRAFT_ID,
      kind: 'mock',
      // No league to belong to — every league-keyed write keys off this null.
      leagueId: null,
      // The sport comes off the draft row itself, not a league.
      sport: 'baseball',
      playerPool: 'al',
      maxRosterSize: 20,
      defensiveFormat: 'dst',
      baseballEraFilter: 'modern',
      customEraStartYear: null,
      customEraEndYear: null,
      baseballHofOnly: false,
      minCareerGames: 10,
      minCareerSeasons: 1,
      // A mock draft never plays a matchup; these only scale the projected
      // per-matchup value the board ranks by, so they take a new league's
      // defaults.
      gamesPerMatchup: GAMES_PER_MATCHUP_BY_SPORT.baseball.default,
      pitcherStartsPerMatchup: 1,
      isMock: true,
      mockMode: 'solo',
      controlAllTeams: false,
      rosterPositions: [...getDefaultRosterPositions('baseball', 'dst')],
    });
  });

  it('derives rosterPositions from the sport defaults, not league_positions', async () => {
    // league_positions is league-scoped, so the second query the league branch
    // issues must not be issued at all here (LS-10086).
    const db = makeDb({ joined: [mockRow()] });

    const rules = await loadDraftRules(db, DRAFT_ID);

    expect(rules.rosterPositions.length).toBeGreaterThan(0);
    expect(db.orderBy).not.toHaveBeenCalled();
  });

  it('honours the defensive format when deriving a football roster', async () => {
    const db = makeDb({
      joined: [
        {
          ...mockRow({
            mock: {
              draftId: DRAFT_ID,
              playerPool: 'all',
              rosterSize: 16,
              defensiveFormat: 'idp',
              eraFilter: 'all',
              hofOnly: false,
              customEraStartYear: null,
              customEraEndYear: null,
              minCareerGames: 0,
              minCareerSeasons: 0,
            },
          }),
          sport: 'football',
        },
      ],
    });

    const rules = await loadDraftRules(db, DRAFT_ID);

    expect(rules.sport).toBe('football');
    expect(rules.rosterPositions).toEqual([
      ...getDefaultRosterPositions('football', 'idp'),
    ]);
  });

  it('treats a mock draft with no settings row as a data-integrity failure', async () => {
    // Every mock draft is created with its settings row in the same
    // transaction, so a missing one is corruption rather than client input.
    const db = makeDb({ joined: [mockRow({ mock: null })] });

    await expect(loadDraftRules(db, DRAFT_ID)).rejects.toThrow(
      'has no mock_draft_settings row',
    );
  });
});
