/**
 * Resolver-level tests for getDraftFootballPlayerStats (LS-9478).
 *
 * Football analogue of GetDraftPlayerStats — LEFT JOINs the four
 * career_football_* tables so the draft board can serve real PASS YDS /
 * RUSH YDS / REC / TD / FG values instead of em-dashes.
 *
 * Uses the REAL PublicSchema (via jest.requireActual) rather than a
 * plain-string mock: the resolver builds join/where conditions with
 * drizzle-orm's `eq`/`and`/`or`/`isNotNull`, which need real Column objects
 * to serialize meaningfully. Assertions below compare table/column *names*
 * (via drizzle-orm's getTableName + Column.name), not substrings of
 * rendered SQL text — the LS-9474 postmortem is exactly this class of bug:
 * `toContain('player_eligible_positions')` also passes for
 * `football_player_eligible_positions` since one name is a substring of the
 * other. Comparing exact names sidesteps that trap.
 */

import { getTableName, type Table } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

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

  // Real PublicSchema (real drizzle Column objects) — required for eq/and/
  // or/isNotNull to build serializable SQL. Everything else from db-client
  // stays real too; nothing else in this module is invoked by this resolver.
  jest.doMock('@legacy-sports/db-client', () => mockDbClientModule());

  jest.doMock('./helpers', () => ({
    countRecentMockDrafts: jest.fn(),
    getCurrentDraftPickInfo: jest.fn(),
    getUnfilledPositionTypes: jest.fn(),
    eligibleStatPositionsForUnfilledSlots: jest.fn(),
    MOCK_DRAFT_FREE_WEEKLY_LIMIT: 2,
  }));

  jest.doMock('./types', () => ({
    CurrentDraftPick: {},
    Draft: {},
    DraftFootballPlayerStats: {},
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
    verifyLeagueMembership: jest.fn(),
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
  const resolve = captured.getDraftFootballPlayerStats;
  if (!resolve)
    throw new Error('getDraftFootballPlayerStats resolver was not captured');
  return resolve;
}

/** A drizzle Column-shaped value: has a physical `.name` and belongs to a `.table`. */
type ColumnLike = { name: string; table: Table };

function columnPath(col: unknown): string {
  const c = col as ColumnLike;
  return `${getTableName(c.table)}.${c.name}`;
}

/**
 * Chainable DB stub for `select().from().leftJoin() x4.where()`. Records
 * every call's arguments (real Column/Table objects, since PublicSchema is
 * real) so tests can assert on table/column names.
 */
function makeDb(rows: unknown[] = []) {
  const calls: {
    select?: unknown;
    from?: unknown;
    leftJoins: Array<[unknown, unknown]>;
    where?: unknown;
  } = { leftJoins: [] };
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn((cols: unknown) => {
    calls.select = cols;
    return chain;
  });
  chain.from = jest.fn((table: unknown) => {
    calls.from = table;
    return chain;
  });
  chain.leftJoin = jest.fn((table: unknown, cond: unknown) => {
    calls.leftJoins.push([table, cond]);
    return chain;
  });
  chain.where = jest.fn((cond: unknown) => {
    calls.where = cond;
    return Promise.resolve(rows);
  });
  // innerJoin must never be called by this resolver — players with no
  // football stat row must not be silently excluded before the WHERE
  // isNotNull filter runs.
  chain.innerJoin = jest.fn(() => chain);
  return { db: chain, calls };
}

function renderCondition(cond: unknown) {
  return new PgDialect().sqlToQuery(
    cond as Parameters<PgDialect['sqlToQuery']>[0],
  );
}

describe('getDraftFootballPlayerStats (LS-9478)', () => {
  it('requires authentication', async () => {
    const resolve = await captureResolver();
    const { db } = makeDb();
    await expect(resolve({}, {}, { user: null, db })).rejects.toThrow();
  });

  it('selects from players and LEFT JOINs exactly the four career_football_* tables — never innerJoin, never the baseball career tables', async () => {
    const resolve = await captureResolver();
    const { db, calls } = makeDb([]);

    await resolve({}, {}, { user: { id: 7 }, db });

    expect(getTableName(calls.from as never)).toBe('players');
    expect(db.innerJoin).not.toHaveBeenCalled();

    const joinedTableNames = calls.leftJoins.map(([table]) =>
      getTableName(table as never),
    );
    expect(joinedTableNames).toEqual([
      'career_football_passing',
      'career_football_rushing',
      'career_football_receiving',
      'career_football_kicking',
    ]);
    // Exclusive assertion: the baseball career tables must never be
    // referenced by this resolver at all — not "does the string somewhere
    // mention football", but "the join list is exactly these four".
    expect(joinedTableNames).not.toContain('career_batting');
    expect(joinedTableNames).not.toContain('career_pitching');
  });

  it('joins every table on players.id, not some other column', async () => {
    const resolve = await captureResolver();
    const { db, calls } = makeDb([]);

    await resolve({}, {}, { user: { id: 7 }, db });

    for (const [, cond] of calls.leftJoins) {
      const { sql: text } = renderCondition(cond);
      expect(text).toContain('"players"."id"');
    }
  });

  it('filters to football players via players.sport, bound to the literal "football"', async () => {
    const resolve = await captureResolver();
    const { db, calls } = makeDb([]);

    await resolve({}, {}, { user: { id: 7 }, db });

    const { sql: text, params } = renderCondition(calls.where);
    expect(text).toContain('"players"."sport"');
    expect(params).toContain('football');
    // Exclusive: must never bind 'baseball' — a copy-paste of the
    // leagueSport pattern from getAvailableDraftPlayers would default to
    // 'baseball' and silently return nothing for every football league.
    expect(params).not.toContain('baseball');
  });

  it('requires at least one of the four career rows to be present (excludes players with none)', async () => {
    const resolve = await captureResolver();
    const { db, calls } = makeDb([]);

    await resolve({}, {}, { user: { id: 7 }, db });

    const { sql: text } = renderCondition(calls.where);
    expect(text).toContain('career_football_passing');
    expect(text).toContain('career_football_rushing');
    expect(text).toContain('career_football_receiving');
    expect(text).toContain('career_football_kicking');
    expect(text).toMatch(/is not null/i);
  });

  it('maps each output field to the exact source column per the LS-9478 field mapping', async () => {
    const resolve = await captureResolver();
    const { db, calls } = makeDb([]);

    await resolve({}, {}, { user: { id: 7 }, db });

    const select = calls.select as Record<string, unknown>;
    expect(columnPath(select.passYds)).toBe('career_football_passing.yds');
    expect(columnPath(select.passTd)).toBe('career_football_passing.td');
    expect(columnPath(select.rushYds)).toBe('career_football_rushing.yds');
    expect(columnPath(select.rushTd)).toBe('career_football_rushing.td');
    expect(columnPath(select.rec)).toBe('career_football_receiving.rec');
    expect(columnPath(select.recTd)).toBe('career_football_receiving.td');
    expect(columnPath(select.fg)).toBe('career_football_kicking.fgm');
  });

  it('returns the rows the DB layer produces, unmodified', async () => {
    const resolve = await captureResolver();
    const rows = [
      {
        playerId: 1,
        passYds: 4300,
        passTd: 32,
        rushYds: null,
        rushTd: null,
        rec: null,
        recTd: null,
        fg: null,
      },
    ];
    const { db } = makeDb(rows);

    const result = await resolve({}, {}, { user: { id: 7 }, db });

    expect(result).toBe(rows);
  });
});
