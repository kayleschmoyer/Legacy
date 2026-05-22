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
