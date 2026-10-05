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
  /** `draft_participants.id` — picks are keyed by seat since LS-10074. */
  participantId: number;
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
 * Reconstruct the static SQL text from a drizzle-orm `sql` object.
 *
 * `String(sqlObject)` yields "[object Object]", so `execute` mocks cannot
 * route on query content that way. Drizzle stores the literal SQL fragments
 * in `queryChunks` as `StringChunk` objects (each with a `value: string[]`),
 * interleaved with raw param values. Concatenating the StringChunk values
 * gives back the static query text we can match against.
 */
function sqlText(sqlObject: unknown): string {
  const chunks = (sqlObject as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return String(sqlObject);
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown })?.value;
      return Array.isArray(value) ? value.join('') : '';
    })
    .join('');
}

/**
 * Load the make-draft-pick module with all dependencies mocked and
 * return the captured resolver function + key mocks for assertions.
 */
function setupResolver(options: {
  existingOwnPick?: DraftPickRow | null;
  nextPickInfoForIdempotent?: {
    draftId: number;
    teamId: number | null;
    participantId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
    isComplete: boolean;
  } | null;
  /**
   * Whether the team that picks AFTER the human has auto-pick enabled. Drives
   * the LS-8107 offload path (deadline expiry + autoProcessDraftPicks nudge).
   */
  nextTeamAutoPick?: boolean;
  /** Whether the seat making this pick has auto-pick on (LS-10593). */
  pickingSeatAutoPick?: boolean;
  /**
   * Number of leading `context.db.transaction` invocations that should reject
   * with `transactionError` (default: a 57014 lock-wait timeout) before the
   * transaction is allowed to succeed. Used to test the LS-8476 retry loop.
   */
  transactionFailures?: number;
  /** Error thrown by the failing attempts above. Defaults to a 57014 SQLSTATE error. */
  transactionError?: Error;
  /** Whether isPlayerOnRoster should report the player as already kept (LS-8674). */
  isPlayerOnRoster?: boolean;
}) {
  jest.resetModules();

  let capturedFn: Resolver | undefined;

  const mockNotifyDraftPickMade = jest.fn().mockResolvedValue(undefined);
  const mockTriggerAutoProcessDraftPicks = jest.fn();
  const mockNotifyOnTheClock = jest.fn().mockResolvedValue([]);
  const mockSetSeatAutoPickById = jest.fn().mockResolvedValue(undefined);
  const mockNotificationPublisher = { publishToMany: jest.fn() };

  // The raw `drafts` row both phases read. Since LS-10074 it carries the
  // draft's own lifecycle status and kind — `leagues.draft_status` is no
  // longer what gates a pick — plus the host / control-all-teams columns the
  // mock-draft turn rule needs (LS-10076).
  const draftRow = {
    id: 1,
    league_id: 10,
    kind: 'league',
    status: 'in-progress',
    created_by: 7,
    control_all_teams: false,
    current_pick: 0,
    pick_time_limit_seconds: 60,
    selection_method: 'standard',
  };

  // The draft's rules. These used to be a `leagues` SELECT inside the
  // resolver; since LS-10074 they come from loadDraftRules, which answers for
  // a league draft and a league-less mock draft alike.
  const draftRules = {
    draftId: 1,
    kind: 'league',
    leagueId: 10,
    playerPool: 'all',
    baseballHofOnly: false,
    baseballEraFilter: 'all',
    customEraStartYear: null,
    customEraEndYear: null,
    minCareerGames: 0,
    minCareerSeasons: 0,
    maxRosterSize: 26,
    isMock: false,
    sport: 'baseball',
    gamesPerMatchup: 5,
    pitcherStartsPerMatchup: 1,
    rosterPositions: [],
  };

  // Current pick info (Phase 1 & Phase 2). The seat (`participantId`) is what
  // every "whose turn is it" comparison keys on since LS-10074; `teamId` is
  // the league team sitting in that seat.
  const currentPickInfo = {
    draftId: 1,
    teamId: 5,
    participantId: 55,
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
    participantId: 55,
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

  // The pick that follows the current one — returned by the idempotent
  // re-notification's getCurrentDraftPickInfo call so the WS payload carries a
  // real nextPick (LS-7977). Tests can override it via nextPickInfoForIdempotent.
  const nextPickInfo = options.nextPickInfoForIdempotent ?? {
    draftId: 1,
    teamId: 6,
    participantId: 66,
    round: 1,
    pickNumber: 2,
    overallPick: 2,
    isComplete: false,
  };

  // getCurrentDraftPickInfo is called three times: (1) Phase-1 pre-validation
  // and (2) the Phase-2 authoritative re-check both need the CURRENT pick (the
  // team whose turn it is — owned by memberRow), while (3) the idempotent path
  // fetches the NEXT pick for the re-sent notification.
  const mockGetCurrentDraftPickInfo = jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        mockGetCurrentDraftPickInfo.mock.calls.length <= 2
          ? currentPickInfo
          : nextPickInfo,
      ),
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
      participantId: 66,
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

  jest.doMock('@legacy-sports/db-client', () =>
    mockDbClientModule({
      createBadgeService: jest.fn(() => ({
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
      })),
      filterPlayerIdsByLeagueEligibility: jest
        .fn()
        .mockResolvedValue({ eligibleIds: new Set([42]) }),
      findFailedEligibilityRule: jest.fn().mockResolvedValue(null),
      PublicSchema: {
        leagues: { id: 'id', draftStatus: 'draftStatus' },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
        },
        draftPicks: {
          draftId: 'draftId',
          playerId: 'playerId',
          teamId: 'teamId',
          participantId: 'participantId',
          overallPick: 'overallPick',
        },
        drafts: { id: 'id', currentPickDeadline: 'currentPickDeadline' },
        players: { id: 'id' },
        playerEligiblePositions: { playerId: 'playerId', position: 'position' },
      },
    }),
  );

  jest.doMock('../types', () => ({ DraftPick: {} }));

  // LS-8107's offload looks up whether the seat on the clock next auto-picks
  // — by seat id rather than by team, since a mock-draft seat has no team
  // (LS-10076). Seats live in draft_participants and are read through this
  // module, which has its own coverage.
  jest.doMock('../participants', () => ({
    // Seat 55 is the one picking (LS-10593 auto-pick-off rule); any other
    // seat is the one up next (LS-8107 offload).
    getSeatById: jest.fn((_db: unknown, participantId: number) =>
      Promise.resolve(
        participantId === 55
          ? {
              id: 55,
              userId: null,
              autoPick: options.pickingSeatAutoPick ?? false,
            }
          : { id: participantId, autoPick: options.nextTeamAutoPick ?? false },
      ),
    ),
    setSeatAutoPickById: mockSetSeatAutoPickById,
  }));

  // Settings come from the rules loader rather than a leagues SELECT
  // (LS-10074); it has its own coverage.
  jest.doMock('../draft-rules', () => ({
    loadDraftRules: jest.fn().mockResolvedValue(draftRules),
  }));

  jest.doMock('../helpers', () => ({
    ALLOWED_POSITIONS_FOR_AUTO_PICK: {},
    commitDraftPick: mockCommitDraftPick,
    getCurrentDraftPickInfo: mockGetCurrentDraftPickInfo,
    getFirstQueuedPlayerForSeat: jest.fn().mockResolvedValue(null),
    getUnfilledPositionTypes: jest.fn().mockResolvedValue([]),
  }));

  // Avoid pulling in scheduled-mutations.ts's own heavy dependency graph
  // (candidate-pool, auto-pick-scorer, draft-pick-effects, builder) — reuse
  // the real describeDbError so the LS-8476 retry test exercises the actual
  // SQLSTATE-matching logic isLockWaitTimeout relies on in production.
  jest.doMock('../scheduled-mutations', () => {
    const { describeDbError } =
      require('../../leagues/delete-resilience') as typeof import('../../leagues/delete-resilience');
    return {
      isLockWaitTimeout: (error: unknown) =>
        describeDbError(error).code === '57014',
    };
  });

  jest.doMock('../../../services/roster-service', () => ({
    checkRosterCapacity: jest.fn().mockResolvedValue({ isFull: false }),
    isPlayerOnRoster: jest
      .fn()
      .mockResolvedValue(options.isPlayerOnRoster ?? false),
  }));

  jest.doMock('../../../services/activity-log', () => ({
    logDraftPickActivity: jest.fn().mockResolvedValue(undefined),
  }));

  // LS-10593: the on-the-clock push helper has its own coverage.
  jest.doMock('../on-the-clock-push', () => ({
    notifyOnTheClock: mockNotifyOnTheClock,
  }));

  jest.doMock('../trigger-auto-process', () => ({
    triggerAutoProcessDraftPicks: mockTriggerAutoProcessDraftPicks,
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
  // Phase 2 runs, in order:
  //   1. Lock the draft row (execute) — its `status` is the in-progress gate
  //   2. getCurrentDraftPickInfo (via helpers mock — handled by mockGetCurrentDraftPickInfo)
  //   3. existingOwnPick check (select) — returns idempotentPick or []
  //   4. existingPick (player already drafted) — unreachable if existingOwnPick found

  const mockTx = {
    execute: jest.fn().mockImplementation((sql: unknown) => {
      const str = sqlText(sql);
      if (str.includes('FOR NO KEY UPDATE')) {
        return Promise.resolve({ rows: [draftRow] });
      }
      return Promise.resolve({ rows: [] });
    }),
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        // Phase-2 select-chain order (no member or league lookup happens here
        // — membership is checked in Phase 1, and the settings come from the
        // rules loader): 1) existingOwnPick (idempotency re-check),
        // 2) existingPick (player-already-drafted).
        const call = mockTx.select.mock.calls.length;
        // existingOwnPick lookup
        if (call === 1)
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
      const str = sqlText(sql);
      if (str.includes('SELECT id, league_id')) {
        return Promise.resolve({ rows: [draftRow] });
      }
      return Promise.resolve({ rows: [] });
    }),
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => {
        // Phase-1 select-chain order: 1) the caller's league membership, read
        // by assertCallerIsOnTheClock's league branch (LS-10076), then 2) the
        // player row. The leagues SELECT that used to lead is gone — settings
        // come from the mocked rules loader.
        const call = mockDb.select.mock.calls.length;
        if (call === 1) return Promise.resolve([memberRow]);
        if (call === 2) return Promise.resolve([playerRow]);
        // The LS-8107 offload's next-seat auto-pick lookup no longer runs
        // here — it goes through the mocked participants module (LS-10074).
        return Promise.resolve([]);
      }),
      orderBy: jest.fn().mockResolvedValue([]),
    })),
    transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const callNumber = mockDb.transaction.mock.calls.length;
        if (callNumber <= (options.transactionFailures ?? 0)) {
          throw (
            options.transactionError ??
            Object.assign(
              new Error('canceling statement due to statement timeout'),
              { code: '57014' },
            )
          );
        }
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
    notificationPublisher: mockNotificationPublisher,
  };

  require('./make-draft-pick');

  if (!capturedFn) throw new Error('makeDraftPick resolver was not captured');

  return {
    resolve: capturedFn,
    ctx: mockCtx,
    currentPickInfo,
    mockNotifyDraftPickMade,
    mockGetCurrentDraftPickInfo,
    mockTriggerAutoProcessDraftPicks,
    mockCommitDraftPick,
    mockDb,
    idempotentPick,
    mockNotifyOnTheClock,
    mockNotificationPublisher,
    mockSetSeatAutoPickById,
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
      participantId: 66,
      round: 1,
      pickNumber: 2,
      overallPick: 2,
      isComplete: false,
    };
    const { resolve, ctx, mockNotifyDraftPickMade } = setupResolver({
      nextPickInfoForIdempotent: nextPickInfo,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    // notifyDraftPickMade's 10th argument is the nextPick object (the pick's
    // own seat was added as the 5th, LS-10074). It must reflect the real next
    // pick — not undefined (which would cause the frontend to prematurely set
    // draftComplete=true, LS-4286) — and carry the seat, which is the only
    // identifier a mock draft's next pick has.
    expect(mockNotifyDraftPickMade).toHaveBeenCalledWith(
      expect.anything(), // leagueId
      expect.anything(), // draftId
      expect.anything(), // pickId
      expect.anything(), // teamId
      expect.anything(), // participantId
      expect.anything(), // playerId
      expect.anything(), // round
      expect.anything(), // pickNumber
      expect.anything(), // overallPick
      expect.objectContaining({
        teamId: nextPickInfo.teamId,
        participantId: nextPickInfo.participantId,
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
    const { resolve, ctx, mockCommitDraftPick } = setupResolver({});

    // We verify commitDraftPick was NOT called (only getCurrentDraftPickInfo
    // is called for the idempotent path — no new pick is being made).
    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockCommitDraftPick).not.toHaveBeenCalled();
  });
});

describe('makeDraftPick — asynchronous auto-pick offload (LS-8107)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the human pick immediately without synchronously chaining auto-picks', async () => {
    // BEFORE LS-8107 this resolver ran the auto-pick chain inline, calling
    // commitDraftPick once per chained auto-pick (up to 10) before returning —
    // which is what made the response slow. AFTER the fix, only the human's
    // pick is committed synchronously; the chain is offloaded.
    const {
      resolve,
      ctx,
      mockTriggerAutoProcessDraftPicks,
      mockCommitDraftPick,
    } = setupResolver({
      existingOwnPick: null, // new (non-idempotent) pick
      nextTeamAutoPick: true,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockCommitDraftPick).toHaveBeenCalledTimes(1); // human pick only
    expect(mockTriggerAutoProcessDraftPicks).toHaveBeenCalledTimes(1);
    // Nudged by draft id as well as league id since LS-10076, so a
    // league-less mock draft is reachable too.
    expect(mockTriggerAutoProcessDraftPicks).toHaveBeenCalledWith({
      leagueId: 10,
      draftId: 1,
    });
  });

  it('expires the next team deadline and nudges autoProcessDraftPicks when the next team auto-picks', async () => {
    const { resolve, ctx, mockTriggerAutoProcessDraftPicks } = setupResolver({
      existingOwnPick: null,
      nextTeamAutoPick: true,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    // Deadline expiry is the only context.db.update on the non-complete path.
    expect(ctx.db.update).toHaveBeenCalledTimes(1);
    expect(mockTriggerAutoProcessDraftPicks).toHaveBeenCalledTimes(1);
  });

  it('does not nudge or expire the deadline when the next team is human-controlled', async () => {
    const { resolve, ctx, mockTriggerAutoProcessDraftPicks } = setupResolver({
      existingOwnPick: null,
      nextTeamAutoPick: false,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockTriggerAutoProcessDraftPicks).not.toHaveBeenCalled();
    expect(ctx.db.update).not.toHaveBeenCalled();
  });

  it('does not nudge for idempotent picks', async () => {
    // Idempotent picks must never advance the draft, so the offload path is
    // skipped entirely (guarded by !result.isIdempotentPick).
    const { resolve, ctx, mockTriggerAutoProcessDraftPicks } = setupResolver({
      nextTeamAutoPick: true,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockTriggerAutoProcessDraftPicks).not.toHaveBeenCalled();
  });
});

describe('makeDraftPick — draft row lock-wait retry (LS-8476 / LS-8475)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retries the transaction after a transient 57014 lock-wait timeout and succeeds', async () => {
    const { resolve, ctx, mockCommitDraftPick, mockNotifyDraftPickMade } =
      setupResolver({
        existingOwnPick: null,
        nextTeamAutoPick: false,
        transactionFailures: 1,
      });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(ctx.db.transaction).toHaveBeenCalledTimes(2);
    expect(mockCommitDraftPick).toHaveBeenCalledTimes(1);
    expect(mockNotifyDraftPickMade).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-lock-wait transaction error', async () => {
    const { resolve, ctx, mockCommitDraftPick } = setupResolver({
      existingOwnPick: null,
      nextTeamAutoPick: false,
      transactionFailures: 1,
      transactionError: Object.assign(new Error('deadlock detected'), {
        code: '40P01',
      }),
    });

    await expect(
      resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined),
    ).rejects.toThrow('deadlock detected');

    expect(ctx.db.transaction).toHaveBeenCalledTimes(1);
    expect(mockCommitDraftPick).not.toHaveBeenCalled();
  });

  it('gives up and throws once lock-wait retries are exhausted', async () => {
    const { resolve, ctx, mockCommitDraftPick } = setupResolver({
      existingOwnPick: null,
      nextTeamAutoPick: false,
      transactionFailures: 3, // exceeds MAX_PICK_LOCK_ATTEMPTS (3 total attempts)
    });

    await expect(
      resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined),
    ).rejects.toThrow('canceling statement due to statement timeout');

    expect(ctx.db.transaction).toHaveBeenCalledTimes(3);
    expect(mockCommitDraftPick).not.toHaveBeenCalled();
  });
});

describe('makeDraftPick — keeper roster guard (LS-8674)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws BAD_USER_INPUT when the player is already rostered as a keeper', async () => {
    const { resolve, ctx, mockCommitDraftPick } = setupResolver({
      existingOwnPick: null,
      isPlayerOnRoster: true,
    });

    await expect(
      resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined),
    ).rejects.toMatchObject({
      message: 'Player is already rostered as a keeper in this league',
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(mockCommitDraftPick).not.toHaveBeenCalled();
  });
});

describe('makeDraftPick — on-the-clock push (LS-10593)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('pushes the seat now on the clock after a new pick', async () => {
    const { resolve, ctx, mockNotifyOnTheClock, mockNotificationPublisher } =
      setupResolver({ existingOwnPick: null });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockNotifyOnTheClock).toHaveBeenCalledWith(
      ctx.db,
      mockNotificationPublisher,
      { draftId: 1, leagueId: 10, participantId: 66, round: 1, pickNumber: 2 },
    );
  });

  it('does not re-push for an idempotent re-submit', async () => {
    const { resolve, ctx, mockNotifyOnTheClock } = setupResolver({});

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockNotifyOnTheClock).not.toHaveBeenCalled();
  });
});

describe("makeDraftPick — a manager's own pick turns their auto-pick off (LS-10593)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('turns off auto-pick when the seat owner picks manually', async () => {
    const { resolve, ctx, mockSetSeatAutoPickById } = setupResolver({
      existingOwnPick: null,
      pickingSeatAutoPick: true,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockSetSeatAutoPickById).toHaveBeenCalledTimes(1);
    expect(mockSetSeatAutoPickById).toHaveBeenCalledWith(
      expect.anything(),
      55,
      false,
    );
  });

  it('leaves auto-pick alone when it was already off', async () => {
    const { resolve, ctx, mockSetSeatAutoPickById } = setupResolver({
      existingOwnPick: null,
      pickingSeatAutoPick: false,
    });

    await resolve({}, { draftId: 1, playerId: 42 }, ctx, undefined);

    expect(mockSetSeatAutoPickById).not.toHaveBeenCalled();
  });
});

export {};
