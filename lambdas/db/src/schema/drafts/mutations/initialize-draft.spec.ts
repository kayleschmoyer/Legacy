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
const mockLoggerWarn = jest.fn();
const mockDraftSqsService = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

type Resolver = (...args: unknown[]) => Promise<unknown>;

function captureInitializeDraftResolver(): Resolver {
  jest.resetModules();
  mockLoggerError.mockReset();
  mockLoggerWarn.mockReset();
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

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
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
    }),
  );

  jest.doMock('@legacy-sports/aws-utils', () => ({
    DraftSqsService: mockDraftSqsService,
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

  it('rejects a concurrent double-initialize once it acquires the league row lock (LS-10147)', async () => {
    const initializeDraft = captureInitializeDraftResolver();
    const forLockedLeague = jest
      .fn()
      .mockResolvedValue([{ draftStatus: 'in-progress' }]);
    const tx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      for: forLockedLeague,
    };
    const { db } = makeDb([
      [], // saved draft settings lookup
      [{ id: 1, draftStatus: 'not-started', rosterContinuity: 'redraft' }], // league lookup (pre-tx, passes)
      [{ permissionLevel: 'commissioner' }], // membership lookup
      [], // existingDraft lookup
    ]);
    (db as { transaction: jest.Mock }).transaction = jest.fn(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );
    const ctx = { user: { id: 99 }, db };

    await expect(
      initializeDraft({}, { leagueId: 1 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: "Cannot initialize draft: current status is 'in-progress'",
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(forLockedLeague).toHaveBeenCalledWith('update');
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  describe("automated draft: post-SQS 'queued' write failure (LS-10315)", () => {
    const originalQueueUrl = process.env.SQS_AUTOMATIC_DRAFTS_URL;

    beforeEach(() => {
      process.env.SQS_AUTOMATIC_DRAFTS_URL =
        'https://sqs.test/automatic-drafts';
    });

    afterEach(() => {
      process.env.SQS_AUTOMATIC_DRAFTS_URL = originalQueueUrl;
    });

    /**
     * Drive the resolver to the automated branch: the main transaction is
     * stubbed to return its result directly, SQS send succeeds, and the
     * second transaction (the 'queued' CAS write) rejects with `queuedError`.
     */
    function setup(queuedError: unknown) {
      const initializeDraft = captureInitializeDraftResolver();
      const sendStartDraftMessage = jest.fn().mockResolvedValue(undefined);
      mockDraftSqsService.mockImplementation(() => ({
        sendStartDraftMessage,
      }));

      const draft = { id: 7, leagueId: 1 };
      const limit = jest
        .fn()
        .mockResolvedValueOnce([]) // saved draft settings lookup
        .mockResolvedValueOnce([
          { id: 1, draftStatus: 'not-started', rosterContinuity: 'redraft' },
        ]) // league lookup
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]) // membership
        .mockResolvedValueOnce([{ id: 7 }]); // existingDraft lookup
      const db: Record<string, jest.Mock> = {
        select: jest.fn(() => db),
        from: jest.fn(() => db),
        where: jest.fn(() => db),
        limit,
        orderBy: jest.fn(),
        transaction: jest
          .fn()
          .mockResolvedValueOnce({ draft, mode: 'automated' })
          .mockRejectedValueOnce(queuedError),
      };
      // orderBy calls 1 and 3 continue the chain into .limit(1); call 2 is
      // the teams query, awaited directly.
      db.orderBy
        .mockReturnValueOnce(db)
        .mockResolvedValueOnce([{ id: 10 }, { id: 11 }])
        .mockReturnValueOnce(db);

      const ctx = { user: { id: 99 }, db };
      const run = () =>
        initializeDraft(
          {},
          { leagueId: 1, draftMode: 'automated', selectionMethod: 'random' },
          ctx,
          undefined,
        );
      return { run, draft, sendStartDraftMessage };
    }

    it('returns the draft and only warns when the write deadlocks (40P01)', async () => {
      const deadlock = Object.assign(
        new Error('Failed query: update leagues'),
        {
          cause: Object.assign(new Error('deadlock detected'), {
            code: '40P01',
          }),
        },
      );
      const { run, draft, sendStartDraftMessage } = setup(deadlock);

      await expect(run()).resolves.toBe(draft);
      expect(sendStartDraftMessage).toHaveBeenCalledTimes(1);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("'queued' status write failed transiently"),
        expect.objectContaining({ leagueId: 1, draftId: 7, pgCode: '40P01' }),
      );
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('still returns the draft but logs at error level for a non-transient failure', async () => {
      const { run, draft } = setup(new Error('connection terminated'));

      await expect(run()).resolves.toBe(draft);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Automated draft queued but 'queued' status write failed",
        expect.any(Error),
        expect.objectContaining({ leagueId: 1, draftId: 7 }),
      );
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
