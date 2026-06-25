import type { DbOptions } from '@legacy-sports/utils/node';
import { UserPreferencesService } from './UserPreferencesService';

jest.mock('../client/Helpers', () => ({
  runWithPublicClient: jest.fn(),
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

describe('UserPreferencesService', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: UserPreferencesService;

  // Chainable select builder: db.select().from().where().limit() resolves to `rows`.
  function makeSelect(rows: unknown[]): {
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  } {
    const chain = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn(() => Promise.resolve(rows)),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  }

  // Chainable update builder: db.update().set().where().returning() resolves to `rows`.
  function makeUpdate(rows: unknown[]): {
    set: jest.Mock;
    where: jest.Mock;
    returning: jest.Mock;
  } {
    const chain = {
      set: jest.fn(),
      where: jest.fn(),
      returning: jest.fn(() => Promise.resolve(rows)),
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  }

  // Chainable insert builder: db.insert().values().returning() resolves to `rows`.
  function makeInsert(rows: unknown[]): {
    values: jest.Mock;
    returning: jest.Mock;
  } {
    const chain = {
      values: jest.fn(),
      returning: jest.fn(() => Promise.resolve(rows)),
    };
    chain.values.mockReturnValue(chain);
    return chain;
  }

  const NOW = new Date('2026-06-20T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserPreferencesService(options);
  });

  function runWith(db: unknown) {
    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      handler(db as never),
    );
  }

  describe('getUserPreferences', () => {
    it('returns null when no row exists', async () => {
      runWith({ select: jest.fn(() => makeSelect([])) });
      const result = await service.getUserPreferences(10);
      expect(result).toBeNull();
    });

    it('maps and normalizes a found row', async () => {
      runWith({
        select: jest.fn(() =>
          makeSelect([
            {
              id: 1,
              userId: 10,
              statsFormat: 'expanded',
              createdAt: NOW,
              updatedAt: NOW,
            },
          ]),
        ),
      });
      const result = await service.getUserPreferences(10);
      expect(result).toEqual({
        id: 1,
        userId: 10,
        statsFormat: 'expanded',
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it('normalizes an unexpected stats_format value to standard', async () => {
      runWith({
        select: jest.fn(() =>
          makeSelect([
            {
              id: 1,
              userId: 10,
              statsFormat: 'garbage',
              createdAt: NOW,
              updatedAt: NOW,
            },
          ]),
        ),
      });
      const result = await service.getUserPreferences(10);
      expect(result?.statsFormat).toBe('standard');
    });
  });

  describe('updateUserPreferences', () => {
    it('inserts a new row when none exists', async () => {
      const insert = makeInsert([
        {
          id: 2,
          userId: 20,
          statsFormat: 'expanded',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([])),
        insert: jest.fn(() => insert),
        update: jest.fn(() => makeUpdate([])),
      });

      const result = await service.updateUserPreferences(20, {
        statsFormat: 'expanded',
      });

      expect(insert.values).toHaveBeenCalledWith({
        userId: 20,
        statsFormat: 'expanded',
      });
      expect(result.statsFormat).toBe('expanded');
    });

    it('updates the existing row when one exists', async () => {
      const update = makeUpdate([
        {
          id: 3,
          userId: 30,
          statsFormat: 'standard',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([{ id: 3, userId: 30 }])),
        update: jest.fn(() => update),
        insert: jest.fn(() => makeInsert([])),
      });

      const result = await service.updateUserPreferences(30, {
        statsFormat: 'standard',
      });

      expect(update.set).toHaveBeenCalledWith(
        expect.objectContaining({ statsFormat: 'standard' }),
      );
      expect(result.statsFormat).toBe('standard');
    });

    it('drops an invalid stats_format value instead of persisting it', async () => {
      const insert = makeInsert([
        {
          id: 4,
          userId: 40,
          statsFormat: 'standard',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([])),
        insert: jest.fn(() => insert),
        update: jest.fn(() => makeUpdate([])),
      });

      await service.updateUserPreferences(40, {
        statsFormat: 'not-a-format' as never,
      });

      // The invalid value is filtered out — only userId is inserted, letting the
      // column default ('standard') apply.
      expect(insert.values).toHaveBeenCalledWith({ userId: 40 });
    });

    it('returns the existing row unchanged when there is nothing valid to update', async () => {
      const update = makeUpdate([]);
      runWith({
        select: jest.fn(() =>
          makeSelect([
            {
              id: 5,
              userId: 50,
              statsFormat: 'expanded',
              createdAt: NOW,
              updatedAt: NOW,
            },
          ]),
        ),
        update: jest.fn(() => update),
        insert: jest.fn(() => makeInsert([])),
      });

      const result = await service.updateUserPreferences(50, {
        statsFormat: 'not-a-format' as never,
      });

      // No valid field to change: skip the UPDATE entirely (an empty `.set()`
      // would throw) and return the existing row.
      expect(update.set).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 5,
        userId: 50,
        statsFormat: 'expanded',
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
  });
});
