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
    // No extra league-static predicates so the only player_eligible_positions
    // reference in the query can come from the LS-8065 positional filter.
    buildEligibilityConditions: jest.fn(() => []),
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
function makeDb() {
  const executed: unknown[] = [];
  let limitCall = 0;
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn(() => chain);
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.limit = jest.fn(() => {
    limitCall += 1;
    return Promise.resolve(limitCall === 1 ? [{ leagueId: 7 }] : [LEAGUE_ROW]);
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
