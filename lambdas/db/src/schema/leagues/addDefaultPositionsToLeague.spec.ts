/**
 * Unit tests for `addDefaultPositionsToLeague` authorization (LS-5137).
 *
 * The auth check was previously restricted to `permissionLevel = 'general_manager'`
 * only, which blocked commissioners from adding positions to their own leagues.
 * This fix aligns it with the `updateLeagueSettings` pattern: allow both
 * `general_manager` and `commissioner`.
 *
 * Scenarios covered:
 *   1. Unauthenticated user → AuthenticationError
 *   2. Non-member (membership query returns []) → ForbiddenError
 *   3. Viewer/player role → ForbiddenError
 *   4. General Manager → success
 *   5. Commissioner → success (regression fix for LS-5137)
 */

import type { GraphQLSchema } from 'graphql';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('addDefaultPositionsToLeague authorization (LS-5137)', () => {
  let schema: GraphQLSchema;
  let mockDb: jest.Mocked<{
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    returning: jest.Mock;
  }>;
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: unknown;
  };

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
    } as typeof mockDb;

    const mockPositions = ['C', 'SP', 'RP', 'OF', '1B'];
    const mockRosterPositionsBySport = {
      baseball: mockPositions,
      football: ['QB', 'RB', 'WR', 'TE', 'K'],
    };

    // Spread jest.requireActual to preserve all real exports, then override
    // only the values that need to be controlled in tests.
    jest.doMock('@legacy-sports/utils', () => ({
      ...jest.requireActual('@legacy-sports/utils'),
      DEFAULT_BASEBALL_ROSTER_POSITIONS: mockPositions,
      DEFAULT_FOOTBALL_ROSTER_POSITIONS: mockRosterPositionsBySport.football,
      DEFAULT_ROSTER_POSITIONS_BY_SPORT: mockRosterPositionsBySport,
    }));

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
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
      PublicSchema: {
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          permissionLevel: 'permissionLevel',
        },
        leaguePosition: {
          id: 'id',
          leagueId: 'leagueId',
          positionType: 'positionType',
        },
        leagues: {
          id: 'id',
          maxRosterSize: 'maxRosterSize',
          sport: 'sport',
          name: 'name',
          owner: 'owner',
        },
        teams: { id: 'id', leagueId: 'leagueId' },
        teamMembers: { id: 'id', leagueId: 'leagueId' },
        InternalSchema: {
          usersInAppInternal: {
            id: 'app_internal.users.id',
            subscriptionTier: 'app_internal.users.subscription_tier',
          },
        },
      },
      InternalSchema: {
        usersInAppInternal: {
          id: 'app_internal.users.id',
          subscriptionTier: 'app_internal.users.subscription_tier',
        },
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../index') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = {
      user: { id: 1, isAdmin: false },
      db: mockDb,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields().addDefaultPositionsToLeague;
    if (!field?.resolve) {
      throw new Error('addDefaultPositionsToLeague resolver not found');
    }
    return field.resolve;
  }

  it('throws AuthenticationError when user is not authenticated', async () => {
    const resolve = getResolver();

    await expect(
      resolve(
        {},
        { leagueId: 1 },
        { user: null, db: mockDb },
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required to add positions to league');
  });

  it('throws ForbiddenError when user is not a league member', async () => {
    const resolve = getResolver();
    // Membership query returns empty → not a member
    mockDb.limit.mockResolvedValueOnce([]);

    await expect(
      resolve({}, { leagueId: 1 }, mockContext, undefined as never),
    ).rejects.toThrow('You are not a member of this league');
  });

  it('throws ForbiddenError when user has viewer/player role', async () => {
    const resolve = getResolver();
    // Membership query returns a non-privileged role
    mockDb.limit.mockResolvedValueOnce([{ permissionLevel: 'player' }]);

    await expect(
      resolve({}, { leagueId: 1 }, mockContext, undefined as never),
    ).rejects.toThrow(
      'Only a general manager or commissioner can add positions to a league',
    );
  });

  it('allows a General Manager to add positions', async () => {
    const resolve = getResolver();
    const insertedPositions = [{ id: 1, leagueId: 1, positionType: 'C' }];

    // 1. Membership check → GM
    mockDb.limit
      .mockResolvedValueOnce([{ permissionLevel: 'general_manager' }])
      // 2. Existing positions check → none
      .mockResolvedValueOnce([])
      // 3. League lookup → baseball
      .mockResolvedValueOnce([{ maxRosterSize: 25, sport: 'baseball' }]);

    // Insert + returning → inserted positions
    mockDb.returning.mockResolvedValueOnce(insertedPositions);

    const result = await resolve(
      {},
      { leagueId: 1 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(insertedPositions);
  });

  it('allows a Commissioner to add positions (LS-5137 regression fix)', async () => {
    const resolve = getResolver();
    const insertedPositions = [{ id: 1, leagueId: 1, positionType: 'C' }];

    // 1. Membership check → Commissioner
    mockDb.limit
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }])
      // 2. Existing positions check → none
      .mockResolvedValueOnce([])
      // 3. League lookup → baseball
      .mockResolvedValueOnce([{ maxRosterSize: 25, sport: 'baseball' }]);

    // Insert + returning → inserted positions
    mockDb.returning.mockResolvedValueOnce(insertedPositions);

    const result = await resolve(
      {},
      { leagueId: 1 },
      mockContext,
      undefined as never,
    );

    expect(result).toEqual(insertedPositions);
  });
});
