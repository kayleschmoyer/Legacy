/**
 * Unit tests for initializeDraft resolver (LS-9168)
 *
 * Focus: re-initializing a draft that is not 'not-started' (e.g. already
 * 'paused' or 'in-progress') is an expected, client-facing rejection — it
 * must NOT be routed through LOGGER.error (which forwards to Rollbar and
 * pollutes it with false-alarm "GraphQLError" items for normal
 * commissioner-UI races), while genuinely unexpected errors still are.
 */

const mockLoggerError = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: mockLoggerError,
  },
}));

type Resolver = (...args: unknown[]) => Promise<unknown>;

function captureInitializeDraftResolver(): Resolver {
  jest.resetModules();
  mockLoggerError.mockReset();
  let captured: Resolver | undefined;

  jest.doMock('../../builder', () => ({
    builder: {
      mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
        if (name !== 'initializeDraft') return;
        fn({
          field: (opts: { resolve: Resolver }) => {
            captured = opts.resolve;
          },
          arg: { int: () => ({}), string: () => ({}) },
        });
      }),
    },
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: {
      drafts: {
        leagueId: 'leagueId',
        id: 'id',
        createdAt: 'createdAt',
        draftMode: 'draftMode',
        selectionMethod: 'selectionMethod',
        draftOrder: 'draftOrder',
      },
      leagues: { id: 'id', draftStatus: 'draftStatus' },
      leagueMembers: {
        leagueId: 'leagueId',
        userId: 'userId',
        permissionLevel: 'permissionLevel',
      },
      teams: { id: 'id', leagueId: 'leagueId' },
      draftTeams: { draftId: 'draftId' },
      draftPicks: { draftId: 'draftId' },
    },
  }));

  jest.doMock('@legacy-sports/aws-utils', () => ({
    DraftSqsService: jest.fn(),
  }));

  jest.doMock('@legacy-sports/utils', () => ({
    shuffleArray: (arr: unknown[]) => arr,
  }));

  jest.doMock('../types', () => ({ Draft: {} }));
  jest.doMock('../helpers', () => ({
    enableAutoPickForUnmanagedTeams: jest.fn(),
    resolveDraftTeamsOrder: jest.fn(),
  }));
  jest.doMock('../../draft-slot-trades/helpers', () => ({
    cancelPendingDraftSlotTradesForLeague: jest.fn(),
  }));
  jest.doMock('../keeper-application', () => ({
    applyKeeperDesignationsForDraft: jest.fn(),
  }));

  require('./initialize-draft');

  if (!captured) {
    throw new Error('initializeDraft resolver was not captured');
  }
  return captured;
}

/**
 * Build a context.db whose chained select().from().where().orderBy().limit()
 * calls resolve the provided rows in order. Each entry is the array returned
 * by one `.limit(1)`.
 */
function makeDb(limitResults: unknown[][]): { db: unknown } {
  const limit = jest.fn();
  for (const rows of limitResults) {
    limit.mockResolvedValueOnce(rows);
  }
  const db = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit,
  };
  return { db };
}

describe('initializeDraft resolver', () => {
  it('rejects with BAD_USER_INPUT (not a raw server error) when the draft is already paused', async () => {
    const initializeDraft = captureInitializeDraftResolver();
    const { db } = makeDb([
      [], // saved draft settings lookup
      [{ id: 1, draftStatus: 'paused' }], // league lookup
    ]);
    const ctx = { user: { id: 99 }, db };

    await expect(
      initializeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: "Cannot initialize draft: current status is 'paused'",
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('does NOT log the paused-draft rejection at error level (would otherwise reach Rollbar)', async () => {
    const initializeDraft = captureInitializeDraftResolver();
    const { db } = makeDb([
      [], // saved draft settings lookup
      [{ id: 1, draftStatus: 'paused' }], // league lookup
    ]);
    const ctx = { user: { id: 99 }, db };

    await expect(
      initializeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toBeDefined();

    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('does NOT log an in-progress-draft rejection at error level either', async () => {
    const initializeDraft = captureInitializeDraftResolver();
    const { db } = makeDb([
      [], // saved draft settings lookup
      [{ id: 1, draftStatus: 'in-progress' }], // league lookup
    ]);
    const ctx = { user: { id: 99 }, db };

    await expect(
      initializeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: "Cannot initialize draft: current status is 'in-progress'",
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('rejects draftOrder=reverse_standings for a non-keeper league (LS-8929)', async () => {
    const initializeDraft = captureInitializeDraftResolver();
    const { db } = makeDb([
      [], // saved draft settings lookup
      [
        {
          id: 1,
          draftStatus: 'not-started',
          rosterContinuity: 'redraft',
        },
      ], // league lookup
    ]);
    const ctx = { user: { id: 99 }, db };

    await expect(
      initializeDraft(
        {},
        { leagueId: 1, draftOrder: 'reverse_standings' },
        ctx,
        undefined,
      ),
    ).rejects.toMatchObject({
      message:
        "The 'reverse_standings' draft order is only available for keeper leagues",
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('still logs an unexpected error at error level', async () => {
    const initializeDraft = captureInitializeDraftResolver();
    const db = {
      select: jest.fn(() => {
        throw new Error('connection reset');
      }),
    };
    const ctx = { user: { id: 99 }, db };

    await expect(
      initializeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toThrow('connection reset');
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Error initializing draft',
      expect.any(Error),
      { leagueId: 1, userId: 99 },
    );
  });
});

export {};
