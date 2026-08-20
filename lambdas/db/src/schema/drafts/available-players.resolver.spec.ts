/**
 * Resolver-level tests for getAvailableDraftPlayers position-requirement
 * filtering (LS-8065).
 *
 * Bug: during the draft the board showed players who don't meet any still-open
 * roster requirement for the caller's team (e.g. hitters when only a pitcher
 * slot remained), so they appeared pickable. Auto-pick already refuses such
 * players via getUnfilledPositionTypes; these tests assert the board query now
 * mirrors that constraint.
 *
 * Strategy: capture the real resolver with real drizzle (so `sql` composition
 * runs), stub the DB, and serialize the query handed to `db.execute` with
 * PgDialect to inspect whether the player_eligible_positions predicate is
 * present and which positions it binds.
 */

import { PgDialect } from 'drizzle-orm/pg-core';

const getUnfilledPositionTypes = jest.fn();
const eligibleStatPositionsForUnfilledSlots = jest.fn();
const verifyLeagueMembership = jest.fn();
// No extra league-static predicates so the only player_eligible_positions
// reference in the query can come from the LS-8065 positional filter. Held at
// module scope so tests can assert the settings the resolver passes through.
const buildEligibilityConditions = jest.fn(() => [] as unknown[]);

async function captureResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  jest.resetModules();
  const captured: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  jest.doMock('../builder', () => ({
    builder: {
      queryField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: {
            resolve: (...args: unknown[]) => Promise<unknown>;
          }) => {
            captured[name] = opts.resolve;
          },
          // Proxy returns a no-op arg builder for any arg kind
          // (int/string/boolean/intList/...), so every queryField in the
          // module registers cleanly during import.
          arg: new Proxy({}, { get: () => () => ({}) }),
        });
      }),
      mutationField: jest.fn(),
    },
  }));

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
      drafts: { id: 'drafts.id', leagueId: 'drafts.league_id' },
      leagues: {
        id: 'leagues.id',
        sport: 'leagues.sport',
        playerPool: 'leagues.player_pool',
        minCareerGames: 'leagues.min_career_games',
        minCareerSeasons: 'leagues.min_career_seasons',
        gamesPerMatchup: 'leagues.games_per_matchup',
        pitcherStartsPerMatchup: 'leagues.pitcher_starts_per_matchup',
        baseballHofOnly: 'leagues.baseball_hof_only',
        baseballEraFilter: 'leagues.baseball_era_filter',
        customEraStartYear: 'leagues.custom_era_start_year',
        customEraEndYear: 'leagues.custom_era_end_year',
      },
    },
    buildEligibilityConditions,
  }));

  jest.doMock('./helpers', () => ({
    countRecentMockDrafts: jest.fn(),
    getCurrentDraftPickInfo: jest.fn(),
    getUnfilledPositionTypes,
    eligibleStatPositionsForUnfilledSlots,
    MOCK_DRAFT_FREE_WEEKLY_LIMIT: 2,
  }));

  jest.doMock('./types', () => ({
    CurrentDraftPick: {},
    Draft: {},
    DraftPick: {},
    DraftPlayer: {},
    DraftQueueEntry: {},
    DraftRecommendation: {},
    DraftTeamAutoPickStatus: {},
    DraftTeamOrderEntry: {},
    MockDraftUsage: {},
  }));

  jest.doMock('../authorization', () => ({
    hasEntitlement: jest.fn(),
    isCommissionerOrOwner: jest.fn(),
    requireEntitlement: jest.fn(),
    verifyLeagueMembership,
  }));

  jest.doMock('../entitlements', () => ({
    ENTITLEMENTS: {
      unlimited_mock_drafts: 'unlimited_mock_drafts',
      draft_recommendations: 'draft_recommendations',
    },
  }));

  jest.doMock('../graphql-errors', () => ({
    AuthenticationError: jest.fn((msg?: string) => new Error(msg ?? 'Unauth')),
    ForbiddenError: jest.fn((msg?: string) => new Error(msg ?? 'Forbidden')),
    UserInputError: jest.fn((msg?: string) => new Error(msg ?? 'UserInput')),
  }));

  await import('./queries');
  const resolve = captured.getAvailableDraftPlayers;
  if (!resolve)
    throw new Error('getAvailableDraftPlayers resolver was not captured');
  return resolve;
}

const LEAGUE_ROW = {
  id: 7,
  sport: 'baseball',
  playerPool: 'all',
  minCareerGames: 50,
  minCareerSeasons: 3,
  gamesPerMatchup: 5,
  pitcherStartsPerMatchup: 1,
  baseballHofOnly: false,
  baseballEraFilter: null,
  customEraStartYear: null,
  customEraEndYear: null,
};

/**
 * Chainable DB stub. The two `.limit(1)` lookups resolve to the draft row then
 * the league row; `.execute` records the SQL it receives and returns no rows.
 */
function makeDb(league: Record<string, unknown> = LEAGUE_ROW) {
  const executed: unknown[] = [];
  let limitCall = 0;
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => {
    limitCall += 1;
    return Promise.resolve(limitCall === 1 ? [{ leagueId: 7 }] : [league]);
  });
  chain.execute = jest.fn((q: unknown) => {
    executed.push(q);
    return Promise.resolve({ rows: [] });
  });
  chain._executed = executed;
  return chain as typeof chain & { _executed: unknown[] };
}

function serializeExecutedQuery(db: { _executed: unknown[] }) {
  expect(db._executed).toHaveLength(1);
  return new PgDialect().sqlToQuery(
    db._executed[0] as Parameters<PgDialect['sqlToQuery']>[0],
  );
}

describe('getAvailableDraftPlayers — position-requirement filter (LS-8065)', () => {
  beforeEach(() => {
    getUnfilledPositionTypes.mockReset();
    eligibleStatPositionsForUnfilledSlots.mockReset();
    verifyLeagueMembership.mockReset();
    buildEligibilityConditions.mockClear();
  });

  it('restricts the board to players eligible for an unfilled slot', async () => {
    const resolve = await captureResolver();
    verifyLeagueMembership.mockResolvedValue({ teamId: 11 });
    getUnfilledPositionTypes.mockResolvedValue(['SP']);
    eligibleStatPositionsForUnfilledSlots.mockReturnValue(['SP', 'P']);
    const db = makeDb();

    await resolve({}, { draftId: 100 }, { user: { id: 7 }, db });

    // Unfilled positions are computed for the caller's own team.
    expect(getUnfilledPositionTypes).toHaveBeenCalledWith(db, 100, 11, 7);
    expect(eligibleStatPositionsForUnfilledSlots).toHaveBeenCalledWith(['SP']);

    const { sql: text, params } = serializeExecutedQuery(db);
    expect(text).toContain('player_eligible_positions');
    expect(params).toEqual(expect.arrayContaining(['SP', 'P']));
  });

  it('does not filter when the caller has no team (spectator/commissioner)', async () => {
    const resolve = await captureResolver();
    verifyLeagueMembership.mockResolvedValue({ teamId: null });
    const db = makeDb();

    await resolve({}, { draftId: 100 }, { user: { id: 7 }, db });

    // No team ⇒ never compute requirements, never add the predicate.
    expect(getUnfilledPositionTypes).not.toHaveBeenCalled();
    const { sql: text } = serializeExecutedQuery(db);
    expect(text).not.toContain('player_eligible_positions');
  });

  it('excludes players already rostered in the league (LS-8674 kept players)', async () => {
    const resolve = await captureResolver();
    verifyLeagueMembership.mockResolvedValue({ teamId: 11 });
    getUnfilledPositionTypes.mockResolvedValue([]);
    eligibleStatPositionsForUnfilledSlots.mockReturnValue([]);
    const db = makeDb();

    await resolve({}, { draftId: 100 }, { user: { id: 7 }, db });

    const { sql: text, params } = serializeExecutedQuery(db);
    expect(text).toContain('team_members');
    expect(params).toEqual(expect.arrayContaining([7])); // draft.leagueId
  });

  it('does not filter when every roster requirement is already met', async () => {
    const resolve = await captureResolver();
    verifyLeagueMembership.mockResolvedValue({ teamId: 11 });
    // Roster full / no league position requirements ⇒ empty list ⇒ no predicate.
    getUnfilledPositionTypes.mockResolvedValue([]);
    eligibleStatPositionsForUnfilledSlots.mockReturnValue([]);
    const db = makeDb();

    await resolve({}, { draftId: 100 }, { user: { id: 7 }, db });

    expect(getUnfilledPositionTypes).toHaveBeenCalledWith(db, 100, 11, 7);
    const { sql: text } = serializeExecutedQuery(db);
    expect(text).not.toContain('player_eligible_positions');
  });
});

/**
 * LS-9470 — mock football drafts. `players` is one multi-sport table, and a
 * football league with playerPool='all' contributes no eligibility predicate
 * of its own, so the board query itself has to scope the pool to the league's
 * sport or a football draft lists every MLB player as draftable.
 */
describe('getAvailableDraftPlayers — sport-scoped player pool (LS-9470)', () => {
  const FOOTBALL_LEAGUE = { ...LEAGUE_ROW, sport: 'football' };

  beforeEach(() => {
    getUnfilledPositionTypes.mockReset();
    eligibleStatPositionsForUnfilledSlots.mockReset();
    verifyLeagueMembership.mockReset();
    buildEligibilityConditions.mockClear();
    verifyLeagueMembership.mockResolvedValue({ teamId: null });
  });

  it('restricts a baseball league to baseball players', async () => {
    const resolve = await captureResolver();
    const db = makeDb();

    await resolve({}, { draftId: 100 }, { user: { id: 7 }, db });

    const { sql: text, params } = serializeExecutedQuery(db);
    expect(text).toContain('p.sport =');
    expect(params).toEqual(expect.arrayContaining(['baseball']));
  });

  it('restricts a football league to football players', async () => {
    const resolve = await captureResolver();
    const db = makeDb(FOOTBALL_LEAGUE);

    await resolve({}, { draftId: 100 }, { user: { id: 7 }, db });

    const { sql: text, params } = serializeExecutedQuery(db);
    expect(text).toContain('p.sport =');
    expect(params).toEqual(expect.arrayContaining(['football']));
    expect(params).not.toEqual(expect.arrayContaining(['baseball']));
  });

  it('forwards the football conference pool to the eligibility builder', async () => {
    const resolve = await captureResolver();
    const db = makeDb({ ...FOOTBALL_LEAGUE, playerPool: 'afc' });

    await resolve({}, { draftId: 100 }, { user: { id: 7 }, db });

    expect(buildEligibilityConditions).toHaveBeenCalledWith(
      expect.objectContaining({ sport: 'football', playerPool: 'afc' }),
    );
  });

  // LS-9474: football positions live in their own relation. The baseball table
  // holds zero football rows, so filtering a football board against it returned
  // an empty board for every pill. Note `football_player_eligible_positions`
  // contains the baseball table's name as a substring — asserting
  // `toContain('player_eligible_positions')` passes for BOTH tables and is
  // exactly the kind of check that let the original defect ship green. These
  // assertions pin the exact relation instead.
  it('filters a football board against football_player_eligible_positions', async () => {
    const resolve = await captureResolver();
    const db = makeDb(FOOTBALL_LEAGUE);

    await resolve(
      {},
      { draftId: 100, position: 'QB' },
      { user: { id: 7 }, db },
    );

    const { sql: text, params } = serializeExecutedQuery(db);
    expect(text).toContain('football_player_eligible_positions');
    expect(text).not.toMatch(/(?<!football_)player_eligible_positions/);
    expect(params).toEqual(expect.arrayContaining(['QB']));
  });

  it('filters a baseball board against player_eligible_positions only', async () => {
    const resolve = await captureResolver();
    const db = makeDb();

    await resolve({}, { draftId: 100, position: 'P' }, { user: { id: 7 }, db });

    const { sql: text, params } = serializeExecutedQuery(db);
    expect(text).toContain('player_eligible_positions');
    expect(text).not.toContain('football_player_eligible_positions');
    expect(params).toEqual(expect.arrayContaining(['SP', 'RP']));
  });

  it('expands the football DEF pill to both team-defense labels', async () => {
    const resolve = await captureResolver();
    const db = makeDb(FOOTBALL_LEAGUE);

    await resolve(
      {},
      { draftId: 100, position: 'DEF' },
      { user: { id: 7 }, db },
    );

    const { sql: text, params } = serializeExecutedQuery(db);
    expect(text).toContain('football_player_eligible_positions');
    expect(params).toEqual(expect.arrayContaining(['DEF', 'DST']));
    // NOTE: no DEF/DST rows exist in the data today — the ingested football
    // positions are DB/LB/DL (IDP), not team defenses. This asserts the
    // expansion is wired to the right relation, not that it returns players.
    // LS-9475 owns making the vocabulary match the league's defensiveFormat.
  });

  it('sorts a football board alphabetically — the scoring cache is baseball-only', async () => {
    const resolve = await captureResolver();
    const db = makeDb(FOOTBALL_LEAGUE);

    await resolve(
      {},
      { draftId: 100, orderBy: 'projectedMatchupPoints' },
      { user: { id: 7 }, db },
    );

    const { sql: text } = serializeExecutedQuery(db);
    expect(text).toContain('p.last_name');
    expect(text).not.toContain('player_scoring_cache');
  });
});
