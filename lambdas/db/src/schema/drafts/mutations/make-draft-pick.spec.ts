/**
 * Unit tests for makeDraftPick resolver
 *
 * Regression coverage for LS-7977: idempotent pick re-notification.
 *
 * When an idempotent pick is detected (same player already committed for
 * this slot), the WS notification must still be sent using the actual
 * nextPickInfo from the DB — not suppressed entirely. Suppressing it means
 * observers who missed the original broadcast never learn about the pick.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Types ───────────────────────────────────────────────────────────────────

interface DraftPickRow {
  id: number;
  draftId: number;
  teamId: number;
  playerId: number;
  overallPick: number;
  round: number;
  pickNumber: number;
  pickedAt: Date;
}

interface Resolver {
  (...args: unknown[]): Promise<unknown>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal Drizzle-like query chain that resolves to `rows`.
 * Supports `.select().from().where().limit()` and plain `.select().from()`.
 */
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
    orderBy: jest.fn().mockResolvedValue(rows),
  };
  return jest.fn(() => chain);
}

/**
 * Load the make-draft-pick module with all dependencies mocked and
 * return the captured resolver function + key mocks for assertions.
 */
function setupResolver(options: {
  existingOwnPick?: DraftPickRow | null;
  nextPickInfoForIdempotent?: {
    draftId: number;
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
    isComplete: boolean;
  } | null;
}) {
  jest.resetModules();

  let capturedFn: Resolver | undefined;

  const mockNotifyDraftPickMade = jest.fn().mockResolvedValue(undefined);

  // Phase-1 draft row
  const draftRow = {
    id: 1,
    league_id: 10,
    current_pick: 0,
    pick_time_limit_seconds: 60,
    selection_method: 'standard',
  };

  // League row
  const leagueRow = {
    id: 10,
    draftStatus: 'in-progress',
    playerPool: 'all',
    baseballHofOnly: false,
    baseballEraFilter: 'all',
    customEraStartYear: null,
    customEraEndYear: null,
    minCareerGames: 0,
    minCareerSeasons: 0,
    maxRosterSize: 26,
    isMockDraft: false,
    sport: 'baseball',
    gamesPerMatchup: 5,
    pitcherStartsPerMatchup: 1,
  };

  // Current pick info (Phase 1 & Phase 2)
  const currentPickInfo = {
    draftId: 1,
    teamId: 5,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    isComplete: false,
  };

  // The idempotent pick row already in the DB
  const idempotentPick: DraftPickRow = options.existingOwnPick ?? {
    id: 99,
    draftId: 1,
    teamId: 5,
    playerId: 42,
    overallPick: 1,
    round: 1,
    pickNumber: 1,
    pickedAt: new Date(),
  };

  // League member (team owner)
  const memberRow = { teamId: 5, leagueId: 10, userId: 7 };

  // Player
  const playerRow = { id: 42, hallOfFame: false, sport: 'baseball' };

  const mockGetCurrentDraftPickInfo = jest.fn().mockResolvedValue(
    options.nextPickInfoForIdempotent ?? {
      draftId: 1,
      teamId: 6,
      round: 1,
      pickNumber: 2,
      overallPick: 2,
      isComplete: false,
    },
  );

  const mockCommitDraftPick = jest.fn().mockResolvedValue({
    draftPick: {
      id: 100,
      ...currentPickInfo,
      playerId: 42,
      pickedAt: new Date(),
    },
    isDraftComplete: false,
    nextDeadline: new Date(Date.now() + 60_000),
    nextPickInfo: {
      draftId: 1,
      teamId: 6,
      round: 1,
      pickNumber: 2,
      overallPick: 2,
      isComplete: false,
    },
    now: new Date(),
  });

  jest.doMock('../../builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({ implement: jest.fn() })),
      inputType: jest.fn(() => ({ implement: jest.fn() })),
      objectType: jest.fn(),
      queryField: jest.fn(),
      mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: { resolve: Resolver }) => {
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
    filterPlayerIdsByLeagueEligibility: jest
      .fn()
      .mockResolvedValue({ eligibleIds: new Set([42]) }),
    findFailedEligibilityRule: jest.fn().mockResolvedValue(null),
    PublicSchema: {
      leagues: { id: 'id', draftStatus: 'draftStatus' },
      leagueMembers: { leagueId: 'leagueId', userId: 'userId' },
      draftPicks: {
        draftId: 'draftId',
        playerId: 'playerId',
        teamId: 'teamId',
        overallPick: 'overallPick',
      },
      draftTeams: {
        draftId: 'draftId',
        teamId: 'teamId',
        autoPick: 'autoPick',
      },
      players: { id: 'id' },
      playerEligiblePositions: { playerId: 'playerId', position: 'position' },
    },
  }));

  jest.doMock('../types', () => ({ DraftPick: {} }));

  jest.doMock('../helpers', () => ({
    ALLOWED_POSITIONS_FOR_AUTO_PICK: {},
    commitDraftPick: mockCommitDraftPick,
    getCurrentDraftPickInfo: mockGetCurrentDraftPickInfo,
    getFirstQueuedPlayerForTeam: jest.fn().mockResolvedValue(null),
    getUnfilledPositionTypes: jest.fn().mockResolvedValue([]),
  }));

  jest.doMock('../../../services/roster-service', () => ({
    checkRosterCapacity: jest.fn().mockResolvedValue({ isFull: false }),
  }));

  jest.doMock('../../../services/activity-log', () => ({
    logDraftPickActivity: jest.fn().mockResolvedValue(undefined),
  }));

  jest.doMock('../../matchups/mutations', () => ({
    createAllMatchupsForLeague: jest
      .fn()
      .mockResolvedValue({ matchupCount: 0 }),
  }));

  jest.doMock('../../graphql-errors', () => ({
    AuthenticationError: (msg: string) => {
      const err = new Error(msg);
      Object.assign(err, { extensions: { code: 'UNAUTHENTICATED' } });
      return err;
    },
    ForbiddenError: (msg: string) => {
      const err = new Error(msg);
      Object.assign(err, { extensions: { code: 'FORBIDDEN' } });
      return err;
    },
    UserInputError: (msg: string) => {
      const err = new Error(msg);
      Object.assign(err, { extensions: { code: 'BAD_USER_INPUT' } });
      return err;
    },
  }));

  // Build a mock transaction that simulates the idempotent-pick inner path.
  // The tx.select().from().where().limit() chain is called multiple times:
  //   1. Lock the draft row (execute)
  //   2. Re-fetch league (select chain)
  //   3. getCurrentDraftPickInfo (via helpers mock — handled by mockGetCurrentDraftPickInfo)
  //   4. existingOwnPick check — returns idempotentPick or []
  //   5. existingPick (player already drafted) — unreachable if existingOwnPick found

  const mockTx = {
    execute: jest.fn().mockImplementation((sql: unknown) => {
      const str = String(sql);
      if (str.includes('FOR NO KEY UPDATE')) {
        return Promise.resolve({ rows: [draftRow] });
      }
      return Promise.resolve({ rows: [] });
    }),
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        // Return league row, then member row, etc. based on call order.
        // Because we can't easily distinguish callers, we use a counter.
        const call = mockTx.select.mock.calls.length;
        if (call === 1) return Promise.resolve([leagueRow]);
        if (call === 2) return Promise.resolve([memberRow]);
        // existingOwnPick lookup
        if (call === 3)
          return Promise.resolve(
            options.existingOwnPick !== undefined
              ? options.existingOwnPick
                ? [options.existingOwnPick]
                : []
              : [idempotentPick],
          );
        return Promise.resolve([]);
      }),
      orderBy: jest.fn().mockResolvedValue([]),
    })),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([idempotentPick]),
    }),
  };

  // Context db: Phase-1 uses context.db.execute + select chains.
  const mockDb = {
    execute: jest.fn().mockImplementation((sql: unknown) => {
      const str = String(sql);
      if (str.includes('SELECT id, league_id')) {
        return Promise.resolve({ rows: [draftRow] });
      }
      return Promise.resolve({ rows: [] });
    }),
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        const call = mockDb.select.mock.calls.length;
        if (call === 1) return Promise.resolve([leagueRow]);
        if (call === 2) return Promise.resolve([memberRow]);
        if (call === 3) return Promise.resolve([playerRow]);
        return Promise.resolve([]);
      }),
      orderBy: jest.fn().mockResolvedValue([]),
    })),
    transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(mockTx);
      }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(undefined),
    }),
  };

  const mockCtx = {
    user: { id: 7, username: 'tester' },
    db: mockDb,
    notificationService: {
      notifyDraftPickMade: mockNotifyDraftPickMade,
      notifyDraftCompleted: jest.fn().mockResolvedValue(undefined),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./make-draft-pick');

  if (!capturedFn) throw new Error('makeDraftPick resolver was not captured');

  return {
    resolve: capturedFn,
    ctx: mockCtx,
    currentPickInfo,
    mockNotifyDraftPickMade,
    mockGetCurrentDraftPickInfo,
    idempotentPick,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('makeDraftPick — idempotent pick re-notification (LS-7977)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls notifyDraftPickMade when an idempotent pick is detected', async () => {
    const { resolve, ctx, mockNotifyDraftPickMade } = setupResolver({});

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockNotifyDraftPickMade).toHaveBeenCalledTimes(1);
  });

  it('includes the actual nextPick info in the notification for idempotent picks', async () => {
    const nextPickInfo = {
      draftId: 1,
      teamId: 6,
      round: 1,
      pickNumber: 2,
      overallPick: 2,
      isComplete: false,
    };
    const { resolve, ctx, mockNotifyDraftPickMade } = setupResolver({
      nextPickInfoForIdempotent: nextPickInfo,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    // notifyDraftPickMade's 9th argument is the nextPick object.
    // It must reflect the real next pick — not undefined (which would cause
    // the frontend to prematurely set draftComplete=true, LS-4286).
    expect(mockNotifyDraftPickMade).toHaveBeenCalledWith(
      expect.anything(), // leagueId
      expect.anything(), // draftId
      expect.anything(), // pickId
      expect.anything(), // teamId
      expect.anything(), // playerId
      expect.anything(), // round
      expect.anything(), // pickNumber
      expect.anything(), // overallPick
      expect.objectContaining({
        teamId: nextPickInfo.teamId,
        round: nextPickInfo.round,
        pickNumber: nextPickInfo.pickNumber,
        overallPick: nextPickInfo.overallPick,
      }),
      expect.anything(), // options
    );
  });

  it('does not trigger auto-pick chaining for idempotent picks', async () => {
    // For an idempotent pick, `chainedNextPickInfo` must be null so the
    // auto-pick loop is skipped. We verify this indirectly: commitDraftPick
    // should not be called (since no new pick is being made).
    const { resolve, ctx } = setupResolver({});

    // commitDraftPick mock is in helpers — access via the mocked module.
    // We verify it was NOT called (only getCurrentDraftPickInfo is called
    // for the idempotent path).
    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const helpers = require('../helpers') as { commitDraftPick: jest.Mock };
    expect(helpers.commitDraftPick).not.toHaveBeenCalled();
  });
});
