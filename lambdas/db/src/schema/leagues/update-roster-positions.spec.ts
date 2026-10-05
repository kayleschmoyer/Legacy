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
import { inArray, sql } from 'drizzle-orm';
import { ENTITLEMENTS } from '@legacy-sports/utils';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Stubs the live-Stripe-lookup path `requireFreshEntitlement` takes
// (fresh-entitlements.ts `getStripeCustomerId` → `InternalSchema.subscriptions`,
// then `fetchActiveEntitlements` → Stripe). Grants every catalog entitlement
// whenever a Stripe customer id is present; a null customer id (no
// subscription row, i.e. the free-tier default) short-circuits before this is
// ever called.
const mockStripeEntitlementsList = jest.fn(function* () {
  for (const key of Object.values(ENTITLEMENTS)) yield { lookup_key: key };
});

describe('updateRosterPositions (LS-9099)', () => {
  let schema: GraphQLSchema;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
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
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
    };

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
    }));

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
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
          matchupPlayers: {
            id: 'id',
            matchupId: 'matchupId',
            teamId: 'teamId',
            positionId: 'positionId',
          },
          matchups: {
            id: 'id',
            leagueId: 'leagueId',
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
              'KP',
            ],
          },
        },
        InternalSchema: {
          usersInAppInternal: {
            id: 'app_internal.users.id',
            subscriptionTier: 'app_internal.users.subscription_tier',
          },
          subscriptions: {
            userId: 'app_internal.subscriptions.user_id',
            stripeCustomerId: 'app_internal.subscriptions.stripe_customer_id',
            createdAt: 'app_internal.subscriptions.created_at',
            id: 'app_internal.subscriptions.id',
          },
        },
      }),
    );

    // The requireFreshEntitlement advanced-gate path (fresh-entitlements.ts)
    // resolves a live Stripe client to read active entitlements. Tests never
    // exercise real Stripe — `mockDb.limit`'s queued values decide whether
    // `getStripeCustomerId` sees a customer at all, and this stub only
    // matters when it does.
    jest.doMock('../../server/stripe', () => ({
      getStripeClient: jest.fn(async () => ({
        entitlements: {
          activeEntitlements: { list: mockStripeEntitlementsList },
        },
      })),
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

  it('blocks a non-entitled commissioner from adding an SFLEX slot (LS-9277)', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }]) // league lookup
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]) // membership
      .mockResolvedValueOnce([]); // getStripeCustomerId -> no subscription row

    await expect(
      resolve(
        {},
        {
          input: {
            leagueId: 1,
            rosterSlots: [
              { positionType: 'QB', count: 1 },
              { positionType: 'SFLEX', count: 1 },
              { positionType: 'BN', count: 8 },
            ],
          },
        },
        mockContext,
        undefined as never,
      ),
    ).rejects.toThrow('Custom roster positions');

    // The gate must fire before any write is attempted.
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(mockTx.delete).not.toHaveBeenCalled();
  });

  it('allows an entitled commissioner to update roster positions to include SFLEX/KP (LS-9277)', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }]) // league lookup
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]) // membership
      .mockResolvedValueOnce([{ stripeCustomerId: 'cus_123' }]); // getStripeCustomerId -> entitled

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

    mockTx.returning.mockResolvedValueOnce([{ id: 1, maxRosterSize: 14 }]);

    const result = await resolve(
      {},
      {
        input: {
          leagueId: 1,
          rosterSlots: [
            { positionType: 'QB', count: 1 },
            { positionType: 'RB', count: 2 },
            { positionType: 'SFLEX', count: 1 },
            { positionType: 'KP', count: 1 },
            { positionType: 'BN', count: 9 },
          ],
        },
      },
      mockContext,
      undefined as never,
    );

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 1, maxRosterSize: 14 });
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

  it('reassigns matchup_players rows off dropped slots before deleting them (LS-9354)', async () => {
    const resolve = getResolver();
    mockDb.limit
      .mockResolvedValueOnce([{ id: 1, sport: 'football' }])
      .mockResolvedValueOnce([{ permissionLevel: 'commissioner' }]);

    // Current: QB x1, RB x2 (ids 2, 3), BN x7. Nobody currently rostered at
    // RB, so the team-occupancy guard doesn't block the shrink — but a past
    // matchup's matchup_players row (id 50) started a player in RB slot 3,
    // which is about to be dropped.
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
      .mockResolvedValueOnce([]) // occupiedRows (team_members) -> none rostered at RB
      .mockResolvedValueOnce([
        {
          matchupPlayerId: 50,
          matchupId: 500,
          teamId: 100,
          positionId: 3,
          positionType: 'RB',
        },
      ]) // matchupPlayerOccupiedRows -> one historical starter on the dropped slot
      .mockReturnValueOnce(mockTx); // final league update where -> chain to returning

    mockTx.returning.mockResolvedValueOnce([{ id: 1, maxRosterSize: 10 }]);

    const result = await resolve(
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
    );

    // matchup_players row 50 must be repointed onto the retained RB slot
    // (id 2) before the drop, not left for ON DELETE SET NULL to null out —
    // via a single batched CASE update, not one UPDATE per reassignment.
    const { PublicSchema } = jest.requireMock<
      typeof import('@legacy-sports/db-client')
    >('@legacy-sports/db-client');
    expect(mockTx.update).toHaveBeenCalledTimes(2); // matchupPlayers batch + leagues
    expect(mockTx.update).toHaveBeenNthCalledWith(
      1,
      PublicSchema.matchupPlayers,
    );
    // Compare SQL fragments with their (per-call, reference-unequal) decoder
    // functions stripped out — structural content only.
    const stripFns = (value: unknown) =>
      JSON.parse(
        JSON.stringify(value, (_key, v) =>
          typeof v === 'function' ? undefined : v,
        ),
      );
    const expectedCase = sql`CASE ${PublicSchema.matchupPlayers.id} ${sql.join([sql`WHEN ${50} THEN ${2}`], sql` `)} END`;
    expect(stripFns(mockTx.set.mock.calls[0][0])).toEqual(
      stripFns({ positionId: expectedCase }),
    );
    expect(stripFns(mockTx.where.mock.calls[3][0])).toEqual(
      stripFns(inArray(PublicSchema.matchupPlayers.id, [50])),
    );
    // The league_positions delete must run after that reassignment.
    expect(mockTx.delete).toHaveBeenCalledTimes(1);

    expect(result).toEqual({ id: 1, maxRosterSize: 10 });
  });
});
