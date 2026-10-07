/**
 * Unit tests for the global favorite-players resolvers (LS-10861).
 *
 * Covers: auth is required, the user id comes only from the auth context
 * (no cross-user reads or writes), add/remove are idempotent, and the
 * optional sport filter.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type Resolver = (...args: unknown[]) => Promise<unknown>;

const ME = 7;
const CREATED_AT = new Date('2026-10-06T12:00:00Z');

function captureResolvers(): Record<string, Resolver> {
  jest.resetModules();
  const captured: Record<string, Resolver> = {};

  const fieldBuilder = (name: string) => {
    const capture = (opts: { resolve: Resolver }) => {
      captured[name] = opts.resolve;
    };
    const arg = Object.assign(() => ({}), { int: () => ({}) });
    return { field: capture, boolean: capture, arg };
  };

  jest.doMock('./builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({ implement: jest.fn() })),
      queryField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn(fieldBuilder(name));
      }),
      mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn(fieldBuilder(name));
      }),
    },
  }));

  // Cut the leagues/types → schema-wide import chain.
  jest.doMock('./leagues/types', () => ({ SportKindEnum: {} }));

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      PublicSchema: {
        userFavoritePlayers: {
          id: 'ufp.id',
          userId: 'ufp.userId',
          playerId: 'ufp.playerId',
          sport: 'ufp.sport',
          createdAt: 'ufp.createdAt',
        },
        players: { id: 'players.id', sport: 'players.sport' },
      },
    }),
  );

  jest.doMock('drizzle-orm', () =>
    mockDrizzleOrm({
      eq: jest.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
      and: jest.fn((...conds: unknown[]) => ({ and: conds })),
      desc: jest.fn((col: unknown) => ({ desc: col })),
    }),
  );

  require('./favorite-players');
  return captured;
}

/**
 * A minimal chainable Drizzle stand-in. Each select resolves the next entry
 * of `selectResults`; every where() condition is recorded so tests can assert
 * the caller's user id scopes the statement.
 */
function makeDb({
  selectResults = [],
  insertResult = [],
}: {
  selectResults?: unknown[][];
  insertResult?: unknown[];
} = {}) {
  const whereCalls: unknown[] = [];
  const insertValues: unknown[] = [];
  const deleteWhere: unknown[] = [];
  const results = [...selectResults];

  const select = jest.fn(() => ({
    from: jest.fn(() => ({
      where: jest.fn((cond: unknown) => {
        whereCalls.push(cond);
        const rows = results.shift() ?? [];
        return {
          limit: jest.fn(async () => rows),
          orderBy: jest.fn(async () => rows),
        };
      }),
    })),
  }));

  const insert = jest.fn(() => ({
    values: jest.fn((v: unknown) => {
      insertValues.push(v);
      return {
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(async () => insertResult),
        })),
      };
    }),
  }));

  const del = jest.fn(() => ({
    where: jest.fn(async (cond: unknown) => {
      deleteWhere.push(cond);
    }),
  }));

  return {
    db: { select, insert, delete: del },
    whereCalls,
    insertValues,
    deleteWhere,
  };
}

const favorite = (playerId: number, sport = 'baseball') => ({
  playerId,
  sport,
  createdAt: CREATED_AT,
});

describe('favorite players resolvers (LS-10861)', () => {
  let resolvers: Record<string, Resolver>;

  beforeEach(() => {
    resolvers = captureResolvers();
  });

  describe.each([
    ['myFavoritePlayers', {}],
    ['addFavoritePlayer', { playerId: 1 }],
    ['removeFavoritePlayer', { playerId: 1 }],
  ])('%s', (name, args) => {
    it('rejects unauthenticated callers without touching the db', async () => {
      const { db } = makeDb();
      await expect(
        resolvers[name](null, args, { user: null, db }),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('myFavoritePlayers', () => {
    it("returns only the caller's favorites", async () => {
      const rows = [favorite(11), favorite(12)];
      const { db, whereCalls } = makeDb({ selectResults: [rows] });

      const result = await resolvers.myFavoritePlayers(
        null,
        {},
        { user: { id: ME }, db },
      );

      expect(result).toEqual(rows);
      expect(whereCalls).toEqual([{ eq: ['ufp.userId', ME] }]);
    });

    it('adds the sport filter when a sport is passed', async () => {
      const { db, whereCalls } = makeDb({
        selectResults: [[favorite(21, 'football')]],
      });

      await resolvers.myFavoritePlayers(
        null,
        { sport: 'football' },
        { user: { id: ME }, db },
      );

      expect(whereCalls).toEqual([
        {
          and: [{ eq: ['ufp.userId', ME] }, { eq: ['ufp.sport', 'football'] }],
        },
      ]);
    });
  });

  describe('addFavoritePlayer', () => {
    it("inserts a favorite for the caller with the player's sport", async () => {
      const { db, insertValues } = makeDb({
        selectResults: [[{ sport: 'football' }]],
        insertResult: [favorite(42, 'football')],
      });

      const result = await resolvers.addFavoritePlayer(
        null,
        { playerId: 42 },
        { user: { id: ME }, db },
      );

      expect(result).toEqual(favorite(42, 'football'));
      expect(insertValues).toEqual([
        { userId: ME, playerId: 42, sport: 'football' },
      ]);
    });

    it('is idempotent: an existing favorite is returned, not an error', async () => {
      const { db, whereCalls } = makeDb({
        selectResults: [[{ sport: 'baseball' }], [favorite(42)]],
        insertResult: [], // ON CONFLICT DO NOTHING inserted nothing
      });

      const result = await resolvers.addFavoritePlayer(
        null,
        { playerId: 42 },
        { user: { id: ME }, db },
      );

      expect(result).toEqual(favorite(42));
      // The fallback read is scoped to the caller, not just the player.
      expect(whereCalls[1]).toEqual({
        and: [{ eq: ['ufp.userId', ME] }, { eq: ['ufp.playerId', 42] }],
      });
    });

    it('rejects an unknown player', async () => {
      const { db } = makeDb({ selectResults: [[]] });

      await expect(
        resolvers.addFavoritePlayer(
          null,
          { playerId: 999 },
          { user: { id: ME }, db },
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('removeFavoritePlayer', () => {
    it("deletes only the caller's row and is idempotent", async () => {
      const { db, deleteWhere } = makeDb();

      await expect(
        resolvers.removeFavoritePlayer(
          null,
          { playerId: 42 },
          { user: { id: ME }, db },
        ),
      ).resolves.toBe(true);
      // Removing again (nothing to delete) still succeeds.
      await expect(
        resolvers.removeFavoritePlayer(
          null,
          { playerId: 42 },
          { user: { id: ME }, db },
        ),
      ).resolves.toBe(true);

      expect(deleteWhere).toEqual([
        { and: [{ eq: ['ufp.userId', ME] }, { eq: ['ufp.playerId', 42] }] },
        { and: [{ eq: ['ufp.userId', ME] }, { eq: ['ufp.playerId', 42] }] },
      ]);
    });
  });
});

export {};
