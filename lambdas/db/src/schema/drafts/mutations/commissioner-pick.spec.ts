/**
 * Unit tests for commissionerPick resolver (LS-2500)
 *
 * Test list:
 *   1. UNAUTHENTICATED guard — ctx.user = null → UNAUTHENTICATED  (see below)
 *   2. BAD_USER_INPUT roster-full guard — checkRosterCapacity isFull: true (see below)
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Shared helper: load the commissioner-pick module with all dependencies mocked
// and return the captured GraphQL resolver function. Used by every test below.
function captureCommissionerPickResolver(overrides?: {
  checkRosterCapacity?: jest.Mock;
  getCurrentDraftPickInfo?: jest.Mock;
  findFailedEligibilityRule?: jest.Mock;
  isLockWaitTimeout?: (error: unknown) => boolean;
}): (...args: unknown[]) => Promise<unknown> {
  jest.resetModules();
  let capturedFn: ((...args: unknown[]) => Promise<unknown>) | undefined;

  jest.doMock('../../builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({ implement: jest.fn() })),
      inputType: jest.fn(() => ({ implement: jest.fn() })),
      objectType: jest.fn(),
      queryField: jest.fn(),
      mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: {
            resolve: (...args: unknown[]) => Promise<unknown>;
          }) => {
            capturedFn = opts.resolve;
          },
          arg: { int: () => ({}) },
        });
      }),
    },
  }));
  jest.doMock('@legacy-sports/utils/node', () => ({
    getDbOptions: jest.fn(() => ({})),
  }));
  jest.doMock('@legacy-sports/db-client', () => ({
    createBadgeService: jest.fn(() => ({
      evaluateDraftBadges: jest.fn().mockResolvedValue([]),
    })),
    findFailedEligibilityRule:
      overrides?.findFailedEligibilityRule ?? jest.fn().mockResolvedValue(null),
    PublicSchema: {
      leagueMembers: {
        leagueId: 'leagueId',
        userId: 'userId',
        permissionLevel: 'permissionLevel',
      },
      leagues: { id: 'id' },
      draftPicks: { draftId: 'draftId', playerId: 'playerId' },
      players: { id: 'id' },
    },
  }));
  jest.doMock('../types', () => ({ DraftPick: {} }));
  jest.doMock('../helpers', () => ({
    commitDraftPick: jest.fn(),
    getCurrentDraftPickInfo:
      overrides?.getCurrentDraftPickInfo ??
      jest.fn().mockResolvedValue({
        teamId: 10,
        overallPick: 1,
        round: 1,
        pickNumber: 1,
        isComplete: false,
      }),
  }));
  jest.doMock('../../../services/roster-service', () => ({
    checkRosterCapacity:
      overrides?.checkRosterCapacity ??
      jest.fn().mockResolvedValue({ isFull: false }),
  }));
  jest.doMock('../../../services/activity-log', () => ({
    logDraftPickActivity: jest.fn(),
  }));
  jest.doMock('../../matchups/mutations', () => ({
    createAllMatchupsForLeague: jest.fn(),
  }));
  jest.doMock('../scheduled-mutations', () => ({
    isLockWaitTimeout: overrides?.isLockWaitTimeout ?? (() => false),
  }));
  jest.doMock('../../leagues/delete-resilience', () => ({
    describeDbError: jest.fn(() => ({ message: 'mock db error' })),
    formatDbError: jest.fn(() => 'mock db error'),
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./commissioner-pick');
  if (!capturedFn)
    throw new Error('commissionerPick resolver was not captured');
  return capturedFn;
}

describe('commissionerPick UNAUTHENTICATED guard', () => {
  it('throws UNAUTHENTICATED when ctx.user is null', async () => {
    const resolve = captureCommissionerPickResolver();
    const ctx = { user: null, db: {} };
    await expect(
      resolve({}, { draftId: 1, playerId: 5 }, ctx, undefined),
    ).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });
});

describe('commissionerPick resolver', () => {
  let resolve: (...args: unknown[]) => Promise<unknown>;
  let mockCheckRosterCapacity: jest.Mock;
  let mockGetCurrentDraftPickInfo: jest.Mock;
  let mockFindFailedEligibilityRule: jest.Mock;
  let mockIsLockWaitTimeout: jest.Mock;
  let mockCommitDraftPick: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockCheckRosterCapacity = jest.fn().mockResolvedValue({ isFull: false });
    mockGetCurrentDraftPickInfo = jest.fn().mockResolvedValue({
      teamId: 10,
      overallPick: 1,
      round: 1,
      pickNumber: 1,
      isComplete: false,
    });
    mockFindFailedEligibilityRule = jest.fn().mockResolvedValue(null);
    mockIsLockWaitTimeout = jest.fn().mockReturnValue(false);
    mockCommitDraftPick = jest.fn().mockResolvedValue({
      draftPick: {
        id: 100,
        draftId: 1,
        teamId: 10,
        playerId: 5,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date(),
      },
      isDraftComplete: false,
      nextDeadline: null,
      nextPickInfo: null,
    });

    let capturedFn: ((...args: unknown[]) => Promise<unknown>) | undefined;

    jest.doMock('../../builder', () => ({
      builder: {
        objectRef: jest.fn(() => ({ implement: jest.fn() })),
        inputType: jest.fn(() => ({ implement: jest.fn() })),
        objectType: jest.fn(),
        queryField: jest.fn(),
        mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
          fn({
            field: (opts: {
              resolve: (...args: unknown[]) => Promise<unknown>;
            }) => {
              capturedFn = opts.resolve;
            },
            arg: { int: () => ({}) },
          });
        }),
      },
    }));

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createBadgeService: jest.fn(() => ({
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
      })),
      findFailedEligibilityRule: mockFindFailedEligibilityRule,
      PublicSchema: {
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          permissionLevel: 'permissionLevel',
        },
        leagues: { id: 'id' },
        draftPicks: { draftId: 'draftId', playerId: 'playerId' },
        players: { id: 'id' },
      },
    }));

    jest.doMock('../types', () => ({ DraftPick: {} }));

    jest.doMock('../helpers', () => ({
      commitDraftPick: mockCommitDraftPick,
      getCurrentDraftPickInfo: mockGetCurrentDraftPickInfo,
    }));

    jest.doMock('../../../services/roster-service', () => ({
      checkRosterCapacity: mockCheckRosterCapacity,
    }));

    jest.doMock('../../../services/activity-log', () => ({
      logDraftPickActivity: jest.fn(),
    }));

    jest.doMock('../../matchups/mutations', () => ({
      createAllMatchupsForLeague: jest.fn(),
    }));

    jest.doMock('../scheduled-mutations', () => ({
      isLockWaitTimeout: mockIsLockWaitTimeout,
    }));

    jest.doMock('../../leagues/delete-resilience', () => ({
      describeDbError: jest.fn(() => ({ message: 'mock db error' })),
      formatDbError: jest.fn(() => 'mock db error'),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./commissioner-pick');

    if (!capturedFn)
      throw new Error('commissionerPick resolver was not captured');
    resolve = capturedFn;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws BAD_USER_INPUT when the team roster is full', async () => {
    const leagueRow = {
      id: 1,
      draftStatus: 'in-progress',
      playerPool: 'all',
      baseballHofOnly: false,
      eraFilter: null,
      minCareerGames: 0,
      minCareerSeasons: 0,
      maxRosterSize: 25,
      isMockDraft: false,
    };
    const draftRow = {
      id: 1,
      league_id: 1,
      pick_time_limit_seconds: 30,
      selection_method: 'snake',
    };

    // Phase 1 (context.db): pre-transaction reads
    const db = {
      execute: jest.fn().mockResolvedValueOnce({ rows: [draftRow] }), // Phase 1 draft lookup
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]) // membership
        .mockResolvedValueOnce([leagueRow]) // league pre
        .mockResolvedValueOnce([{ id: 5, hallOfFame: false }]), // player
      transaction: jest.fn(),
    };

    // Phase 2 (tx): inside the transaction
    const tx = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [draftRow] }), // FOR NO KEY UPDATE draft lookup
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([leagueRow]) // league re-verify
        .mockResolvedValueOnce([]), // no existing pick
    };

    db.transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    mockCheckRosterCapacity.mockResolvedValueOnce({ isFull: true });

    const ctx = { user: { id: 99 }, db, notificationService: null };
    await expect(
      resolve({}, { draftId: 1, playerId: 5 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'Team roster is full (25 players maximum)',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });
});

describe('commissionerPick — draft row lock-wait retry (LS-8480)', () => {
  let resolve: (...args: unknown[]) => Promise<unknown>;
  let mockCommitDraftPick: jest.Mock;
  let mockIsLockWaitTimeout: jest.Mock;

  const leagueRow = {
    id: 1,
    draftStatus: 'in-progress',
    playerPool: 'all',
    baseballHofOnly: false,
    eraFilter: null,
    minCareerGames: 0,
    minCareerSeasons: 0,
    maxRosterSize: 25,
    isMockDraft: false,
  };
  const draftRow = {
    id: 1,
    league_id: 1,
    pick_time_limit_seconds: 30,
    selection_method: 'snake',
  };

  // Builds a fresh `tx` object for one successful pass through the Phase-2
  // transaction body (used for the attempt that is allowed to succeed).
  function makeSuccessfulTx() {
    return {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [draftRow] }), // FOR NO KEY UPDATE draft lookup
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([leagueRow]) // league re-verify
        .mockResolvedValueOnce([]), // no existing pick
    };
  }

  /**
   * Builds a `context.db` whose `transaction()` rejects with `txError` for
   * the first `failures` calls, then delegates to a fresh successful `tx`.
   */
  function makeDb(failures: number, txError: Error) {
    let callCount = 0;
    return {
      execute: jest.fn().mockResolvedValueOnce({ rows: [draftRow] }), // Phase 1 draft lookup
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]) // membership
        .mockResolvedValueOnce([leagueRow]) // league pre
        .mockResolvedValueOnce([{ id: 5, hallOfFame: false }]), // player
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
          callCount++;
          if (callCount <= failures) {
            return Promise.reject(txError);
          }
          return fn(makeSuccessfulTx());
        }),
    };
  }

  const lockWaitError = () =>
    Object.assign(new Error('canceling statement due to statement timeout'), {
      cause: { code: '57014' },
    });

  beforeEach(() => {
    jest.resetModules();
    mockIsLockWaitTimeout = jest.fn().mockReturnValue(true);
    mockCommitDraftPick = jest.fn().mockResolvedValue({
      draftPick: {
        id: 100,
        draftId: 1,
        teamId: 10,
        playerId: 5,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        pickedAt: new Date(),
      },
      isDraftComplete: false,
      nextDeadline: null,
      nextPickInfo: null,
    });

    let capturedFn: ((...args: unknown[]) => Promise<unknown>) | undefined;

    jest.doMock('../../builder', () => ({
      builder: {
        objectRef: jest.fn(() => ({ implement: jest.fn() })),
        inputType: jest.fn(() => ({ implement: jest.fn() })),
        objectType: jest.fn(),
        queryField: jest.fn(),
        mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
          fn({
            field: (opts: {
              resolve: (...args: unknown[]) => Promise<unknown>;
            }) => {
              capturedFn = opts.resolve;
            },
            arg: { int: () => ({}) },
          });
        }),
      },
    }));
    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));
    jest.doMock('@legacy-sports/db-client', () => ({
      createBadgeService: jest.fn(() => ({
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
      })),
      findFailedEligibilityRule: jest.fn().mockResolvedValue(null),
      PublicSchema: {
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          permissionLevel: 'permissionLevel',
        },
        leagues: { id: 'id' },
        draftPicks: { draftId: 'draftId', playerId: 'playerId' },
        players: { id: 'id' },
      },
    }));
    jest.doMock('../types', () => ({ DraftPick: {} }));
    jest.doMock('../helpers', () => ({
      commitDraftPick: mockCommitDraftPick,
      getCurrentDraftPickInfo: jest.fn().mockResolvedValue({
        teamId: 10,
        overallPick: 1,
        round: 1,
        pickNumber: 1,
        isComplete: false,
      }),
    }));
    jest.doMock('../../../services/roster-service', () => ({
      checkRosterCapacity: jest.fn().mockResolvedValue({ isFull: false }),
    }));
    jest.doMock('../../../services/activity-log', () => ({
      logDraftPickActivity: jest.fn(),
    }));
    jest.doMock('../../matchups/mutations', () => ({
      createAllMatchupsForLeague: jest.fn(),
    }));
    jest.doMock('../scheduled-mutations', () => ({
      isLockWaitTimeout: mockIsLockWaitTimeout,
    }));
    jest.doMock('../../leagues/delete-resilience', () => ({
      describeDbError: jest.fn(() => ({ message: 'mock db error' })),
      formatDbError: jest.fn(() => 'mock db error'),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./commissioner-pick');
    if (!capturedFn)
      throw new Error('commissionerPick resolver was not captured');
    resolve = capturedFn;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retries the transaction after a transient 57014 lock-wait timeout and succeeds', async () => {
    const db = makeDb(1, lockWaitError());
    const ctx = { user: { id: 99 }, db, notificationService: null };

    await resolve({}, { draftId: 1, playerId: 5 }, ctx, undefined);

    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(mockCommitDraftPick).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-lock-wait transaction error', async () => {
    mockIsLockWaitTimeout.mockReturnValue(false);
    const nonLockError = Object.assign(new Error('deadlock detected'), {
      cause: { code: '40P01' },
    });
    const db = makeDb(1, nonLockError);
    const ctx = { user: { id: 99 }, db, notificationService: null };

    await expect(
      resolve({}, { draftId: 1, playerId: 5 }, ctx, undefined),
    ).rejects.toThrow('deadlock detected');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(mockCommitDraftPick).not.toHaveBeenCalled();
  });

  it('gives up and throws once lock-wait retries are exhausted', async () => {
    const db = makeDb(3, lockWaitError()); // exceeds MAX_PICK_LOCK_ATTEMPTS (3 total attempts)
    const ctx = { user: { id: 99 }, db, notificationService: null };

    await expect(
      resolve({}, { draftId: 1, playerId: 5 }, ctx, undefined),
    ).rejects.toThrow('canceling statement due to statement timeout');

    expect(db.transaction).toHaveBeenCalledTimes(3);
    expect(mockCommitDraftPick).not.toHaveBeenCalled();
  });
});

export {};
