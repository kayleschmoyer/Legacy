/**
 * Integration tests for Google Play mutation resolver validation paths (LS-5121).
 *
 * Verifies that verifyGooglePurchase throws UserInputError and
 * restoreGooglePurchases returns false when fetchGoogleSubscription
 * returns an inactive subscription state.
 */

import type { GraphQLSchema } from 'graphql';

describe('Google Play mutation validation (LS-5121)', () => {
  let schema: GraphQLSchema;
  let mockFetchGoogleSubscription: jest.Mock;
  let mockIsActiveGoogleSubscription: jest.Mock;
  let mockCaptureWarning: jest.Mock;
  let mockLogger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  const mockContext = {
    user: { id: 1, isAdmin: false },
    isImpersonating: false,
  };

  beforeEach(async () => {
    jest.resetModules();

    mockFetchGoogleSubscription = jest.fn();
    mockIsActiveGoogleSubscription = jest.fn();
    mockCaptureWarning = jest.fn();
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    jest.doMock('@legacy-sports/logging', () => ({ LOGGER: mockLogger }));

    // LS-5206: IAP verification failures must be captured to Rollbar so the
    // ops team has visibility into premium purchases that fail server-side.
    jest.doMock('@legacy-sports/rollbar', () => ({
      captureWarning: mockCaptureWarning,
    }));

    jest.doMock('@legacy-sports/utils/node', () => ({
      ...jest.requireActual('@legacy-sports/utils/node'),
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('../server/google-play', () => ({
      fetchGoogleSubscription: mockFetchGoogleSubscription,
      isActiveGoogleSubscription: mockIsActiveGoogleSubscription,
      GOOGLE_PLAY_PACKAGE_NAME: 'com.legacySports',
    }));

    jest.doMock('../server/stripe', () => ({ getStripeClient: jest.fn() }));

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
      runWithInternalClient: jest.fn(),
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
          stripeSubscriptionId: 'subscriptions.stripe_subscription_id',
          gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
          googlePurchaseToken: 'subscriptions.google_purchase_token',
          googleProductId: 'subscriptions.google_product_id',
          status: 'subscriptions.status',
          tier: 'subscriptions.tier',
          updatedAt: 'subscriptions.updated_at',
          currentPeriodEnd: 'subscriptions.current_period_end',
          cancelAtPeriodEnd: 'subscriptions.cancel_at_period_end',
          appleOriginalTransactionId:
            'subscriptions.apple_original_transaction_id',
          appleProductId: 'subscriptions.apple_product_id',
        },
        usersInAppInternal: {
          id: 'users.id',
          subscriptionTier: 'users.subscription_tier',
          updatedAt: 'users.updated_at',
        },
      },
      PublicDb: {},
    }));

    // Stub apple-jws to prevent real Apple JWS crypto calls in tests.
    jest.doMock('../apple-jws', () => ({
      decodeAndVerifyJwsTransaction: jest.fn(),
    }));

    const schemaModule = await import('./index');
    schema = schemaModule.schema;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function getResolver(mutationName: string) {
    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields()[mutationName];
    if (!field?.resolve) {
      throw new Error(`${mutationName} resolver not found`);
    }
    return field.resolve;
  }

  describe('verifyGooglePurchase', () => {
    it('throws UserInputError (BAD_USER_INPUT) when subscription is not active', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
      });
      mockIsActiveGoogleSubscription.mockReturnValue(false);

      const resolve = getResolver('verifyGooglePurchase');
      await expect(
        resolve(
          {},
          {
            purchaseToken: 'fake-token',
            productId: 'com.legacysports.app.premium.monthly',
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('logs a warning when subscription is not active', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      });
      mockIsActiveGoogleSubscription.mockReturnValue(false);

      const resolve = getResolver('verifyGooglePurchase');
      await expect(
        resolve(
          {},
          {
            purchaseToken: 'fake-token',
            productId: 'com.legacysports.app.premium.monthly',
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toBeDefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'verifyGooglePurchase — subscription not active',
        expect.objectContaining({
          subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
        }),
      );
    });

    // LS-5206: failures must be captured to Rollbar, not just logged.
    it('captures a Rollbar warning when subscription is not active', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      });
      mockIsActiveGoogleSubscription.mockReturnValue(false);

      const resolve = getResolver('verifyGooglePurchase');
      await expect(
        resolve(
          {},
          {
            purchaseToken: 'fake-token',
            productId: 'com.legacysports.app.premium.monthly',
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toBeDefined();

      expect(mockCaptureWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'verifyGooglePurchase — subscription not active',
        }),
        expect.objectContaining({
          subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
          operation: 'verifyGooglePurchase',
        }),
      );
    });

    // LS-5206: an unknown product ID is a verification failure ops must see.
    it('captures a Rollbar warning when productId is unknown', async () => {
      const resolve = getResolver('verifyGooglePurchase');
      await expect(
        resolve(
          {},
          { purchaseToken: 'fake-token', productId: 'com.bogus.product' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toBeDefined();

      expect(mockCaptureWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'verifyGooglePurchase — unknown productId',
        }),
        expect.objectContaining({
          productId: 'com.bogus.product',
          operation: 'verifyGooglePurchase',
        }),
      );
    });
  });

  describe('restoreGooglePurchases', () => {
    it('returns false when subscription is not active', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      });
      mockIsActiveGoogleSubscription.mockReturnValue(false);

      const resolve = getResolver('restoreGooglePurchases');
      const result = await resolve(
        {},
        {
          purchaseToken: 'fake-token',
          productId: 'com.legacysports.app.premium.monthly',
        },
        mockContext,
        undefined as never,
      );
      expect(result).toBe(false);
    });

    it('logs a warning when subscription is not active', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
      });
      mockIsActiveGoogleSubscription.mockReturnValue(false);

      const resolve = getResolver('restoreGooglePurchases');
      await resolve(
        {},
        {
          purchaseToken: 'fake-token',
          productId: 'com.legacysports.app.premium.monthly',
        },
        mockContext,
        undefined as never,
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'restoreGooglePurchases — subscription not active',
        expect.objectContaining({
          subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
        }),
      );
    });

    it('returns false and logs error when Google Play API call fails', async () => {
      mockFetchGoogleSubscription.mockRejectedValue(
        new Error('Network timeout'),
      );

      const resolve = getResolver('restoreGooglePurchases');
      const result = await resolve(
        {},
        {
          purchaseToken: 'fake-token',
          productId: 'com.legacysports.app.premium.monthly',
        },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'restoreGooglePurchases — Google Play API call failed',
        expect.objectContaining({ error: 'Network timeout' }),
      );
    });

    it('calls clearLeagueTierFreezes when user upgrades from free to premium', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [
          {
            productId: 'com.legacysports.app.premium.monthly',
            expiryTime: '2030-12-31T00:00:00Z',
          },
        ],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);

      const dbClientModule = jest.requireMock('@legacy-sports/db-client');

      // First runWithInternalClient call: getPreviousTierForGooglePurchase SELECT
      dbClientModule.runWithInternalClient.mockImplementationOnce(
        async (
          _opts: unknown,
          cb: (db: { select: jest.Mock }) => Promise<unknown>,
        ) =>
          cb({
            select: jest.fn().mockReturnValue({
              from: jest.fn().mockReturnValue({
                where: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue([{ tier: 'free' }]),
                }),
              }),
            }),
          }),
      );

      // Second runWithInternalClient call: INSERT + UPDATE subscription
      dbClientModule.runWithInternalClient.mockImplementationOnce(
        async (
          _opts: unknown,
          cb: (db: {
            insert: jest.Mock;
            update: jest.Mock;
          }) => Promise<unknown>,
        ) =>
          cb({
            insert: jest.fn().mockReturnValue({
              values: jest.fn().mockReturnValue({
                onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
              }),
            }),
            update: jest.fn().mockReturnValue({
              set: jest.fn().mockReturnValue({
                where: jest.fn().mockResolvedValue(undefined),
              }),
            }),
          }),
      );

      const resolve = getResolver('restoreGooglePurchases');
      const result = await resolve(
        {},
        {
          purchaseToken: 'fake-token',
          productId: 'com.legacysports.app.premium.monthly',
        },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(dbClientModule.clearLeagueTierFreezes).toHaveBeenCalledWith(
        1,
        expect.anything(),
      );
    });
  });

  // LS-5191: the active path must record currentPeriodEnd from the Google Play
  // lineItems[0].expiryTime so Android subscribers have a renewal date.
  describe('currentPeriodEnd recording (LS-5191)', () => {
    /**
     * Build a mock db whose insert chain captures the values passed to
     * .values() and the set passed to .onConflictDoUpdate(), and whose select
     * chain returns no previous subscription (so getPreviousTierForGooglePurchase
     * resolves to null).
     */
    function installActiveDbCapture(): {
      values: () => Record<string, unknown> | undefined;
      updateSet: () => Record<string, unknown> | undefined;
    } {
      let capturedValues: Record<string, unknown> | undefined;
      let capturedUpdateSet: Record<string, unknown> | undefined;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => [] }),
          }),
        }),
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            capturedValues = v;
            return {
              onConflictDoUpdate: (arg: { set: Record<string, unknown> }) => {
                capturedUpdateSet = arg.set;
                return Promise.resolve();
              },
            };
          },
        }),
        update: () => ({
          set: () => ({ where: async () => undefined }),
        }),
      };

      const dbClient = jest.requireMock('@legacy-sports/db-client');
      dbClient.runWithInternalClient.mockImplementation(
        async (_opts: unknown, cb: (db: typeof mockDb) => unknown) =>
          cb(mockDb),
      );

      return {
        values: () => capturedValues,
        updateSet: () => capturedUpdateSet,
      };
    }

    const productId = 'com.legacysports.app.premium.monthly';

    it('verifyGooglePurchase records currentPeriodEnd from lineItems expiryTime', async () => {
      const expiryTime = '2026-07-01T00:00:00.000Z';
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId, expiryTime }],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);
      const captured = installActiveDbCapture();

      const resolve = getResolver('verifyGooglePurchase');
      await resolve(
        {},
        { purchaseToken: 'fake-token', productId },
        mockContext,
        undefined as never,
      );

      expect(captured.values()?.['currentPeriodEnd']).toEqual(
        new Date(expiryTime),
      );
      expect(captured.updateSet()?.['currentPeriodEnd']).toEqual(
        new Date(expiryTime),
      );
    });

    it('verifyGooglePurchase records null currentPeriodEnd when expiryTime is absent', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId }],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);
      const captured = installActiveDbCapture();

      const resolve = getResolver('verifyGooglePurchase');
      await resolve(
        {},
        { purchaseToken: 'fake-token', productId },
        mockContext,
        undefined as never,
      );

      expect(captured.values()?.['currentPeriodEnd']).toBeNull();
      expect(captured.updateSet()?.['currentPeriodEnd']).toBeNull();
    });

    it('restoreGooglePurchases records currentPeriodEnd from lineItems expiryTime', async () => {
      const expiryTime = '2026-08-15T12:30:00.000Z';
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId, expiryTime }],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);
      const captured = installActiveDbCapture();

      const resolve = getResolver('restoreGooglePurchases');
      const result = await resolve(
        {},
        { purchaseToken: 'fake-token', productId },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(captured.values()?.['currentPeriodEnd']).toEqual(
        new Date(expiryTime),
      );
      expect(captured.updateSet()?.['currentPeriodEnd']).toEqual(
        new Date(expiryTime),
      );
    });
  });

  // LS-5176: createBillingPortalSession must surface a BAD_USER_INPUT
  // GraphQLError (not a raw Error → INTERNAL_SERVER_ERROR) when the caller has
  // no manageable Stripe subscription, so free / IAP users get a clean 4xx-style
  // error instead of an opaque 500.
  describe('createBillingPortalSession (LS-5176)', () => {
    /** Stub the single-row subscription lookup performed via
     *  runWithInternalClient → getSubscriptionForUser. */
    function installSubscriptionLookup(rows: unknown[]): void {
      const mockDb = {
        select: () => ({
          from: () => ({
            // getSubscriptionForUser chains .where().orderBy().limit();
            // the mock must mirror that full chain (LS-5206).
            where: () => ({
              orderBy: () => ({ limit: async () => rows }),
            }),
          }),
        }),
      };

      const dbClient = jest.requireMock('@legacy-sports/db-client');
      dbClient.runWithInternalClient.mockImplementation(
        async (_opts: unknown, cb: (db: typeof mockDb) => unknown) =>
          cb(mockDb),
      );
    }

    it('throws UserInputError (BAD_USER_INPUT) when the user has no subscription row', async () => {
      installSubscriptionLookup([]);

      const resolve = getResolver('createBillingPortalSession');
      await expect(
        resolve(
          {},
          { returnUrl: 'https://app.legacy-fantasy.com/profile/subscription' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('No subscription found'),
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });

    it('throws UserInputError (BAD_USER_INPUT) when the subscription is not Stripe-managed', async () => {
      installSubscriptionLookup([
        { id: 1, status: 'active', tier: 'premium', stripeCustomerId: null },
      ]);

      const resolve = getResolver('createBillingPortalSession');
      await expect(
        resolve(
          {},
          { returnUrl: 'https://app.legacy-fantasy.com/profile/subscription' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('App Store'),
        extensions: { code: 'BAD_USER_INPUT' },
      });
    });
  });
});
