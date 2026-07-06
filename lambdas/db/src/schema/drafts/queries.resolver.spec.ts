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
        drafts: { id: 'id', leagueId: 'leagueId' },
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
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
        drafts: { id: 'id', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        draftTeams: {
          draftId: 'draftId',
          teamId: 'teamId',
          autoPick: 'autoPick',
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
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
    // draft lookup where → chain; membership where → chain; rows where → terminal.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockResolvedValueOnce(rows);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
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
    // draft where → chain; membership where → chain; rows where attempt 1 →
    // deadlock (40P01, retryable); rows where attempt 2 → success.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockRejectedValueOnce(pgError('deadlock detected', '40P01'))
      .mockResolvedValueOnce(rows);
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
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
    expect(mockDb.where).toHaveBeenCalledTimes(4);
  });

  it('re-throws a non-transient DB error with a diagnosable client-facing code (no mask)', async () => {
    // rows read fails with a statement timeout (57014) — not retryable.
    mockDb.where
      .mockReturnValueOnce(mockDb)
      .mockReturnValueOnce(mockDb)
      .mockRejectedValueOnce(
        pgError('canceling statement due to statement timeout', '57014'),
      );
    mockDb.limit
      .mockResolvedValueOnce([{ leagueId: 7 }])
      .mockResolvedValueOnce([
        { teamId: 11, permissionLevel: 'general_manager' },
      ]);

    const resolve = getResolver();

    await expect(
      resolve({}, { draftId: 100 }, mockContext, undefined as never),
    ).rejects.toMatchObject({
      message: 'Failed to load auto-pick statuses (database error 57014)',
      extensions: { code: 'DRAFT_AUTO_PICK_STATUS_FAILED' },
    });
    // Non-transient error must NOT be retried.
    expect(mockDb.where).toHaveBeenCalledTimes(3);
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
