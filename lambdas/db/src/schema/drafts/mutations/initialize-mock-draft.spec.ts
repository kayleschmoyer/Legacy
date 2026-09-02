/**
 * Unit tests for initializeMockDraft resolver (LS-4853)
 *
 * Core coverage:
 *   1. UNAUTHENTICATED guard — ctx.user = null → UNAUTHENTICATED
 *   2. BAD_USER_INPUT — numTeams out of range
 *   3. BAD_USER_INPUT — userPickPosition out of bounds
 *   4. BAD_USER_INPUT — pickTimeLimitSeconds out of range
 *   5. Transaction success — returns leagueId and draftId
 *   6. Transaction failure — propagates error, no partial data returned
 *
 * Mode-specific coverage lives in dedicated describe blocks below: Offline
 * (LS-9144), football sport (LS-9040), Shared-mode lobby (LS-9181), and
 * Control All Teams (LS-9253).
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

async function captureInitializeMockDraftResolver(opts?: {
  /** Override requireEntitlement's behavior (e.g. reject like a free user). */
  requireEntitlementImpl?: (...args: unknown[]) => Promise<void>;
}): Promise<(...args: unknown[]) => Promise<unknown>> {
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
            boolean: () => ({}),
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
    requireEntitlement:
      opts?.requireEntitlementImpl ?? jest.fn().mockResolvedValue(undefined),
  }));

  jest.doMock('../../entitlements', () => ({
    ENTITLEMENTS: {
      unlimited_mock_drafts: 'unlimited_mock_drafts',
      mock_draft_control_all_teams: 'mock_draft_control_all_teams',
    },
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

  it('throws BAD_USER_INPUT when sport is neither baseball nor football', async () => {
    await expect(
      resolve({}, { ...VALID_ARGS, sport: 'hockey' }, ctx, undefined),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('throws BAD_USER_INPUT when sport=football with a baseball-only playerPool', async () => {
    await expect(
      resolve(
        {},
        { ...VALID_ARGS, sport: 'football', playerPool: 'nl' },
        ctx,
        undefined,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('throws BAD_USER_INPUT when sport=baseball with a football-only playerPool', async () => {
    await expect(
      resolve(
        {},
        { ...VALID_ARGS, sport: 'baseball', playerPool: 'afc' },
        ctx,
        undefined,
      ),
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

  it('returns webSocketReady:true when the notification succeeds (isOffline=true)', async () => {
    const resolve = await captureInitializeMockDraftResolver();

    const chain: Record<string, jest.Mock> = {};
    chain.values = jest.fn(() => chain);
    chain.set = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.returning = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }])
      .mockResolvedValueOnce([{ id: 100 }]);

    const mockTx = {
      insert: jest.fn(() => chain),
      update: jest.fn(() => chain),
    };

    const db = makeMockDb((cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    const notifyDraftStarted = jest.fn().mockResolvedValue(undefined);

    const result = await resolve(
      {},
      { ...VALID_ARGS, isOffline: true },
      { user: { id: 1 }, db, notificationService: { notifyDraftStarted } },
      undefined,
    );

    expect(notifyDraftStarted).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      leagueId: 1,
      draftId: 100,
      webSocketReady: true,
    });
  });

  it('persists sport="football" on the league insert for a football mock draft (LS-9040 AC1)', async () => {
    const resolve = await captureInitializeMockDraftResolver();

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
      { ...VALID_ARGS, sport: 'football', playerPool: 'afc' },
      { user: { id: 1 }, db },
      undefined,
    );

    expect(result).toMatchObject({ leagueId: 1, draftId: 100 });
    // First insert().values() call is the league insert (leagueValues).
    expect(chain.values.mock.calls[0][0]).toMatchObject({
      sport: 'football',
      playerPool: 'afc',
    });
  });

  it('sets isOfflineDraft on the league insert and ignores an out-of-range pickTimeLimitSeconds when isOffline=true (LS-9144)', async () => {
    const resolve = await captureInitializeMockDraftResolver();

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

    // pickTimeLimitSeconds=301 would normally fail the 10-300 range check —
    // offline mode ignores the caller's time limit entirely.
    const result = await resolve(
      {},
      { ...VALID_ARGS, pickTimeLimitSeconds: 301, isOffline: true },
      { user: { id: 1 }, db },
      undefined,
    );

    expect(result).toMatchObject({ leagueId: 1, draftId: 100 });
    // First insert().values() call is the league insert (leagueValues).
    expect(chain.values.mock.calls[0][0]).toMatchObject({
      isOfflineDraft: true,
    });
  });

  it('leaves isOfflineDraft=false when isOffline is not passed', async () => {
    const resolve = await captureInitializeMockDraftResolver();

    const chain: Record<string, jest.Mock> = {};
    chain.values = jest.fn(() => chain);
    chain.set = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.returning = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }])
      .mockResolvedValueOnce([{ id: 100 }]);

    const mockTx = {
      insert: jest.fn(() => chain),
      update: jest.fn(() => chain),
    };

    const db = makeMockDb((cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    await resolve({}, VALID_ARGS, { user: { id: 1 }, db }, undefined);

    expect(chain.values.mock.calls[0][0]).toMatchObject({
      isOfflineDraft: false,
    });
  });

  it('returns webSocketReady:false without throwing when the notification fails after commit (isOffline=true)', async () => {
    const resolve = await captureInitializeMockDraftResolver();

    const chain: Record<string, jest.Mock> = {};
    chain.values = jest.fn(() => chain);
    chain.set = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.returning = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }])
      .mockResolvedValueOnce([{ id: 100 }]);

    const mockTx = {
      insert: jest.fn(() => chain),
      update: jest.fn(() => chain),
    };

    const db = makeMockDb((cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    const notifyDraftStarted = jest
      .fn()
      .mockRejectedValue(new Error('websocket fan-out failed'));

    const result = await resolve(
      {},
      { ...VALID_ARGS, isOffline: true },
      { user: { id: 1 }, db, notificationService: { notifyDraftStarted } },
      undefined,
    );

    expect(result).toMatchObject({
      leagueId: 1,
      draftId: 100,
      webSocketReady: false,
    });
  });
});

// ── LS-9181: Shared mode (isOffline=false, the default) creates a joinable
// lobby instead of an instant AI-only draft ────────────────────────────────
describe('initializeMockDraft Shared-mode lobby behavior (LS-9181)', () => {
  function makeMockDb() {
    return {
      select: jest.fn(() => ({
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue([]),
          })),
        })),
      })),
    };
  }

  function makeChainAndTx() {
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
    return { chain, mockTx };
  }

  it('names non-creator slots "Open Slot N" instead of CPU when isOffline is not passed', async () => {
    const resolve = await captureInitializeMockDraftResolver();
    const { chain, mockTx } = makeChainAndTx();

    const db = makeMockDb();
    (db as { transaction?: unknown }).transaction = jest.fn(
      (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
    );

    await resolve({}, VALID_ARGS, { user: { id: 1 }, db }, undefined);

    // Second insert().values() call is the teams insert.
    const teamNames = (chain.values.mock.calls[1][0] as { name: string }[]).map(
      (t) => t.name,
    );
    expect(teamNames).toContain('My Team');
    expect(teamNames).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Open Slot \d+$/)]),
    );
    expect(teamNames.some((n) => n.startsWith('CPU Team'))).toBe(false);
  });

  it('does not create draft_teams rows or flip the league to in-progress', async () => {
    const resolve = await captureInitializeMockDraftResolver();
    const { mockTx } = makeChainAndTx();

    const db = makeMockDb();
    (db as { transaction?: unknown }).transaction = jest.fn(
      (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
    );

    await resolve({}, VALID_ARGS, { user: { id: 1 }, db }, undefined);

    // 4 inserts: league, teams, leagueMembers, drafts — no draft_teams insert.
    expect(mockTx.insert).toHaveBeenCalledTimes(4);
    // No currentPickDeadline / draftStatus updates — league stays 'not-started'.
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('returns webSocketReady:true and skips notifyDraftStarted (no draft to announce yet)', async () => {
    const resolve = await captureInitializeMockDraftResolver();
    const { mockTx } = makeChainAndTx();

    const db = makeMockDb();
    (db as { transaction?: unknown }).transaction = jest.fn(
      (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
    );

    const notifyDraftStarted = jest.fn().mockResolvedValue(undefined);

    const result = await resolve(
      {},
      VALID_ARGS,
      { user: { id: 1 }, db, notificationService: { notifyDraftStarted } },
      undefined,
    );

    expect(notifyDraftStarted).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      leagueId: 1,
      draftId: 100,
      webSocketReady: true,
    });
  });

  it('returns the generated inviteCode in the response', async () => {
    const resolve = await captureInitializeMockDraftResolver();
    const { mockTx } = makeChainAndTx();

    const db = makeMockDb();
    (db as { transaction?: unknown }).transaction = jest.fn(
      (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx),
    );

    const result = (await resolve(
      {},
      VALID_ARGS,
      { user: { id: 1 }, db },
      undefined,
    )) as { inviteCode: string };

    expect(typeof result.inviteCode).toBe('string');
    expect(result.inviteCode).toHaveLength(8);
  });
});

describe('initializeMockDraft Control All Teams (LS-9253)', () => {
  function makeMockDb(transactionImpl: (cb: unknown) => Promise<unknown>) {
    return {
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

  function makeChainAndTx() {
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
    return { chain, mockTx };
  }

  it('rejects a non-entitled user requesting controlAllTeams with PAYMENT_REQUIRED', async () => {
    const requireEntitlementImpl = jest.fn().mockImplementation(() => {
      const err = new Error('Upgrade required') as Error & {
        extensions: { code: string };
      };
      err.extensions = { code: 'PAYMENT_REQUIRED' };
      return Promise.reject(err);
    });
    const resolve = await captureInitializeMockDraftResolver({
      requireEntitlementImpl,
    });

    await expect(
      resolve(
        {},
        { ...VALID_ARGS, controlAllTeams: true },
        { user: { id: 1 }, db: {} },
        undefined,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'PAYMENT_REQUIRED' } });
    expect(requireEntitlementImpl).toHaveBeenCalledWith(
      expect.anything(),
      'mock_draft_control_all_teams',
    );
  });

  it('does not call requireEntitlement when controlAllTeams is not requested', async () => {
    const requireEntitlementImpl = jest.fn().mockResolvedValue(undefined);
    const resolve = await captureInitializeMockDraftResolver({
      requireEntitlementImpl,
    });
    const { chain, mockTx } = makeChainAndTx();
    const db = makeMockDb((cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    await resolve({}, VALID_ARGS, { user: { id: 1 }, db }, undefined);

    expect(requireEntitlementImpl).not.toHaveBeenCalled();
    expect(chain.values.mock.calls[0][0]).toMatchObject({
      controlAllTeams: false,
    });
  });

  it('seats every team autoPick:false, skips CPU naming, forces offline, and disables draft-level auto-pick for an entitled user', async () => {
    const resolve = await captureInitializeMockDraftResolver({
      requireEntitlementImpl: jest.fn().mockResolvedValue(undefined),
    });
    const { chain, mockTx } = makeChainAndTx();
    const db = makeMockDb((cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    // userPickPosition: 2, numTeams: 4 (VALID_ARGS) — team ids returned in
    // draft order are [10, 11, 12, 13]; the human's slot (index 1) is 11.
    const result = await resolve(
      {},
      { ...VALID_ARGS, controlAllTeams: true },
      { user: { id: 1 }, db },
      undefined,
    );
    expect(result).toMatchObject({ leagueId: 1, draftId: 100 });

    // League insert: controlAllTeams + forced isOfflineDraft.
    expect(chain.values.mock.calls[0][0]).toMatchObject({
      controlAllTeams: true,
      isOfflineDraft: true,
    });

    // Teams insert: no "CPU Team" naming anywhere — every non-human slot is
    // just "Team N".
    const teamInserts = chain.values.mock.calls[1][0] as Array<{
      name: string;
    }>;
    expect(teamInserts.map((t) => t.name)).toEqual([
      'Team 1',
      'My Team',
      'Team 3',
      'Team 4',
    ]);

    // Drafts insert: draft-level auto-pick disabled — the authoritative
    // guard against autoProcessDraftPicks ever picking for this draft.
    expect(chain.values.mock.calls[3][0]).toMatchObject({
      autoPickDisabled: true,
    });

    // draft_teams insert: every team seated autoPick:false, including the
    // human's own slot — no CPU auto-picker anywhere on the board.
    const draftTeamInserts = chain.values.mock.calls[4][0] as Array<{
      autoPick: boolean;
    }>;
    expect(draftTeamInserts).toHaveLength(4);
    expect(draftTeamInserts.every((dt) => dt.autoPick === false)).toBe(true);
  });

  // LS-9369: the human's own seat isn't always draft position 1. Before this
  // fix, `firstPickIsCpu` was computed as `userPickPosition !== 1` with no
  // regard for controlAllTeams, so any Control All Teams draft where the
  // human picked a seat other than #1 got its initial deadline set to
  // already-expired (`Date.now() - 1`) instead of the untimed sentinel —
  // wrong data for a mode where no team ever auto-picks and the client's
  // "untimed" flag (queries.league.isOfflineDraft) shouldn't be the only
  // thing standing between this draft and a bogus expired pick clock.
  it('never sets an already-expired initial deadline for controlAllTeams, even when the human is not seated in position 1', async () => {
    const resolve = await captureInitializeMockDraftResolver({
      requireEntitlementImpl: jest.fn().mockResolvedValue(undefined),
    });
    const { chain, mockTx } = makeChainAndTx();
    const db = makeMockDb((cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)(mockTx),
    );

    // VALID_ARGS.userPickPosition is 2 (not position 1).
    const beforeCall = Date.now();
    await resolve(
      {},
      { ...VALID_ARGS, controlAllTeams: true },
      { user: { id: 1 }, db },
      undefined,
    );

    const draftDeadlineUpdate = chain.set.mock.calls[0][0] as {
      currentPickDeadline: Date;
    };
    expect(draftDeadlineUpdate.currentPickDeadline.getTime()).toBeGreaterThan(
      beforeCall,
    );
  });
});

export {};
