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
  isPlayerInPool?: jest.Mock;
  playerMeetsMinCareerGames?: jest.Mock;
  playerMeetsMinCareerSeasons?: jest.Mock;
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
    isPlayerInPool:
      overrides?.isPlayerInPool ?? jest.fn().mockResolvedValue(true),
    playerMeetsMinCareerGames:
      overrides?.playerMeetsMinCareerGames ?? jest.fn().mockResolvedValue(true),
    playerMeetsMinCareerSeasons:
      overrides?.playerMeetsMinCareerSeasons ??
      jest.fn().mockResolvedValue(true),
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
  let mockIsPlayerInPool: jest.Mock;
  let mockPlayerMeetsMinCareerGames: jest.Mock;
  let mockPlayerMeetsMinCareerSeasons: jest.Mock;

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
    mockIsPlayerInPool = jest.fn().mockResolvedValue(true);
    mockPlayerMeetsMinCareerGames = jest.fn().mockResolvedValue(true);
    mockPlayerMeetsMinCareerSeasons = jest.fn().mockResolvedValue(true);

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
      isPlayerInPool: mockIsPlayerInPool,
      playerMeetsMinCareerGames: mockPlayerMeetsMinCareerGames,
      playerMeetsMinCareerSeasons: mockPlayerMeetsMinCareerSeasons,
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
      hofOnly: false,
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
