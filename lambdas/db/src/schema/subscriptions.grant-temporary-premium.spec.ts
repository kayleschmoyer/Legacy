/**
 * Tests for the grantTemporaryPremium admin mutation (LS-9137).
 *
 * Covers:
 *  - admin-only enforcement (delegates to requireAdmin)
 *  - days bounds validation
 *  - target user existence check
 *  - refusal to grant over an already-active subscription
 *  - happy path: creates a Stripe trial subscription with
 *    trial_settings.end_behavior.missing_payment_method = 'cancel' and bumps
 *    the entitlements_updated_at invalidation marker
 */

import type { GraphQLSchema } from 'graphql';

describe('grantTemporaryPremium mutation (LS-9137)', () => {
  let schema: GraphQLSchema;
  let mockGetStripeClient: jest.Mock;
  let mockRunWithInternalClient: jest.Mock;
  let mockLogger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  // Queue-based fake for context.db: each `.limit(1)` call consumes the next
  // queued result, matching call order (requireAdmin's admin check first,
  // then the target-user lookup).
  function makeQueueDb(results: unknown[][]) {
    let i = 0;
    const chain: Record<string, jest.Mock> = {};
    chain['select'] = jest.fn(() => chain);
    chain['from'] = jest.fn(() => chain);
    chain['where'] = jest.fn(() => chain);
    chain['limit'] = jest.fn(() => Promise.resolve(results[i++] ?? []));
    return chain;
  }

  // Fake internal-client db supporting both the getSubscriptionForUser
  // select-chain and the entitlements-marker update-chain.
  function makeInternalDb(subscriptionRows: unknown[]) {
    const selectChain: Record<string, jest.Mock> = {};
    selectChain['select'] = jest.fn(() => selectChain);
    selectChain['from'] = jest.fn(() => selectChain);
    selectChain['where'] = jest.fn(() => selectChain);
    selectChain['orderBy'] = jest.fn(() => selectChain);
    selectChain['limit'] = jest.fn(() => Promise.resolve(subscriptionRows));

    const updateChain: Record<string, jest.Mock> = {};
    const setCalls: unknown[] = [];
    updateChain['update'] = jest.fn(() => updateChain);
    updateChain['set'] = jest.fn((values: unknown) => {
      setCalls.push(values);
      return updateChain;
    });
    updateChain['where'] = jest.fn(() => Promise.resolve(undefined));

    return {
      db: { ...selectChain, ...updateChain },
      setCalls,
    };
  }

  const ADMIN_CONTEXT_USER = { id: 99, isAdmin: true };

  beforeEach(async () => {
    jest.resetModules();

    mockGetStripeClient = jest.fn();
    mockRunWithInternalClient = jest.fn();
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    jest.doMock('@legacy-sports/logging', () => ({ LOGGER: mockLogger }));
    jest.doMock('@legacy-sports/rollbar', () => ({
      captureWarning: jest.fn(),
    }));
    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));
    jest.doMock('../server/google-play', () => ({
      fetchGoogleSubscription: jest.fn(),
      isActiveGoogleSubscription: jest.fn(),
      GOOGLE_PLAY_PACKAGE_NAME: 'com.legacySports',
    }));
    jest.doMock('../server/stripe', () => ({
      getStripeClient: mockGetStripeClient,
    }));
    jest.doMock('stripe', () => ({
      default: jest.fn().mockImplementation(() => ({})),
    }));
    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    }));
    jest.doMock('../server/context', () => ({
      getJwtSecret: jest.fn().mockResolvedValue('test-secret'),
    }));
    jest.doMock('../services/standings-service', () => ({
      StandingsService: {
        getHeadToHead: jest.fn(),
        getSeasonSummary: jest.fn(),
        getStandings: jest.fn(),
        getMatchupStats: jest.fn(),
      },
    }));
    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(() => ({
        users: { getUserById: jest.fn() },
        statistics: { getOnThisDay: jest.fn(), getOnThisDayEvents: jest.fn() },
      })),
      runWithPublicClient: jest.fn(),
      runWithInternalClient: mockRunWithInternalClient,
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      handleSubscriptionDowngrade: jest.fn(),
      clearLeagueTierFreezes: jest.fn(),
      reapplyLeagueRestrictions: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
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
        users: {
          id: 'users.id',
          canonicalEmail: 'users.canonical_email',
        },
        leagues: {
          id: 'id',
          name: 'name',
          currentWeek: 'currentWeek',
          currentMatchup: 'currentMatchup',
        },
        teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        teamMembers: {
          id: 'id',
          teamId: 'teamId',
          leagueId: 'leagueId',
          playerId: 'playerId',
          positionId: 'positionId',
        },
        players: {
          id: 'id',
          firstName: 'firstName',
          lastName: 'lastName',
          brefId: 'brefId',
        },
        matchups: {
          id: 'id',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
          status: 'status',
          team1Id: 'team1Id',
          team2Id: 'team2Id',
        },
        matchupPlayers: {
          id: 'id',
          matchupId: 'matchupId',
          playerId: 'playerId',
          teamId: 'teamId',
        },
        leagueWeekPlayerSeasons: {
          playerId: 'playerId',
          season: 'season',
          leagueId: 'leagueId',
          weekNumber: 'weekNumber',
        },
        leagueSeasonAwards: {
          id: 'id',
          leagueId: 'leagueId',
          season: 'season',
          playerId: 'playerId',
          awardType: 'awardType',
          notes: 'notes',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        leagueActivityLog: {
          id: 'id',
          leagueId: 'leagueId',
          eventType: 'eventType',
          occurredAt: 'occurredAt',
        },
        leagueActivityEventType: { enumValues: [] },
      },
      InternalSchema: {
        subscriptions: {
          id: 'subscriptions.id',
          userId: 'subscriptions.user_id',
          stripeCustomerId: 'subscriptions.stripe_customer_id',
          stripeSubscriptionId: 'subscriptions.stripe_subscription_id',
          gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
          googlePurchaseToken: 'subscriptions.google_purchase_token',
          googleProductId: 'subscriptions.google_product_id',
          status: 'subscriptions.status',
          tier: 'subscriptions.tier',
          updatedAt: 'subscriptions.updated_at',
          currentPeriodEnd: 'subscriptions.current_period_end',
          cancelAtPeriodEnd: 'subscriptions.cancel_at_period_end',
          trialEndsAt: 'subscriptions.trial_ends_at',
          appleOriginalTransactionId:
            'subscriptions.apple_original_transaction_id',
          appleProductId: 'subscriptions.apple_product_id',
        },
        usersInAppInternal: {
          id: 'users.id',
          subscriptionTier: 'users.subscription_tier',
          entitlementsUpdatedAt: 'users.entitlements_updated_at',
          updatedAt: 'users.updated_at',
        },
      },
      PublicDb: {},
    }));
    jest.doMock('../apple-jws', () => ({
      decodeAndVerifyJwsTransaction: jest.fn(),
    }));

    process.env['STRIPE_MONTHLY_PRICE_ID'] = 'price_monthly_test';

    const schemaModule = await import('./index');
    schema = schemaModule.schema;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env['STRIPE_MONTHLY_PRICE_ID'];
  });

  function getResolver() {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields()['grantTemporaryPremium'];
    if (!field?.resolve) {
      throw new Error('grantTemporaryPremium resolver not found');
    }
    return field.resolve;
  }

  it('rejects an unauthenticated caller', async () => {
    const resolve = getResolver();
    const context = {
      user: null,
      db: makeQueueDb([]),
    };

    await expect(
      resolve({}, { userId: 5, days: 7 }, context, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects a non-admin caller', async () => {
    const resolve = getResolver();
    const context = {
      user: { id: 1, isAdmin: false },
      db: makeQueueDb([]),
    };

    await expect(
      resolve({}, { userId: 5, days: 7 }, context, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('rejects a days value outside 1-90', async () => {
    const resolve = getResolver();

    await expect(
      resolve(
        {},
        { userId: 5, days: 0 },
        {
          user: ADMIN_CONTEXT_USER,
          db: makeQueueDb([[{ accessLevel: 'admin' }]]),
        },
        undefined as never,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });

    await expect(
      resolve(
        {},
        { userId: 5, days: 91 },
        {
          user: ADMIN_CONTEXT_USER,
          db: makeQueueDb([[{ accessLevel: 'admin' }]]),
        },
        undefined as never,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('rejects when the target user does not exist', async () => {
    mockRunWithInternalClient.mockImplementation(
      (_opts: unknown, cb: (db: unknown) => unknown) =>
        cb(makeInternalDb([]).db),
    );

    const resolve = getResolver();
    const context = {
      user: ADMIN_CONTEXT_USER,
      // admin check succeeds, target-user lookup returns no rows
      db: makeQueueDb([[{ accessLevel: 'admin' }], []]),
    };

    await expect(
      resolve({}, { userId: 404, days: 7 }, context, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('refuses to grant when the user already has an active subscription', async () => {
    mockRunWithInternalClient.mockImplementation(
      (_opts: unknown, cb: (db: unknown) => unknown) =>
        cb(
          makeInternalDb([
            {
              status: 'active',
              tier: 'premium',
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false,
              trialEndsAt: null,
              gracePeriodEndsAt: null,
              stripeCustomerId: 'cus_existing',
              stripeSubscriptionId: 'sub_existing',
            },
          ]).db,
        ),
    );

    const resolve = getResolver();
    const context = {
      user: ADMIN_CONTEXT_USER,
      db: makeQueueDb([
        [{ accessLevel: 'admin' }],
        [{ id: 5, email: 'target@example.com' }],
      ]),
    };

    await expect(
      resolve({}, { userId: 5, days: 7 }, context, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  it('creates a time-boxed Stripe trial subscription and bumps the entitlements marker', async () => {
    const internal = makeInternalDb([]); // no existing subscription row
    mockRunWithInternalClient.mockImplementation(
      (_opts: unknown, cb: (db: unknown) => unknown) => cb(internal.db),
    );

    const mockSubscriptionsCreate = jest.fn().mockResolvedValue({
      id: 'sub_test123',
      trial_end: 1893456000, // arbitrary future unix timestamp
    });
    const mockCustomersCreate = jest.fn().mockResolvedValue({
      id: 'cus_new123',
      deleted: false,
    });
    mockGetStripeClient.mockResolvedValue({
      customers: { create: mockCustomersCreate, retrieve: jest.fn() },
      subscriptions: { create: mockSubscriptionsCreate },
    });

    const resolve = getResolver();
    const context = {
      user: ADMIN_CONTEXT_USER,
      db: makeQueueDb([
        [{ accessLevel: 'admin' }],
        [{ id: 5, email: 'target@example.com' }],
      ]),
    };

    const result = await resolve(
      {},
      { userId: 5, days: 14 },
      context,
      undefined as never,
    );

    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'target@example.com',
        metadata: { userId: '5' },
      }),
    );

    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_new123',
        items: [{ price: 'price_monthly_test' }],
        trial_period_days: 14,
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
        metadata: expect.objectContaining({
          userId: '5',
          grantedByAdminId: '99',
          grantType: 'admin_temporary_premium',
        }),
      }),
    );

    // The entitlements_updated_at marker is bumped immediately so already
    // issued JWTs are force-expired without waiting on the webhook.
    expect(internal.setCalls).toEqual([
      expect.objectContaining({
        subscriptionTier: 'premium',
        entitlementsUpdatedAt: expect.any(Date),
      }),
    ]);

    expect(result).toEqual({
      stripeSubscriptionId: 'sub_test123',
      expiresAt: new Date(1893456000 * 1000).toISOString(),
      days: 14,
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Admin granted temporary premium access',
      expect.objectContaining({
        audit: true,
        targetUserId: 5,
        days: 14,
        stripeSubscriptionId: 'sub_test123',
      }),
    );
  });
});
