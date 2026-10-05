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
  isPlayerOnRoster?: jest.Mock;
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
  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      createBadgeService: jest.fn(() => ({
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
      })),
      findFailedEligibilityRule:
        overrides?.findFailedEligibilityRule ??
        jest.fn().mockResolvedValue(null),
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
    }),
  );
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
    isPlayerOnRoster:
      overrides?.isPlayerOnRoster ?? jest.fn().mockResolvedValue(false),
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
  let mockIsPlayerOnRoster: jest.Mock;
  let mockGetCurrentDraftPickInfo: jest.Mock;
  let mockFindFailedEligibilityRule: jest.Mock;
  let mockIsLockWaitTimeout: jest.Mock;
  let mockCommitDraftPick: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockCheckRosterCapacity = jest.fn().mockResolvedValue({ isFull: false });
    mockIsPlayerOnRoster = jest.fn().mockResolvedValue(false);
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

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
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
      }),
    );

    jest.doMock('../types', () => ({ DraftPick: {} }));

    jest.doMock('../helpers', () => ({
      commitDraftPick: mockCommitDraftPick,
      getCurrentDraftPickInfo: mockGetCurrentDraftPickInfo,
    }));

    jest.doMock('../../../services/roster-service', () => ({
      checkRosterCapacity: mockCheckRosterCapacity,
      isPlayerOnRoster: mockIsPlayerOnRoster,
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

  it('throws BAD_USER_INPUT when the player is already rostered as a keeper (LS-8674)', async () => {
    const leagueRow = {
      id: 1,
      draftStatus: 'in-progress',
      playerPool: 'all',
      baseballHofOnly: false,
      eraFilter: null,
      minCareerGames: 0,
      minCareerSeasons: 0,
      maxRosterSize: 25,
    };
    const draftRow = {
      id: 1,
      league_id: 1,
      pick_time_limit_seconds: 30,
      selection_method: 'snake',
    };

    const db = {
      execute: jest.fn().mockResolvedValueOnce({ rows: [draftRow] }),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([leagueRow])
        .mockResolvedValueOnce([{ id: 5, hallOfFame: false }]),
      transaction: jest.fn(),
    };

    const tx = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [draftRow] }),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([leagueRow])
        .mockResolvedValueOnce([]),
    };

    db.transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    mockIsPlayerOnRoster.mockResolvedValueOnce(true);

    const ctx = { user: { id: 99 }, db, notificationService: null };
    await expect(
      resolve({}, { draftId: 1, playerId: 5 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'Player is already rostered as a keeper in this league',
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(mockCheckRosterCapacity).not.toHaveBeenCalled();
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
    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
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
      }),
    );
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
      isPlayerOnRoster: jest.fn().mockResolvedValue(false),
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

describe('commissionerPick — next seat on the clock (LS-10593)', () => {
  const draftRow = {
    id: 1,
    league_id: 1,
    pick_time_limit_seconds: 30,
    selection_method: 'snake',
  };
  const nextPickInfo = {
    draftId: 1,
    teamId: 11,
    participantId: 77,
    round: 1,
    pickNumber: 2,
    overallPick: 2,
    isComplete: false,
  };

  function setup(options: {
    draftStatus: 'in-progress' | 'paused';
    isDraftComplete?: boolean;
  }) {
    jest.resetModules();
    const leagueRow = {
      id: 1,
      draftStatus: options.draftStatus,
      playerPool: 'all',
      maxRosterSize: 25,
    };
    const mockOffload = jest.fn().mockResolvedValue(undefined);
    const mockNotifyOnTheClock = jest.fn().mockResolvedValue([]);
    const mockNotifyDraftPickMade = jest.fn().mockResolvedValue(undefined);
    const txUpdateSet = jest.fn().mockReturnThis();
    const commitDeadline = new Date(Date.now() + 30_000);

    let capturedFn: ((...args: unknown[]) => Promise<unknown>) | undefined;
    jest.doMock('../../builder', () => ({
      builder: {
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
    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
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
          drafts: { id: 'id', currentPickDeadline: 'currentPickDeadline' },
          draftPicks: { draftId: 'draftId', playerId: 'playerId' },
          players: { id: 'id' },
        },
      }),
    );
    jest.doMock('../types', () => ({ DraftPick: {} }));
    jest.doMock('../helpers', () => ({
      commitDraftPick: jest.fn().mockResolvedValue({
        draftPick: { id: 100, playerId: 5 },
        isDraftComplete: options.isDraftComplete ?? false,
        nextDeadline: options.isDraftComplete ? null : commitDeadline,
        nextPickInfo: options.isDraftComplete ? null : nextPickInfo,
      }),
      getCurrentDraftPickInfo: jest.fn().mockResolvedValue({
        teamId: 10,
        participantId: 66,
        overallPick: 1,
        round: 1,
        pickNumber: 1,
        isComplete: false,
      }),
    }));
    jest.doMock('../offload-auto-pick', () => ({
      offloadNextPickIfAutoPick: mockOffload,
    }));
    jest.doMock('../on-the-clock-push', () => ({
      notifyOnTheClock: mockNotifyOnTheClock,
    }));
    jest.doMock('../../../services/roster-service', () => ({
      checkRosterCapacity: jest.fn().mockResolvedValue({ isFull: false }),
      isPlayerOnRoster: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../../../services/activity-log', () => ({
      logDraftPickActivity: jest.fn(),
    }));
    jest.doMock('../../matchups/mutations', () => ({
      createAllMatchupsForLeague: jest
        .fn()
        .mockResolvedValue({ matchupCount: 0 }),
    }));
    jest.doMock('../scheduled-mutations', () => ({
      isLockWaitTimeout: jest.fn().mockReturnValue(false),
    }));
    jest.doMock('../../leagues/delete-resilience', () => ({
      describeDbError: jest.fn(() => ({ message: 'mock db error' })),
      formatDbError: jest.fn(() => 'mock db error'),
    }));

    const tx = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL statement_timeout
        .mockResolvedValueOnce({ rows: [draftRow] }), // FOR NO KEY UPDATE
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([leagueRow]) // league re-verify
        .mockResolvedValueOnce([]), // no existing pick
      update: jest.fn(() => ({
        set: txUpdateSet,
        where: jest.fn().mockResolvedValue(undefined),
      })),
    };
    const publisher = { publishToMany: jest.fn() };
    const db = {
      execute: jest.fn().mockResolvedValueOnce({ rows: [draftRow] }),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest
        .fn()
        .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
        .mockResolvedValueOnce([leagueRow])
        .mockResolvedValueOnce([{ id: 5 }]),
      transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const ctx = {
      user: { id: 99 },
      db,
      notificationService: {
        notifyDraftPickMade: mockNotifyDraftPickMade,
        notifyDraftCompleted: jest.fn().mockResolvedValue(undefined),
      },
      notificationPublisher: publisher,
    };

    require('./commissioner-pick');
    if (!capturedFn)
      throw new Error('commissionerPick resolver was not captured');
    const resolve = capturedFn;

    return {
      run: () => resolve({}, { draftId: 1, playerId: 5 }, ctx, undefined),
      ctx,
      tx,
      txUpdateSet,
      publisher,
      commitDeadline,
      mockOffload,
      mockNotifyOnTheClock,
      mockNotifyDraftPickMade,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('offloads an auto-pick next seat to autoProcessDraftPicks (mirrors makeDraftPick LS-8107)', async () => {
    const { run, ctx, mockOffload } = setup({ draftStatus: 'in-progress' });

    await run();

    expect(mockOffload).toHaveBeenCalledWith(ctx.db, {
      draftId: 1,
      leagueId: 1,
      nextParticipantId: 77,
    });
  });

  it('pushes the next seat that it is on the clock', async () => {
    const { run, ctx, publisher, mockNotifyOnTheClock } = setup({
      draftStatus: 'in-progress',
    });

    await run();

    expect(mockNotifyOnTheClock).toHaveBeenCalledWith(ctx.db, publisher, {
      draftId: 1,
      leagueId: 1,
      participantId: 77,
      round: 1,
      pickNumber: 2,
    });
  });

  it('keeps the timer armed and broadcast while the draft is running', async () => {
    const { run, tx, commitDeadline, mockNotifyDraftPickMade } = setup({
      draftStatus: 'in-progress',
    });

    await run();

    expect(tx.update).not.toHaveBeenCalled();
    const extras = mockNotifyDraftPickMade.mock.calls[0][10] as {
      currentPickDeadline: string | null;
    };
    expect(extras.currentPickDeadline).toBe(commitDeadline.toISOString());
  });

  it('clears the deadline (in the transaction) and broadcasts null when the draft is paused', async () => {
    const { run, tx, txUpdateSet, mockNotifyDraftPickMade, mockOffload } =
      setup({ draftStatus: 'paused' });

    await run();

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(txUpdateSet).toHaveBeenCalledWith({ currentPickDeadline: null });
    const extras = mockNotifyDraftPickMade.mock.calls[0][10] as {
      currentPickDeadline: string | null;
    };
    expect(extras.currentPickDeadline).toBeNull();
    // A paused draft must not have its deadline expired for auto-pick.
    expect(mockOffload).not.toHaveBeenCalled();
  });

  it('does neither offload nor push when the pick completes the draft', async () => {
    const { run, mockOffload, mockNotifyOnTheClock } = setup({
      draftStatus: 'in-progress',
      isDraftComplete: true,
    });

    await run();

    expect(mockOffload).not.toHaveBeenCalled();
    expect(mockNotifyOnTheClock).not.toHaveBeenCalled();
  });
});

export {};
