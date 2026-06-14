/**
 * Unit tests for updateDraftSettings entitlement gates (LS-5017)
 *
 * Verifies that auction_draft and historical_era_filters entitlements are
 * enforced before any DB writes — mirroring the identical gate in
 * createLeagueAndTeams (LS-5159).
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/** Build a minimal context that simulates a free-tier commissioner. */
function makeCtx({
  userId = 1,
  tier = 'free' as 'free' | 'premium',
  leagueOwner = 1,
  leagueSport = 'baseball',
} = {}) {
  const league = {
    id: 10,
    owner: leagueOwner,
    draftStatus: 'not-started',
    sport: leagueSport,
    playerPool: 'all',
    eraFilter: 'all',
    baseballHofOnly: false,
    customEraStartYear: null,
    customEraEndYear: null,
  };

  const selectMock = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([league]),
      }),
    }),
  });
  const draftSelectMock = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([]),
      }),
    }),
  });

  // First select call is the league; second is the draft record
  let selectCallCount = 0;
  const db = {
    select: jest.fn(() => {
      selectCallCount += 1;
      return selectCallCount === 1 ? selectMock() : draftSelectMock();
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ playerPool: 'all' }]),
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([
          {
            id: 99,
            leagueId: 10,
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder: 'snake',
            pickTimeLimitSeconds: 120,
            scheduledAt: null,
          },
        ]),
      }),
    }),
  };

  const usersDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([{ subscriptionTier: tier }]),
        }),
      }),
    }),
  };

  return {
    user: { id: userId, username: 'testuser' },
    db,
    internalDb: usersDb,
    notificationService: null,
  };
}

function captureResolver() {
  jest.resetModules();
  let capturedFn:
    | ((_p: unknown, args: unknown, ctx: unknown) => Promise<unknown>)
    | undefined;

  jest.doMock('../../builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({ implement: jest.fn() })),
      inputType: jest.fn(() => ({ implement: jest.fn() })),
      objectType: jest.fn(),
      queryField: jest.fn(),
      mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: {
            resolve: (
              _p: unknown,
              args: unknown,
              ctx: unknown,
            ) => Promise<unknown>;
          }) => {
            capturedFn = opts.resolve;
          },
          arg: () => ({}),
        });
      }),
    },
  }));

  jest.doMock('@legacy-sports/utils/node', () => ({
    getDbOptions: jest.fn(() => ({})),
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
  require('./update-draft-settings');

  if (!capturedFn) throw new Error('resolver not captured');
  return capturedFn;
}

describe('updateDraftSettings — entitlement gates (LS-5017)', () => {
  it('blocks a free-tier user from setting selectionMethod=auction', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'free' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            selectionMethod: 'auction',
          },
        },
        ctx,
      ),
    ).rejects.toThrow(/premium/i);
  });

  it('allows a premium user to set selectionMethod=auction', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            selectionMethod: 'auction',
          },
        },
        ctx,
      ),
    ).resolves.toBeDefined();
  });

  it('blocks a free-tier user from setting a premium era filter (dead_ball)', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'free' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            eraFilter: 'dead_ball',
          },
        },
        ctx,
      ),
    ).rejects.toThrow(/premium/i);
  });

  it('allows a free-tier user to keep the free era filter (all)', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'free' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            eraFilter: 'all',
          },
        },
        ctx,
      ),
    ).resolves.toBeDefined();
  });

  it('allows a free-tier user to keep the free era filter (modern)', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'free' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            eraFilter: 'modern',
          },
        },
        ctx,
      ),
    ).resolves.toBeDefined();
  });
});

describe('updateDraftSettings — authentication guard', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const resolve = captureResolver();
    const ctx = { ...makeCtx(), user: null };

    await expect(
      resolve(
        null,
        { input: { leagueId: 10, selectionMethod: 'standard' } },
        ctx,
      ),
    ).rejects.toThrow(/Authentication required/i);
  });
});

describe('updateDraftSettings — authorization guard', () => {
  it('throws ForbiddenError when the calling user is not the league owner', async () => {
    const resolve = captureResolver();
    // userId=2 but league owner is 1
    const ctx = makeCtx({ userId: 2, leagueOwner: 1 });

    await expect(
      resolve(
        null,
        { input: { leagueId: 10, selectionMethod: 'standard' } },
        ctx,
      ),
    ).rejects.toThrow(/General Manager/i);
  });
});

describe('updateDraftSettings — draft-status guard', () => {
  it('throws UserInputError when draftStatus is not "not-started"', async () => {
    const resolve = captureResolver();
    // Build a context where the league draftStatus is 'in-progress'
    const league = {
      id: 10,
      owner: 1,
      draftStatus: 'in-progress',
      sport: 'baseball',
      playerPool: 'all',
      eraFilter: 'all',
      baseballHofOnly: false,
      customEraStartYear: null,
      customEraEndYear: null,
    };
    const selectMock = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([league]),
        }),
      }),
    });
    const ctx = {
      user: { id: 1, username: 'owner' },
      db: { select: selectMock },
      internalDb: makeCtx().internalDb,
      notificationService: null,
    };

    await expect(
      resolve(null, { input: { leagueId: 10, draftMode: 'live' } }, ctx),
    ).rejects.toThrow(/cannot be changed after/i);
  });
});
