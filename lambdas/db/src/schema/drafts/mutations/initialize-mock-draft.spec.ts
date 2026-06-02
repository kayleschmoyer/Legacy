/**
 * Unit tests for initializeMockDraft resolver (LS-4853)
 *
 * Test list:
 *   1. UNAUTHENTICATED guard — ctx.user = null → UNAUTHENTICATED
 *   2. BAD_USER_INPUT — numTeams out of range
 *   3. BAD_USER_INPUT — userPickPosition out of bounds
 *   4. BAD_USER_INPUT — pickTimeLimitSeconds out of range
 *   5. Transaction success — returns leagueId and draftId
 *   6. Transaction failure — propagates error, no partial data returned
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

async function captureInitializeMockDraftResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  jest.resetModules();
  let capturedFn: ((...args: unknown[]) => Promise<unknown>) | undefined;

  jest.doMock('../../builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({
        implement: jest.fn(),
      })),
      objectType: jest.fn(),
      mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: {
            resolve: (...args: unknown[]) => Promise<unknown>;
          }) => {
            capturedFn = opts.resolve;
          },
          arg: {
            int: () => ({}),
            string: () => ({}),
          },
        });
      }),
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
      leagues: {
        id: 'id',
        owner: 'owner',
        isMockDraft: 'isMockDraft',
        createdAt: 'createdAt',
        inviteCode: 'inviteCode',
      },
      teams: { id: 'id', leagueId: 'leagueId' },
      leagueMembers: { leagueId: 'leagueId', userId: 'userId' },
      drafts: { id: 'id', leagueId: 'leagueId' },
      draftTeams: { draftId: 'draftId', teamId: 'teamId' },
    },
  }));

  jest.doMock('drizzle-orm', () => ({
    and: jest.fn(),
    count: jest.fn(() => 0),
    eq: jest.fn(),
    gte: jest.fn(),
  }));

  jest.doMock('../../graphql-errors', () => ({
    AuthenticationError: jest.fn((msg: string) => {
      const err = new Error(msg) as Error & { extensions: { code: string } };
      err.extensions = { code: 'UNAUTHENTICATED' };
      return err;
    }),
    UserInputError: jest.fn((msg: string) => {
      const err = new Error(msg) as Error & { extensions: { code: string } };
      err.extensions = { code: 'BAD_USER_INPUT' };
      return err;
    }),
    PremiumRequiredError: jest.fn((msg: string) => {
      const err = new Error(msg) as Error & { extensions: { code: string } };
      err.extensions = { code: 'PAYMENT_REQUIRED' };
      return err;
    }),
  }));

  jest.doMock('../../authorization', () => ({
    hasEntitlement: jest.fn().mockResolvedValue(true),
  }));

  jest.doMock('../../entitlements', () => ({
    ENTITLEMENTS: { unlimited_mock_drafts: 'unlimited_mock_drafts' },
  }));

  jest.doMock('../helpers', () => ({
    countRecentMockDrafts: jest.fn().mockResolvedValue(0),
    MOCK_DRAFT_FREE_WEEKLY_LIMIT: 2,
  }));

  await import('./initialize-mock-draft');
  if (!capturedFn)
    throw new Error('initializeMockDraft resolver was not captured');
  return capturedFn;
}

const VALID_ARGS = {
  numTeams: 4,
  rosterSize: 10,
  userPickPosition: 2,
  pickTimeLimitSeconds: 30,
  draftOrder: 'snake',
  playerPool: 'all',
};

describe('initializeMockDraft UNAUTHENTICATED guard', () => {
  it('throws UNAUTHENTICATED when ctx.user is null', async () => {
    const resolve = await captureInitializeMockDraftResolver();
    const ctx = { user: null, db: {} };
    await expect(resolve({}, VALID_ARGS, ctx, undefined)).rejects.toMatchObject(
      {
        extensions: { code: 'UNAUTHENTICATED' },
      },
    );
  });
});

describe('initializeMockDraft input validation', () => {
  let resolve: (...args: unknown[]) => Promise<unknown>;
  const ctx = { user: { id: 1 }, db: {} };

  beforeEach(async () => {
    resolve = await captureInitializeMockDraftResolver();
  });

  it('throws BAD_USER_INPUT when numTeams is below 2', async () => {
    await expect(
      resolve({}, { ...VALID_ARGS, numTeams: 1 }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('throws BAD_USER_INPUT when numTeams exceeds 12', async () => {
    await expect(
      resolve({}, { ...VALID_ARGS, numTeams: 13 }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('throws BAD_USER_INPUT when userPickPosition exceeds numTeams', async () => {
    await expect(
      resolve(
        {},
        { ...VALID_ARGS, numTeams: 4, userPickPosition: 5 },
        ctx,
        undefined,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('throws BAD_USER_INPUT when pickTimeLimitSeconds is below 10', async () => {
    await expect(
      resolve({}, { ...VALID_ARGS, pickTimeLimitSeconds: 5 }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('throws BAD_USER_INPUT when pickTimeLimitSeconds exceeds 300', async () => {
    await expect(
      resolve({}, { ...VALID_ARGS, pickTimeLimitSeconds: 301 }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });
});

describe('initializeMockDraft transaction behavior', () => {
  function makeMockDb(transactionImpl: (cb: unknown) => Promise<unknown>) {
    return {
      // invite-code uniqueness probe (outside transaction)
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue([]),
          })),
        })),
      })),
      transaction: jest.fn(transactionImpl),
    };
  }

  it('returns leagueId and draftId when the transaction commits successfully', async () => {
    const resolve = await captureInitializeMockDraftResolver();

    // Build a chainable mock for tx operations.
    // returning() is called by: league insert, teams insert, draft insert.
    const chain: Record<string, jest.Mock> = {};
    chain.values = jest.fn(() => chain);
    chain.set = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.returning = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }]) // league
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }]) // teams
      .mockResolvedValueOnce([{ id: 100 }]); // draft

    const mockTx = {
      insert: jest.fn(() => chain),
      update: jest.fn(() => chain),
    };

    const db = makeMockDb((cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    const result = await resolve(
      {},
      VALID_ARGS,
      { user: { id: 1 }, db },
      undefined,
    );
    expect(result).toMatchObject({ leagueId: 1, draftId: 100 });
  });

  it('propagates the error and returns no partial data when the transaction fails', async () => {
    const resolve = await captureInitializeMockDraftResolver();

    const db = makeMockDb(
      jest.fn().mockRejectedValue(new Error('connection lost')),
    );

    await expect(
      resolve({}, VALID_ARGS, { user: { id: 1 }, db }, undefined),
    ).rejects.toThrow('connection lost');
  });
});
