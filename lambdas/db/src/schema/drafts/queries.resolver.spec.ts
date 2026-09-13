/**
 * Resolver-level tests for draft queue queries (LS-2501).
 *
 * Exercises `getMyDraftQueue` authorization: only the league general manager
 * may read the draft queue. Assistant managers / co-managers (any role other
 * than `general_manager`) must be denied even though they have a valid
 * `leagueMembers` row, because the queue exposes private strategic data.
 */

import type { GraphQLSchema } from 'graphql';

describe('getMyDraftQueue resolver — LS-2501 authorization', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    orderBy: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
      ),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      PublicSchema: {
        drafts: {
          id: 'id',
          leagueId: 'leagueId',
          kind: 'kind',
          status: 'status',
        },
        // Seats replaced draft_teams for the draft domain (LS-10074).
        draftParticipants: {
          id: 'id',
          draftId: 'draftId',
          slot: 'slot',
          teamId: 'teamId',
          leagueId: 'leagueId',
          userId: 'userId',
          controller: 'controller',
          seatName: 'seatName',
          autoPick: 'autoPick',
        },

        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        draftQueue: {
          draftId: 'draftId',
          teamId: 'teamId',
          priority: 'priority',
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
      BADGE_DEFINITIONS: [],
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 42, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().getMyDraftQueue;
    if (!field?.resolve) throw new Error('getMyDraftQueue resolver not found');
    return field.resolve;
  }

  it('denies a non-GM league member (assistant manager) — strategy leak guard', async () => {
    // Draft lookup → exists; membership lookup → assistant_manager role.
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'assistant_manager' },
      ]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Only the team general manager can view this draft queue',
      extensions: { code: 'FORBIDDEN' },
    });

    // Critical: the queue rows must never be selected when authorization fails.
    expect(mockDb.orderBy).not.toHaveBeenCalled();
  });

  it('denies a co-manager role for the same reason', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([{ teamId: 11, permissionLevel: 'co_manager' }]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Only the team general manager can view this draft queue',
      extensions: { code: 'FORBIDDEN' },
    });
    expect(mockDb.orderBy).not.toHaveBeenCalled();
  });

  it('allows the general_manager to read the queue', async () => {
    const queueRows = [
      { draftId: 100, teamId: 11, playerId: 5, priority: 1 },
      { draftId: 100, teamId: 11, playerId: 9, priority: 2 },
    ];
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ])
      // authorizeDraft resolves the caller's seat once membership is
      // known (LS-10074).
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);
    mockDb.orderBy.mockResolvedValueOnce(queueRows);

    const resolve = getResolver();

    const result = await resolve(
      {},
      { draftId: 100 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(queueRows);
  });

  it('rejects unauthenticated callers with UNAUTHENTICATED', async () => {
    const resolve = getResolver();
    const unauthContext = { user: null, db: mockDb };

    await expect(
      resolve({}, { draftId: 100 }, unauthContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects when the draft does not exist with BAD_USER_INPUT', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 999 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Draft not found',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('rejects with FORBIDDEN when the caller is not in the league', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'You are not in this league',
      extensions: { code: 'FORBIDDEN' },
    });
  });
});

/**
 * Resolver-level tests for `getDraftTeamAutoPickStatuses` resilience (LS-8287).
 *
 * This query refetches after every pick event on the live draft board, so it
 * races concurrent writes to draft_teams. A single production occurrence
 * (Rollbar #171) surfaced as a masked "Internal server error". These tests
 * assert the two-part fix:
 *   1. A transient Postgres failure (deadlock / serialization / lock-timeout)
 *      is retried and recovers silently — no error reaches the client.
 *   2. A non-transient DB failure is re-thrown with the stable, client-facing
 *      `DRAFT_AUTO_PICK_STATUS_FAILED` code (carrying the SQLSTATE) instead of
 *      the formatter's opaque generic 500, so occurrences are self-diagnosing.
 *   3. Typed client-facing errors (auth / not-found / forbidden) are preserved.
 */
describe('getDraftTeamAutoPickStatuses resolver — LS-8287 resilience', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
      ),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      PublicSchema: {
        drafts: {
          id: 'id',
          leagueId: 'leagueId',
          kind: 'kind',
          status: 'status',
        },
        // Seats replaced draft_teams for the draft domain (LS-10074).
        draftParticipants: {
          id: 'id',
          draftId: 'draftId',
          slot: 'slot',
          teamId: 'teamId',
          leagueId: 'leagueId',
          userId: 'userId',
          controller: 'controller',
          seatName: 'seatName',
          autoPick: 'autoPick',
        },

        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
      BADGE_DEFINITIONS: [],
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 42, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().getDraftTeamAutoPickStatuses;
    if (!field?.resolve) {
      throw new Error('getDraftTeamAutoPickStatuses resolver not found');
    }
    return field.resolve;
  }

  /** A Postgres error carrying a SQLSTATE `code`, as postgres.js throws. */
  function pgError(message: string, code: string): Error {
    return Object.assign(new Error(message), { code });
  }

  it('returns auto-pick statuses on the happy path', async () => {
    const rows = [
      { teamId: 11, autoPick: true },
      { teamId: 12, autoPick: false },
    ];
    // draft lookup where → chain; membership where → chain; seat where →
    // chain (authorizeDraft resolves the caller's seat since LS-10074);
    // rows where → terminal.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce(rows);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ])
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);

    const resolve = getResolver();

    const result = await resolve(
      {},
      { draftId: 100 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(rows);
  });

  it('retries a transient DB error and recovers without surfacing an error', async () => {
    const rows = [{ teamId: 11, autoPick: true }];
    // draft where → chain; membership where → chain; seat where → chain;
    // rows where attempt 1 → deadlock (40P01, retryable); rows where
    // attempt 2 → success.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockRejectedValueOnce(pgError('deadlock detected', '40P01'))
      .mockResolvedValueOnce(rows);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ])
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);

    const resolve = getResolver();

    const result = await resolve(
      {},
      { draftId: 100 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(rows);
    // The rows read was attempted twice: initial failure + successful retry.
    expect(mockDb.where).toHaveBeenCalledTimes(5);
  });

  it('re-throws a non-transient DB error with a diagnosable client-facing code (no mask)', async () => {
    // rows read fails with a statement timeout (57014) — not retryable.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockRejectedValueOnce(
        pgError('canceling statement due to statement timeout', '57014'),
      );
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ])
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Failed to load auto-pick statuses (database error 57014)',
      extensions: { code: 'DRAFT_AUTO_PICK_STATUS_FAILED' },
    });
    // Non-transient error must NOT be retried.
    expect(mockDb.where).toHaveBeenCalledTimes(4);
  });

  it('rejects unauthenticated callers with UNAUTHENTICATED', async () => {
    const resolve = getResolver();
    const unauthContext = { user: null, db: mockDb };

    await expect(
      resolve({}, { draftId: 100 }, unauthContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('preserves BAD_USER_INPUT when the draft does not exist', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 999 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Draft not found',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('preserves FORBIDDEN when the caller is not a league member', async () => {
    mockDb.where.mockReturnValueOnce(mockDb).mockReturnValueOnce(mockDb);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'User is not a member of this league',
      extensions: { code: 'FORBIDDEN' },
    });
  });
});

/**
 * Resolver-level tests for `getCurrentDraftPick` (LS-4853).
 *
 * `getCurrentDraftPickInfo` throws a plain `Error('No teams configured for
 * this draft')` while a draft exists but hasn't been initialized yet (the
 * window between league creation and `initializeDraft` populating
 * `draft_teams`) — an expected, client-visible state, not a system failure.
 * Because a plain `Error` carries no client-facing `extensions.code`, Apollo's
 * `formatError` was scrubbing the message to a generic "Internal server
 * error" and reporting it to Rollbar. These tests assert the resolver
 * converts that specific message into a `DRAFT_TEAMS_NOT_CONFIGURED`
 * `GraphQLError` (message preserved, so the client's existing
 * `draftOrderMissing` handling keeps working) while any other error from the
 * helper is re-thrown unchanged.
 */
describe('getCurrentDraftPick resolver — LS-4853', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };
  let mockGetCurrentDraftPickInfo: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    mockGetCurrentDraftPickInfo = jest.fn();

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
      ),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      PublicSchema: {
        drafts: {
          id: 'id',
          leagueId: 'leagueId',
          kind: 'kind',
          status: 'status',
        },
        // Seats replaced draft_teams for the draft domain (LS-10074).
        draftParticipants: {
          id: 'id',
          draftId: 'draftId',
          slot: 'slot',
          teamId: 'teamId',
          leagueId: 'leagueId',
          userId: 'userId',
          controller: 'controller',
          seatName: 'seatName',
          autoPick: 'autoPick',
        },

        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
      BADGE_DEFINITIONS: [],
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    jest.doMock('./helpers', () => ({
      ...jest.requireActual('./helpers'),
      getCurrentDraftPickInfo: mockGetCurrentDraftPickInfo,
    }));

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 42, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().getCurrentDraftPick;
    if (!field?.resolve) {
      throw new Error('getCurrentDraftPick resolver not found');
    }
    return field.resolve;
  }

  it('converts the "no teams configured" Error into a client-facing GraphQLError', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 11 },
      ])
      // authorizeDraft resolves the caller's seat once membership is
      // known (LS-10074).
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);
    mockGetCurrentDraftPickInfo.mockRejectedValueOnce(
      new Error('No teams configured for this draft'),
    );

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'No teams configured for this draft',
      extensions: { code: 'DRAFT_TEAMS_NOT_CONFIGURED' },
    });
  });

  it('re-throws any other helper error unchanged', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 11 },
      ])
      // authorizeDraft resolves the caller's seat once membership is
      // known (LS-10074).
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);
    mockGetCurrentDraftPickInfo.mockRejectedValueOnce(
      new Error('Could not determine team for current pick'),
    );

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Could not determine team for current pick',
    });
  });

  it('returns the pick info unchanged on the happy path', async () => {
    const pickInfo = {
      draftId: 100,
      teamId: 11,
      round: 1,
      pickNumber: 1,
      overallPick: 1,
      isComplete: false,
    };
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { permissionLevel: 'general_manager', teamId: 11 },
      ])
      // authorizeDraft resolves the caller's seat once membership is
      // known (LS-10074).
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);
    mockGetCurrentDraftPickInfo.mockResolvedValueOnce(pickInfo);

    const resolve = getResolver();

    const result = await resolve(
      {},
      { draftId: 100 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(pickInfo);
  });
});

/**
 * Resolver-level tests for `getDraftPicks` resilience (LS-8397).
 *
 * This query refetches after every pick event on the live draft board, so it
 * races the concurrent `makeDraftPick` write to `draft_picks`. A single
 * production occurrence (Rollbar #180) surfaced as a masked "Internal server
 * error" ~6s after a `player_selected` event. These tests assert the same
 * two-part fix applied to `getDraftTeamAutoPickStatuses` in LS-8287:
 *   1. A transient Postgres failure (deadlock / serialization / lock-timeout)
 *      is retried and recovers silently — no error reaches the client.
 *   2. A non-transient DB failure is re-thrown with the stable, client-facing
 *      `DRAFT_PICKS_LOAD_FAILED` code (carrying the SQLSTATE) instead of the
 *      formatter's opaque generic 500, so occurrences are self-diagnosing.
 *   3. Typed client-facing errors (auth / not-found / forbidden) are preserved.
 */
describe('getDraftPicks resolver — LS-8397 resilience', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    orderBy: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
      ),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      PublicSchema: {
        drafts: {
          id: 'id',
          leagueId: 'leagueId',
          kind: 'kind',
          status: 'status',
        },
        // Seats replaced draft_teams for the draft domain (LS-10074).
        draftParticipants: {
          id: 'id',
          draftId: 'draftId',
          slot: 'slot',
          teamId: 'teamId',
          leagueId: 'leagueId',
          userId: 'userId',
          controller: 'controller',
          seatName: 'seatName',
          autoPick: 'autoPick',
        },

        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        draftPicks: {
          draftId: 'draftId',
          overallPick: 'overallPick',
        },
        leagues: {
          id: 'id',
          isPublic: 'isPublic',
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
      BADGE_DEFINITIONS: [],
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 42, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const queryType = schema.getQueryType();
    const field = queryType?.getFields().getDraftPicks;
    if (!field?.resolve) {
      throw new Error('getDraftPicks resolver not found');
    }
    return field.resolve;
  }

  /** A Postgres error carrying a SQLSTATE `code`, as postgres.js throws. */
  function pgError(message: string, code: string): Error {
    return Object.assign(new Error(message), { code });
  }

  it('returns draft picks on the happy path', async () => {
    const rows = [
      { id: 1, draftId: 100, overallPick: 1, teamId: 11, playerId: 5 },
      { id: 2, draftId: 100, overallPick: 2, teamId: 12, playerId: 9 },
    ];
    // draft lookup → chain; membership lookup → chain; picks read → terminal.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ])
      // authorizeDraft resolves the caller's seat once membership is
      // known (LS-10074).
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);
    mockDb.orderBy.mockResolvedValueOnce(rows);

    const resolve = getResolver();

    const result = await resolve(
      {},
      { draftId: 100 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(rows);
  });

  it('retries a transient DB error and recovers without surfacing an error', async () => {
    const rows = [{ id: 1, draftId: 100, overallPick: 1 }];
    // draft where → chain; membership where → chain; picks where → chain;
    // picks orderBy attempt 1 → deadlock (40P01, retryable); attempt 2 →
    // success.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ])
      // authorizeDraft resolves the caller's seat once membership is
      // known (LS-10074).
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);
    mockDb.orderBy
      .mockRejectedValueOnce(pgError('deadlock detected', '40P01'))
      .mockResolvedValueOnce(rows);

    const resolve = getResolver();

    const result = await resolve(
      {},
      { draftId: 100 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(rows);
    // The picks read was attempted twice: initial failure + successful retry.
    expect(mockDb.orderBy).toHaveBeenCalledTimes(2);
  });

  it('re-throws a non-transient DB error with a diagnosable client-facing code (no mask)', async () => {
    // picks read fails with a statement timeout (57014) — not retryable.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ])
      // authorizeDraft resolves the caller's seat once membership is
      // known (LS-10074).
      .mockResolvedValueOnce([
        { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
      ]);
    mockDb.orderBy.mockRejectedValueOnce(
      pgError('canceling statement due to statement timeout', '57014'),
    );

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Failed to load draft picks (database error 57014)',
      extensions: { code: 'DRAFT_PICKS_LOAD_FAILED' },
    });
    // Non-transient error must NOT be retried.
    expect(mockDb.orderBy).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated callers with UNAUTHENTICATED', async () => {
    const resolve = getResolver();
    const unauthContext = { user: null, db: mockDb };

    await expect(
      resolve({}, { draftId: 100 }, unauthContext, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('preserves BAD_USER_INPUT when the draft does not exist', async () => {
    mockDb.where.mockReturnValueOnce(mockDb);
    mockDb.limit.mockResolvedValueOnce([]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 999 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Draft not found',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('preserves FORBIDDEN when the caller is not a member and the league is private', async () => {
    // draft lookup → exists; membership lookup → none; league lookup
    // (spectator check, LS-8939) → private.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ isPublic: false }]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'User is not a member of this league',
      extensions: { code: 'FORBIDDEN' },
    });
  });
});

/**
 * LS-8939 — spectator read access matrix.
 *
 * `verifyLeagueReadAccess` lets signed-in non-members read draft data for
 * public leagues (`leagues.is_public`) as spectators, mirroring the
 * `league(id)` resolver precedent. This matrix asserts:
 *   1. non-member × public league succeeds on every spectator read-set query;
 *   2. non-member × private league is still FORBIDDEN on all of them;
 *   3. member behavior is unchanged (no league-visibility lookup is issued);
 *   4. member-only operations (draft queue, recommendations, auto-pick
 *      statuses, mutations) stay member-only even for public leagues.
 */
describe('spectator read access — LS-8939 access matrix', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    orderBy: jest.Mock;
    innerJoin: jest.Mock;
    leftJoin: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: typeof mockDb;
  };

  const DRAFT_ROW = { id: 100, leagueId: 7 };
  const CURRENT_PICK_SENTINEL = { overallPick: 3, teamId: 11 };
  const PICK_ROWS = [{ id: 1, draftId: 100, overallPick: 1, teamId: 11 }];
  const TEAM_ORDER_ROWS = [{ teamId: 11, draftOrder: 1, teamName: 'Sluggers' }];
  const TEAM_ROWS = [{ id: 11, name: 'Sluggers', leagueId: 7, managerId: 9 }];
  const POSITION_ROWS = [{ id: 1, leagueId: 7, positionType: 'C' }];
  const TEAM_MEMBER_ROWS = [
    { id: 5, teamId: 11, leagueId: 7, playerId: 33, positionId: 1 },
  ];

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(
        async (_opts: unknown, cb: (db: unknown) => unknown) => cb(mockDb),
      ),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      PublicSchema: {
        drafts: {
          id: 'id',
          leagueId: 'leagueId',
          kind: 'kind',
          status: 'status',
          createdAt: 'createdAt',
        },
        // Seats replaced draft_teams for the draft domain (LS-10074).
        draftParticipants: {
          id: 'id',
          draftId: 'draftId',
          slot: 'slot',
          teamId: 'teamId',
          leagueId: 'leagueId',
          userId: 'userId',
          controller: 'controller',
          seatName: 'seatName',
          autoPick: 'autoPick',
        },

        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        leagues: { id: 'id', isPublic: 'isPublic' },
        draftPicks: {
          id: 'id',
          draftId: 'draftId',
          overallPick: 'overallPick',
          playerId: 'playerId',
          teamId: 'teamId',
        },
        teams: {
          id: 'id',
          name: 'name',
          leagueId: 'leagueId',
          divisionId: 'divisionId',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
          waiverOrder: 'waiverOrder',
          faabBudget: 'faabBudget',
          logoUrl: 'logoUrl',
          primaryColor: 'primaryColor',
          secondaryColor: 'secondaryColor',
          isLocked: 'isLocked',
          avatarUrl: 'avatarUrl',
          bannerUrl: 'bannerUrl',
        },
        leaguePosition: {
          id: 'id',
          leagueId: 'leagueId',
          positionType: 'positionType',
        },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
          positionId: 'positionId',
          onTradeBlock: 'onTradeBlock',
          salary: 'salary',
          nickname: 'nickname',
        },
        draftQueue: {
          draftId: 'draftId',
          teamId: 'teamId',
          priority: 'priority',
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
      BADGE_DEFINITIONS: [],
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
    }));

    // getCurrentDraftPick delegates its data read to a helper with its own
    // query chain — stub just that helper so the guard behavior stays real.
    jest.doMock('./helpers', () => ({
      ...jest.requireActual('./helpers'),
      getCurrentDraftPickInfo: jest
        .fn()
        .mockResolvedValue(CURRENT_PICK_SENTINEL),
    }));

    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 42, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function queryResolver(name: string) {
    const field = schema.getQueryType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} query resolver not found`);
    return field.resolve;
  }

  function mutationResolver(name: string) {
    const field = schema.getMutationType()?.getFields()[name];
    if (!field?.resolve) throw new Error(`${name} mutation resolver not found`);
    return field.resolve;
  }

  /**
   * One row per spectator read-set resolver.
   * - `preGuardLimits`: `.limit()` results consumed before the access guard
   *   runs (draft / team lookups).
   * - `primeData`: queues the post-guard data-read results.
   * - `expected`: resolver result on the success paths.
   */
  /**
   * Fields whose guard is authorizeDraft (LS-10074), which resolves the
   * caller's seat after membership — one extra `.limit` read. getLeagueDraft
   * still guards on the league (it must answer null when a league has no
   * draft yet), and leagueTeams is not a draft resolver at all.
   */
  const SEAT_READING_FIELDS = new Set([
    'getDraft',
    'getCurrentDraftPick',
    'getDraftPicks',
    'getDraftTeamOrder',
  ]);

  const READ_SET: Array<{
    field: string;
    args: Record<string, unknown>;
    preGuardLimits: unknown[][];
    primeData: () => void;
    postGuardLimits: number;
    expected: unknown;
  }> = [
    {
      field: 'getDraft',
      args: { draftId: 100 },
      preGuardLimits: [[DRAFT_ROW]],
      primeData: () => undefined,
      postGuardLimits: 0,
      expected: DRAFT_ROW,
    },
    {
      field: 'getLeagueDraft',
      args: { leagueId: 7 },
      preGuardLimits: [],
      primeData: () => mockDb.limit.mockResolvedValueOnce([DRAFT_ROW]),
      postGuardLimits: 1,
      expected: DRAFT_ROW,
    },
    {
      field: 'getCurrentDraftPick',
      args: { draftId: 100 },
      preGuardLimits: [[{ leagueId: 7 }]],
      primeData: () => undefined,
      postGuardLimits: 0,
      expected: CURRENT_PICK_SENTINEL,
    },
    {
      field: 'getDraftPicks',
      args: { draftId: 100 },
      preGuardLimits: [[{ leagueId: 7 }]],
      primeData: () => mockDb.orderBy.mockResolvedValueOnce(PICK_ROWS),
      postGuardLimits: 0,
      expected: PICK_ROWS,
    },
    {
      field: 'getDraftTeamOrder',
      args: { draftId: 100 },
      preGuardLimits: [[{ leagueId: 7 }]],
      primeData: () => mockDb.orderBy.mockResolvedValueOnce(TEAM_ORDER_ROWS),
      postGuardLimits: 0,
      expected: TEAM_ORDER_ROWS,
    },
    {
      field: 'leagueTeams',
      args: { leagueId: 7 },
      preGuardLimits: [],
      primeData: () => mockDb.orderBy.mockResolvedValueOnce(TEAM_ROWS),
      postGuardLimits: 0,
      expected: TEAM_ROWS,
    },
    {
      field: 'leaguePositions',
      args: { leagueId: 7 },
      preGuardLimits: [],
      primeData: () => mockDb.orderBy.mockResolvedValueOnce(POSITION_ROWS),
      postGuardLimits: 0,
      expected: POSITION_ROWS,
    },
    {
      field: 'teamMembers',
      args: { teamId: 11 },
      preGuardLimits: [[{ leagueId: 7 }]],
      primeData: () => mockDb.orderBy.mockResolvedValueOnce(TEAM_MEMBER_ROWS),
      postGuardLimits: 0,
      expected: TEAM_MEMBER_ROWS,
    },
  ];

  it.each(READ_SET)(
    'non-member × public league succeeds: $field',
    async ({ field, args, preGuardLimits, primeData, expected }) => {
      for (const rows of preGuardLimits) {
        mockDb.limit.mockResolvedValueOnce(rows);
      }
      // Guard: membership lookup → none; league lookup → public.
      mockDb.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ isPublic: true }]);
      primeData();

      const resolve = queryResolver(field);
      const result = await resolve({}, args, mockContext, undefined as never);

      expect(result).toEqual(expected);
    },
  );

  it.each(READ_SET)(
    'non-member × private league is FORBIDDEN: $field',
    async ({ field, args, preGuardLimits }) => {
      for (const rows of preGuardLimits) {
        mockDb.limit.mockResolvedValueOnce(rows);
      }
      // Guard: membership lookup → none; league lookup → private.
      mockDb.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ isPublic: false }]);

      const resolve = queryResolver(field);

      await expect(
        resolve({}, args, mockContext, undefined as never),
      ).rejects.toMatchObject({
        message: 'User is not a member of this league',
        extensions: { code: 'FORBIDDEN' },
      });
    },
  );

  it.each(READ_SET)(
    'member access is unchanged (no league-visibility lookup): $field',
    async ({
      field,
      args,
      preGuardLimits,
      primeData,
      postGuardLimits,
      expected,
    }) => {
      for (const rows of preGuardLimits) {
        mockDb.limit.mockResolvedValueOnce(rows);
      }
      // Guard: membership found — the league row must never be consulted.
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ]);
      // authorizeDraft then resolves the member's seat (LS-10074). Queue
      // fields still guard on membership alone and take no seat read.
      const seatLimits = SEAT_READING_FIELDS.has(field) ? 1 : 0;
      if (seatLimits > 0) {
        mockDb.limit.mockResolvedValueOnce([
          { id: 900, draftId: 100, slot: 1, teamId: 11, autoPick: true },
        ]);
      }
      primeData();

      const resolve = queryResolver(field);
      const result = await resolve({}, args, mockContext, undefined as never);

      expect(result).toEqual(expected);
      // Exactly the pre-guard lookups + one membership read (+ any post-guard
      // data reads that terminate in .limit) — no extra leagues query.
      expect(mockDb.limit).toHaveBeenCalledTimes(
        preGuardLimits.length + 1 + seatLimits + postGuardLimits,
      );
    },
  );

  it('spectator (non-member, public league) is still FORBIDDEN on getMyDraftQueue', async () => {
    // draft lookup → exists; membership lookup → none. The resolver never
    // consults league visibility — queues stay member-only (LS-2501).
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([]);

    const resolve = queryResolver('getMyDraftQueue');

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'You are not in this league',
      extensions: { code: 'FORBIDDEN' },
    });
    // No league-visibility read was issued: only draft + membership lookups.
    expect(mockDb.limit).toHaveBeenCalledTimes(2);
  });

  it('spectator (non-member, public league) is still FORBIDDEN on getDraftTeamAutoPickStatuses', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([]);

    const resolve = queryResolver('getDraftTeamAutoPickStatuses');

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'User is not a member of this league',
      extensions: { code: 'FORBIDDEN' },
    });
    expect(mockDb.limit).toHaveBeenCalledTimes(2);
  });

  it('non-member is still FORBIDDEN on getDraftRecommendations, even as admin', async () => {
    // Admin bypasses the premium entitlement gate but recommendations remain
    // strictly member-only — verifyLeagueMembership has no admin/spectator
    // branch (LS-2495 strategy-leak guard).
    mockContext.user = { id: 42, isAdmin: true };
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([]);

    const resolve = queryResolver('getDraftRecommendations');

    await expect(
      resolve(
        {},
        { draftId: 100, teamId: 11 },
        mockContext,
        undefined as never,
      ),
    ).rejects.toMatchObject({
      message: 'User is not a member of this league',
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('spectator (non-member, public league) is still FORBIDDEN on the setDraftQueue mutation', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([]);

    const resolve = mutationResolver('setDraftQueue');

    await expect(
      resolve(
        {},
        { draftId: 100, playerIds: [] },
        mockContext,
        undefined as never,
      ),
    ).rejects.toMatchObject({
      message: 'You are not a member of this league',
      extensions: { code: 'FORBIDDEN' },
    });
    expect(mockDb.limit).toHaveBeenCalledTimes(2);
  });
});
