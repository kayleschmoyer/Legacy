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
        audioEnabled: false,
        onboardingCompletedAt: null,
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

    it('persists an audio_enabled opt-in', async () => {
      const update = makeUpdate([
        {
          id: 4,
          userId: 40,
          statsFormat: 'standard',
          audioEnabled: true,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([{ id: 4, userId: 40 }])),
        update: jest.fn(() => update),
        insert: jest.fn(() => makeInsert([])),
      });

      const result = await service.updateUserPreferences(40, {
        audioEnabled: true,
      });

      expect(update.set).toHaveBeenCalledWith(
        expect.objectContaining({ audioEnabled: true }),
      );
      expect(result.audioEnabled).toBe(true);
    });

    it('drops a non-boolean audio_enabled instead of persisting it', async () => {
      // Audio is an opt-in gate — a stray non-boolean must never flip it on.
      const update = makeUpdate([
        {
          id: 5,
          userId: 50,
          statsFormat: 'standard',
          audioEnabled: false,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([{ id: 5, userId: 50 }])),
        update: jest.fn(() => update),
        insert: jest.fn(() => makeInsert([])),
      });

      const result = await service.updateUserPreferences(50, {
        statsFormat: 'standard',
        audioEnabled: 'yes' as never,
      });

      // Exact match: the cleaned update carries stats_format only, which is
      // precisely the claim — audio_enabled never reached the write.
      expect(update.set).toHaveBeenCalledWith({ statsFormat: 'standard' });
      expect(result.audioEnabled).toBe(false);
    });

    it('stamps onboarding_completed_at set-once (COALESCE) on an existing row', async () => {
      const DONE = new Date('2026-10-01T00:00:00.000Z');
      const update = makeUpdate([
        {
          id: 7,
          userId: 70,
          statsFormat: 'standard',
          audioEnabled: false,
          onboardingCompletedAt: DONE,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([{ id: 7, userId: 70 }])),
        update: jest.fn(() => update),
        insert: jest.fn(() => makeInsert([])),
      });

      const result = await service.updateUserPreferences(70, {
        markOnboardingComplete: true,
      });

      // The write is a SQL expression (COALESCE keeps an existing value), not a
      // JS Date — so a repeat call can never overwrite the first timestamp.
      const set = (update.set.mock.calls[0] as [Record<string, unknown>])[0];
      expect(set.onboardingCompletedAt).toBeDefined();
      expect(set.onboardingCompletedAt).not.toBeInstanceOf(Date);
      expect(result.onboardingCompletedAt).toEqual(DONE);
    });

    it('stamps onboarding_completed_at on first insert', async () => {
      const insert = makeInsert([
        {
          id: 8,
          userId: 80,
          statsFormat: 'standard',
          audioEnabled: false,
          onboardingCompletedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([])),
        insert: jest.fn(() => insert),
        update: jest.fn(() => makeUpdate([])),
      });

      await service.updateUserPreferences(80, { markOnboardingComplete: true });

      expect(insert.values).toHaveBeenCalledWith({
        userId: 80,
        onboardingCompletedAt: expect.any(Date) as Date,
      });
    });

    it('never writes onboarding_completed_at unless explicitly marked', async () => {
      const update = makeUpdate([
        {
          id: 9,
          userId: 90,
          statsFormat: 'expanded',
          audioEnabled: false,
          onboardingCompletedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]);
      runWith({
        select: jest.fn(() => makeSelect([{ id: 9, userId: 90 }])),
        update: jest.fn(() => update),
        insert: jest.fn(() => makeInsert([])),
      });

      await service.updateUserPreferences(90, {
        statsFormat: 'expanded',
        markOnboardingComplete: false,
      });

      expect(update.set).toHaveBeenCalledWith({ statsFormat: 'expanded' });
    });

    it('defaults audio_enabled to false for a row predating the column', async () => {
      runWith({
        select: jest.fn(() =>
          makeSelect([
            {
              id: 6,
              userId: 60,
              statsFormat: 'standard',
              createdAt: NOW,
              updatedAt: NOW,
            },
          ]),
        ),
        insert: jest.fn(() => makeInsert([])),
        update: jest.fn(() => makeUpdate([])),
      });

      const result = await service.getUserPreferences(60);

      expect(result?.audioEnabled).toBe(false);
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
        audioEnabled: false,
        onboardingCompletedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
  });
});
