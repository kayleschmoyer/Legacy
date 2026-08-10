/**
 * Unit tests for the `updateRosterPositions` mutation resolver (LS-9099).
 *
 * The reconciliation algorithm itself (insert/reassign/delete planning) is
 * covered exhaustively by `roster-position-planner.spec.ts`, which tests the
 * pure planner with no DB mocking. This file instead covers the resolver's
 * wiring: auth/authorization gates, input validation, and that the planner's
 * output is actually applied to the DB and the league record updated.
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

describe('updateRosterPositions (LS-9099)', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    transaction: jest.Mock;
  };
  let mockTx: {
    select: jest.Mock;
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    returning: jest.Mock;
  };
  let mockContext: {
    user: { id: number; isAdmin: boolean } | null;
    db: unknown;
  };

  beforeEach(() => {
    jest.resetModules();

    mockTx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
    };

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
    };

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
          updatedAt: 'updatedAt',
        },
        teams: { id: 'id', leagueId: 'leagueId' },
        teamMembers: {
          id: 'id',
          leagueId: 'leagueId',
          teamId: 'teamId',
          positionId: 'positionId',
        },
        positionSlot: {
          enumValues: [
            'QB',
            'RB',
            'WR',
            'TE',
            'FLEX',
            'K',
            'DST',
            'DL',
            'LB',
            'DB',
            'BN',
            'DP',
            'SFLEX',
          ],
        },
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

    const schemaModule = require('../index') as { schema: GraphQLSchema };
    schema = schemaModule.schema;

    mockContext = { user: { id: 1, isAdmin: false }, db: mockDb };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver() {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields().updateRosterPositions;
    if (!field?.resolve) {
      throw new Error('updateRosterPositions resolver not found');
    }
    return field.resolve;
  }

  const footballRosterSlots = [
    { positionType: 'QB', count: 1 },
    { positionType: 'RB', count: 2 },
  ];

  it('throws AuthenticationError when user is not authenticated', async () => {
    const resolve = getResolver();

    await expect(
      resolve(
        {},
        { input: { leagueId: 1, rosterSlots: footballRosterSlots } },
        { user: null, db: mockDb },
        undefined as never,
      ),
    ).rejects.toThrow('Authentication required to update roster positions');
  });

  it('throws UserInputError when the league does not exist', async () => {
    const resolve = getResolver();
    mockDb.limit.mockResolvedValueOnce([]); // league lookup -> not found

    await expect(
      resolve(
        {},
        { input: { leagueId: 1, rosterSlots: footballRosterSlots } },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('League not found');
  });

  it('throws ForbiddenError when user is not a league member', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }]) // league lookup
      .mockResolvedValueOnce([]); // membership -> not a member

    await expect(
      resolve(
        {},
        { input: { leagueId: 1, rosterSlots: footballRosterSlots } },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('You are not a member of this league');
  });

  it('throws ForbiddenError for a non-commissioner member', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }])
      .mockResolvedValueOnce([{ permissionLevel: 'general_manager' }]);

    await expect(
      resolve(
        {},
        { input: { leagueId: 1, rosterSlots: footballRosterSlots } },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Only a commissioner can update roster positions');
  });

  it('throws UserInputError when every submitted slot count is zero', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }])
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);

    await expect(
      resolve(
        {},
        {
          input: {
            leagueId: 1,
            rosterSlots: [{ positionType: 'QB', count: 0 }],
          },
        },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow(
      'At least one roster slot with a non-zero count is required.',
    );
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid position type before opening a transaction', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }])
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);

    await expect(
      resolve(
        {},
        {
          input: {
            leagueId: 1,
            rosterSlots: [{ positionType: 'NOT_A_SLOT', count: 1 }],
          },
        },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Invalid roster slot position "NOT_A_SLOT"');
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('rejects shrinking a position below a team’s already-rostered count (LS-9099 core AC)', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }])
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);

    // Current: QB x1, RB x2, BN x7 (total 10, the football min). Both RB
    // rows are rostered by the same team.
    mockTx.orderBy.mockResolvedValueOnce([
      { id: 1, positionType: 'QB' },
      { id: 2, positionType: 'RB' },
      { id: 3, positionType: 'RB' },
      { id: 4, positionType: 'BN' },
      { id: 5, positionType: 'BN' },
      { id: 6, positionType: 'BN' },
      { id: 7, positionType: 'BN' },
      { id: 8, positionType: 'BN' },
      { id: 9, positionType: 'BN' },
      { id: 10, positionType: 'BN' },
    ]);
    // First `.where()` call is the (non-terminal) currentPositions select,
    // chained into `.orderBy()`; the second is the (terminal) occupiedRows
    // select — queued in that exact call order.
    mockTx.where.mockReturnValueOnce(mockTx).mockResolvedValueOnce([
      { teamMemberId: 10, teamId: 100, positionId: 2, positionType: 'RB' },
      { teamMemberId: 11, teamId: 100, positionId: 3, positionType: 'RB' },
    ]);

    await expect(
      resolve(
        {},
        {
          input: {
            leagueId: 1,
            rosterSlots: [
              { positionType: 'QB', count: 1 },
              { positionType: 'RB', count: 1 },
              { positionType: 'BN', count: 8 },
            ],
          },
        },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow(/Cannot reduce "RB" to 1 slot\(s\)/);

    // No writes should have happened once validation failed.
    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(mockTx.delete).not.toHaveBeenCalled();
  });

  it('grows a position by inserting new league_positions rows and updates maxRosterSize', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }])
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);

    // Current: QB x1, RB x2, BN x7 (total 10). No one rostered yet.
    mockTx.orderBy.mockResolvedValueOnce([
      { id: 1, positionType: 'QB' },
      { id: 2, positionType: 'RB' },
      { id: 3, positionType: 'RB' },
      { id: 4, positionType: 'BN' },
      { id: 5, positionType: 'BN' },
      { id: 6, positionType: 'BN' },
      { id: 7, positionType: 'BN' },
      { id: 8, positionType: 'BN' },
      { id: 9, positionType: 'BN' },
      { id: 10, positionType: 'BN' },
    ]);
    mockTx.where
      .mockReturnValueOnce(mockTx) // currentPositions where -> chain to orderBy
      .mockResolvedValueOnce([]) // occupiedRows where -> none rostered
      .mockReturnValueOnce(mockTx); // final league update where -> chain to returning

    mockTx.returning.mockResolvedValueOnce([{ id: 1, maxRosterSize: 12 }]);

    const result = await resolve(
      {},
      {
        input: {
          leagueId: 1,
          rosterSlots: [
            { positionType: 'QB', count: 1 },
            { positionType: 'RB', count: 4 },
            { positionType: 'BN', count: 7 },
          ],
        },
      },
      mockContext,
      undefined as never,
    );

    // One insert call for the grown RB position (2 new rows).
    expect(mockTx.insert).toHaveBeenCalledTimes(1);
    expect(mockTx.values).toHaveBeenCalledWith([
      { leagueId: 1, positionType: 'RB' },
      { leagueId: 1, positionType: 'RB' },
    ]);
    // No deletes/reassignments needed for a pure grow.
    expect(mockTx.delete).not.toHaveBeenCalled();

    expect(result).toEqual({ id: 1, maxRosterSize: 12 });
  });
});
