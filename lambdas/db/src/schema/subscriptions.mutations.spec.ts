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
  let mockDecodeJws: jest.Mock;
  let mockCheckAndIncrementRateLimit: jest.Mock;
  let mockLogger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  const mockContext = {
    user: { id: 1, isAdmin: false },
    isImpersonating: false,
    db: {},
  };

  beforeEach(async () => {
    jest.resetModules();

    mockFetchGoogleSubscription = jest.fn();
    mockIsActiveGoogleSubscription = jest.fn();
    mockCaptureWarning = jest.fn();
    mockDecodeJws = jest.fn();
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

    mockCheckAndIncrementRateLimit = jest.fn().mockResolvedValue({
      allowed: true,
    });
    jest.doMock('./rate-limit', () => ({
      checkAndIncrementRateLimit: mockCheckAndIncrementRateLimit,
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

    jest.doMock('@legacy-sports/db-client', () =>
      mockDbClientModule({
        createDatabaseService: jest.fn(() => ({
          users: { getUserById: jest.fn() },
          statistics: {
            getOnThisDay: jest.fn(),
            getOnThisDayEvents: jest.fn(),
          },
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
      }),
    );

    // Stub apple-jws to prevent real Apple JWS crypto calls in tests.
    jest.doMock('../apple-jws', () => ({
      decodeAndVerifyJwsTransaction: mockDecodeJws,
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

  describe.each(['verifyApplePurchase', 'restoreApplePurchases'])(
    '%s bundle ID enforcement (LS-7414)',
    (mutationName) => {
      it('rejects a foreign-bundle JWS, warns, and writes nothing', async () => {
        mockDecodeJws.mockRejectedValue(
          new Error('Invalid transaction: bundle ID mismatch'),
        );
        const { runWithInternalClient } =
          await import('@legacy-sports/db-client');

        const resolve = getResolver(mutationName);
        await expect(
          resolve(
            {},
            { jwsTransaction: 'foreign.app.jws' },
            mockContext,
            undefined as never,
          ),
        ).rejects.toThrow('Invalid JWS transaction: could not verify payload');

        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockCaptureWarning).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            operation: mutationName,
            cause: 'Invalid transaction: bundle ID mismatch',
          }),
        );
        expect(runWithInternalClient).not.toHaveBeenCalled();
      });

      it('passes the expected Apple bundle ID to JWS verification', async () => {
        mockDecodeJws.mockRejectedValue(new Error('stop'));
        const resolve = getResolver(mutationName);
        await expect(
          resolve(
            {},
            { jwsTransaction: 'some.jws' },
            mockContext,
            undefined as never,
          ),
        ).rejects.toThrow();

        expect(mockDecodeJws).toHaveBeenCalledWith(
          'some.jws',
          process.env['APPLE_BUNDLE_ID'] ?? 'com.legacysports.app',
        );
      });
    },
  );

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

    // LS-7380: the Android upgrade path must push a SUBSCRIPTION_UPDATED
    // notification so an open web tab picks up the new tier without a
    // manual reload, matching the Stripe webhook / Apple IAP call sites.
    it('notifies via notifySubscriptionUpdated with the correct userId/tier/status on success', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [
          {
            productId: 'com.legacysports.app.premium.monthly',
            expiryTime: '2026-09-01T00:00:00.000Z',
          },
        ],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);
      const mockNotifySubscriptionUpdated = jest
        .fn()
        .mockResolvedValue(undefined);

      const resolve = getResolver('verifyGooglePurchase');
      const result = await resolve(
        {},
        {
          purchaseToken: 'fake-token',
          productId: 'com.legacysports.app.premium.monthly',
        },
        {
          ...mockContext,
          notificationService: {
            notifySubscriptionUpdated: mockNotifySubscriptionUpdated,
          },
        },
        undefined as never,
      );

      expect(result).toMatchObject({ success: true, tier: 'premium' });
      expect(mockNotifySubscriptionUpdated).toHaveBeenCalledWith(
        1,
        'premium',
        'active',
      );
    });

    it('does not notify when notificationService is not provided on the context', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [
          {
            productId: 'com.legacysports.app.premium.monthly',
            expiryTime: '2026-09-01T00:00:00.000Z',
          },
        ],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);

      const resolve = getResolver('verifyGooglePurchase');
      // mockContext has no notificationService — resolver must not throw.
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
      ).resolves.toMatchObject({ success: true });
    });

    it('does not notify on the unknown-productId failure path', async () => {
      const mockNotifySubscriptionUpdated = jest
        .fn()
        .mockResolvedValue(undefined);

      const resolve = getResolver('verifyGooglePurchase');
      await expect(
        resolve(
          {},
          { purchaseToken: 'fake-token', productId: 'com.bogus.product' },
          {
            ...mockContext,
            notificationService: {
              notifySubscriptionUpdated: mockNotifySubscriptionUpdated,
            },
          },
          undefined as never,
        ),
      ).rejects.toBeDefined();

      expect(mockNotifySubscriptionUpdated).not.toHaveBeenCalled();
    });

    it('does not notify on the subscription-not-active failure path', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      });
      mockIsActiveGoogleSubscription.mockReturnValue(false);
      const mockNotifySubscriptionUpdated = jest
        .fn()
        .mockResolvedValue(undefined);

      const resolve = getResolver('verifyGooglePurchase');
      await expect(
        resolve(
          {},
          {
            purchaseToken: 'fake-token',
            productId: 'com.legacysports.app.premium.monthly',
          },
          {
            ...mockContext,
            notificationService: {
              notifySubscriptionUpdated: mockNotifySubscriptionUpdated,
            },
          },
          undefined as never,
        ),
      ).rejects.toBeDefined();

      expect(mockNotifySubscriptionUpdated).not.toHaveBeenCalled();
    });
  });

  describe('restoreGooglePurchases', () => {
    // LS-7416: client-supplied productId must be allowlisted before use.
    it.each(['com.test.monthly-cheap', 'xxxpremiumxxx', 'annual', ''])(
      'returns false, warns, and never calls Google when productId is %j',
      async (productId) => {
        const resolve = getResolver('restoreGooglePurchases');
        const result = await resolve(
          {},
          { purchaseToken: 'fake-token', productId },
          mockContext,
          undefined as never,
        );

        expect(result).toBe(false);
        expect(mockFetchGoogleSubscription).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'restoreGooglePurchases — unknown productId',
          expect.objectContaining({ productId }),
        );
        expect(mockCaptureWarning).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'restoreGooglePurchases — unknown productId',
          }),
          expect.objectContaining({
            productId,
            operation: 'restoreGooglePurchases',
          }),
        );
      },
    );

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

  // LS-7411: restore reflects Apple's signed expiry read-only — no grace period.
  describe('restoreApplePurchases (LS-7411)', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const productId = 'com.legacysports.app.premium.monthly';

    function installCapture(): {
      inserts: Record<string, unknown>[];
      updateSets: Record<string, unknown>[];
    } {
      const inserts: Record<string, unknown>[] = [];
      const updateSets: Record<string, unknown>[] = [];
      const mockDb = {
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            inserts.push(v);
            return {
              onConflictDoUpdate: (arg: { set: Record<string, unknown> }) => {
                updateSets.push(arg.set);
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
      return { inserts, updateSets };
    }

    function mockTransaction(expiresDate: number): void {
      const appleJws = jest.requireMock('../apple-jws');
      appleJws.decodeAndVerifyJwsTransaction.mockResolvedValue({
        originalTransactionId: 'orig-1',
        productId,
        expiresDate,
      });
    }

    async function restore(): Promise<unknown> {
      const resolve = getResolver('restoreApplePurchases');
      return resolve(
        {},
        { jwsTransaction: 'fake-jws' },
        mockContext,
        undefined as never,
      );
    }

    it('grants free/canceled with no grace for a transaction expired 6 days ago', async () => {
      const capture = installCapture();
      mockTransaction(Date.now() - 6 * DAY_MS);

      await expect(restore()).resolves.toBe(true);

      expect(capture.inserts[0]).toMatchObject({
        tier: 'free',
        status: 'canceled',
        gracePeriodEndsAt: null,
      });
      expect(capture.updateSets[0]).toMatchObject({
        tier: 'free',
        status: 'canceled',
        gracePeriodEndsAt: null,
      });
    });

    it('stays free on repeated restores of the same expired transaction', async () => {
      const capture = installCapture();
      mockTransaction(Date.now() - 6 * DAY_MS);

      await restore();
      await restore();

      expect(capture.inserts).toHaveLength(2);
      for (const written of [...capture.inserts, ...capture.updateSets]) {
        expect(written).toMatchObject({
          tier: 'free',
          status: 'canceled',
          gracePeriodEndsAt: null,
        });
      }
    });

    it('keeps premium/active for a currently active transaction', async () => {
      const capture = installCapture();
      mockTransaction(Date.now() + 10 * DAY_MS);

      await expect(restore()).resolves.toBe(true);

      expect(capture.inserts[0]).toMatchObject({
        tier: 'premium',
        status: 'active',
        gracePeriodEndsAt: null,
      });
      expect(capture.updateSets[0]).toMatchObject({
        tier: 'premium',
        status: 'active',
      });
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

    it('verifyGooglePurchase persists the Google-reported productId, not the mismatched client claim (LS-7417)', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId, expiryTime: '2026-07-01T00:00:00.000Z' }],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);
      const captured = installActiveDbCapture();

      const resolve = getResolver('verifyGooglePurchase');
      const result = await resolve(
        {},
        {
          purchaseToken: 'fake-token',
          productId: 'com.legacysports.app.premium.annual',
        },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ success: true, tier: 'premium' });
      expect(captured.values()?.['googleProductId']).toBe(productId);
      expect(captured.updateSet()?.['googleProductId']).toBe(productId);
    });

    it('verifyGooglePurchase rejects when no line item matches a known product (LS-7417)', async () => {
      mockFetchGoogleSubscription.mockResolvedValue({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        lineItems: [{ productId: 'com.legacysports.app.cheap.addon' }],
      });
      mockIsActiveGoogleSubscription.mockReturnValue(true);
      const captured = installActiveDbCapture();

      const resolve = getResolver('verifyGooglePurchase');
      await expect(
        resolve(
          {},
          {
            purchaseToken: 'fake-token',
            productId: 'com.legacysports.app.premium.annual',
          },
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('no recognized product line item');
      expect(captured.values()).toBeUndefined();
    });

    it.each([[undefined], [[]]])(
      'verifyGooglePurchase rejects when lineItems is %p (LS-7417)',
      async (lineItems) => {
        mockFetchGoogleSubscription.mockResolvedValue({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems,
        });
        mockIsActiveGoogleSubscription.mockReturnValue(true);
        const captured = installActiveDbCapture();

        const resolve = getResolver('verifyGooglePurchase');
        await expect(
          resolve(
            {},
            { purchaseToken: 'fake-token', productId },
            mockContext,
            undefined as never,
          ),
        ).rejects.toThrow('no recognized product line item');
        expect(captured.values()).toBeUndefined();
      },
    );

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

  // LS-7386: a premium Apple transaction without expiresDate must be rejected
  // rather than persisted as premium with no expiry (nothing would expire it).
  describe('Apple missing expiresDate guard (LS-7386)', () => {
    const premiumProductId = 'com.legacysports.app.premium.monthly';
    const baseTransaction = {
      originalTransactionId: 'orig-1',
      transactionId: 'tx-1',
      bundleId: 'com.legacysports.app',
      purchaseDate: 1_700_000_000_000,
    };

    function installDbCapture(): { values: () => unknown } {
      let capturedValues: unknown;
      const mockDb = {
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        }),
        insert: () => ({
          values: (v: unknown) => {
            capturedValues = v;
            return { onConflictDoUpdate: () => Promise.resolve() };
          },
        }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      };
      const dbClient = jest.requireMock('@legacy-sports/db-client');
      dbClient.runWithInternalClient.mockImplementation(
        async (_opts: unknown, cb: (db: typeof mockDb) => unknown) =>
          cb(mockDb),
      );
      return { values: () => capturedValues };
    }

    function mockTransaction(tx: Record<string, unknown>) {
      const appleJws = jest.requireMock('../apple-jws');
      appleJws.decodeAndVerifyJwsTransaction.mockResolvedValue({
        ...baseTransaction,
        ...tx,
      });
    }

    it.each(['verifyApplePurchase', 'restoreApplePurchases'])(
      '%s rejects a premium transaction missing expiresDate without writing',
      async (mutation) => {
        mockTransaction({ productId: premiumProductId });
        const captured = installDbCapture();

        const resolve = getResolver(mutation);
        await expect(
          resolve(
            {},
            { jwsTransaction: 'jws' },
            mockContext,
            undefined as never,
          ),
        ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });

        expect(captured.values()).toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalledWith(
          `${mutation} — premium transaction missing expiresDate`,
          expect.objectContaining({ productId: premiumProductId }),
        );
        expect(mockCaptureWarning).toHaveBeenCalledWith(
          expect.objectContaining({
            message: `${mutation} — premium transaction missing expiresDate`,
          }),
          expect.objectContaining({ operation: mutation }),
        );
      },
    );

    it('verifyApplePurchase still records a premium transaction with expiresDate', async () => {
      const expiresDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
      mockTransaction({ productId: premiumProductId, expiresDate });
      const captured = installDbCapture();

      const resolve = getResolver('verifyApplePurchase');
      const result = await resolve(
        {},
        { jwsTransaction: 'jws' },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ success: true, tier: 'premium' });
      expect(captured.values()).toMatchObject({
        tier: 'premium',
        currentPeriodEnd: new Date(expiresDate),
      });
    });

    it('restoreApplePurchases still restores a premium transaction with expiresDate', async () => {
      const expiresDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
      mockTransaction({ productId: premiumProductId, expiresDate });
      const captured = installDbCapture();

      const resolve = getResolver('restoreApplePurchases');
      const result = await resolve(
        {},
        { jwsTransaction: 'jws' },
        mockContext,
        undefined as never,
      );

      expect(result).toBe(true);
      expect(captured.values()).toMatchObject({
        tier: 'premium',
        currentPeriodEnd: new Date(expiresDate),
      });
    });

    it('verifyApplePurchase does not require expiresDate for a non-premium product', async () => {
      mockTransaction({ productId: 'com.legacysports.app.consumable.coins' });
      const captured = installDbCapture();

      const resolve = getResolver('verifyApplePurchase');
      const result = await resolve(
        {},
        { jwsTransaction: 'jws' },
        mockContext,
        undefined as never,
      );

      expect(result).toMatchObject({ success: true, tier: 'free' });
      expect(captured.values()).toMatchObject({
        tier: 'free',
        currentPeriodEnd: null,
      });
    });
  });

  // LS-5176: createBillingPortalSession must surface a BAD_USER_INPUT
  // GraphQLError (not a raw Error → INTERNAL_SERVER_ERROR) when the caller has
  // no manageable Stripe subscription, so free / IAP users get a clean 4xx-style
  // error instead of an opaque 500.
  describe('createBillingPortalSession (LS-5176)', () => {
    const BILLING_PORTAL_UNAVAILABLE =
      'Unable to open billing portal for this account.';

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
        message: BILLING_PORTAL_UNAVAILABLE,
        extensions: { code: 'BAD_USER_INPUT' },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Billing portal unavailable for user',
        { userId: 1, reason: 'no_subscription' },
      );
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
        message: BILLING_PORTAL_UNAVAILABLE,
        extensions: { code: 'BAD_USER_INPUT' },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Billing portal unavailable for user',
        { userId: 1, reason: 'not_stripe_managed' },
      );
    });

    // LS-7401: the limiter runs before the DB/Stripe and is keyed per user.
    it('rejects with RATE_LIMITED without touching the DB or Stripe once the limit is exceeded', async () => {
      mockCheckAndIncrementRateLimit.mockResolvedValue({ allowed: false });
      installSubscriptionLookup([
        { id: 1, status: 'active', tier: 'premium', stripeCustomerId: 'cus_1' },
      ]);

      const resolve = getResolver('createBillingPortalSession');
      await expect(
        resolve(
          {},
          { returnUrl: 'https://app.legacy-fantasy.com/profile/subscription' },
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({ extensions: { code: 'RATE_LIMITED' } });

      expect(mockCheckAndIncrementRateLimit).toHaveBeenCalledWith(
        mockContext.db,
        expect.objectContaining({
          bucket: 'create_billing_portal_session',
          userId: 1,
        }),
      );
      const dbClient = jest.requireMock('@legacy-sports/db-client');
      expect(dbClient.runWithInternalClient).not.toHaveBeenCalled();
    });

    it('creates a portal session for a Stripe-managed subscriber within the limit', async () => {
      installSubscriptionLookup([
        { id: 1, status: 'active', tier: 'premium', stripeCustomerId: 'cus_1' },
      ]);
      const create = jest
        .fn()
        .mockResolvedValue({ url: 'https://portal.test' });
      const stripeModule = jest.requireMock('../server/stripe');
      stripeModule.getStripeClient.mockResolvedValue({
        billingPortal: { sessions: { create } },
      });

      const resolve = getResolver('createBillingPortalSession');
      await expect(
        resolve(
          {},
          { returnUrl: 'https://app.legacy-fantasy.com/profile/subscription' },
          mockContext,
          undefined as never,
        ),
      ).resolves.toEqual({ url: 'https://portal.test' });
      expect(create).toHaveBeenCalledWith({
        customer: 'cus_1',
        return_url: 'https://app.legacy-fantasy.com/profile/subscription',
      });
    });
  });

  // LS-7421: createCheckoutSession must fail closed when the price allowlist
  // (built once at module load from env) is empty.
  describe('createCheckoutSession price allowlist (LS-7421)', () => {
    const ENV_KEYS = ['STRIPE_MONTHLY_PRICE_ID', 'STRIPE_ANNUAL_PRICE_ID'];
    const savedEnv: Record<string, string | undefined> = {};

    beforeEach(() => {
      for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    });

    afterEach(() => {
      for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
    });

    /** The allowlist is computed at module load, so re-import the schema
     *  after changing env. doMock registrations survive resetModules. */
    async function loadSchemaWithEnv(
      monthly: string | undefined,
      annual: string | undefined,
    ): Promise<jest.Mock> {
      for (const [key, value] of [
        ['STRIPE_MONTHLY_PRICE_ID', monthly],
        ['STRIPE_ANNUAL_PRICE_ID', annual],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      jest.resetModules();
      schema = (await import('./index')).schema;
      return jest.requireMock('../server/stripe').getStripeClient;
    }

    const checkoutArgs = (priceId: string) => ({
      priceId,
      successUrl: 'https://app.legacy-fantasy.com/success',
      cancelUrl: 'https://app.legacy-fantasy.com/cancel',
    });

    it('throws a config error and never reaches Stripe when the allowlist is empty', async () => {
      const getStripeClient = await loadSchemaWithEnv(undefined, undefined);

      const resolve = getResolver('createCheckoutSession');
      await expect(
        resolve(
          {},
          checkoutArgs('price_anything123'),
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Stripe price ID allowlist is not configured');

      expect(getStripeClient).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockCaptureWarning).toHaveBeenCalled();
    });

    it('treats empty-string env vars as an empty allowlist', async () => {
      const getStripeClient = await loadSchemaWithEnv('', '');

      const resolve = getResolver('createCheckoutSession');
      await expect(
        resolve(
          {},
          checkoutArgs('price_anything123'),
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('Stripe price ID allowlist is not configured');
      expect(getStripeClient).not.toHaveBeenCalled();
    });

    it('does not report the empty-allowlist config error as a user input error', async () => {
      await loadSchemaWithEnv(undefined, undefined);

      const resolve = getResolver('createCheckoutSession');
      await expect(
        resolve(
          {},
          checkoutArgs('price_anything123'),
          mockContext,
          undefined as never,
        ),
      ).rejects.not.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    });

    it('lets an allowlisted price ID past the gate when the allowlist is populated', async () => {
      const getStripeClient = await loadSchemaWithEnv(
        'price_monthly_test',
        'price_annual_test',
      );
      getStripeClient.mockRejectedValue(new Error('past-allowlist-gate'));

      const resolve = getResolver('createCheckoutSession');
      await expect(
        resolve(
          {},
          checkoutArgs('price_annual_test'),
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('past-allowlist-gate');
      expect(getStripeClient).toHaveBeenCalledTimes(1);
    });

    it('still rejects a non-allowlisted price ID with UserInputError when populated', async () => {
      const getStripeClient = await loadSchemaWithEnv(
        'price_monthly_test',
        'price_annual_test',
      );

      const resolve = getResolver('createCheckoutSession');
      await expect(
        resolve(
          {},
          checkoutArgs('price_other'),
          mockContext,
          undefined as never,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('not a recognized subscription plan'),
        extensions: { code: 'BAD_USER_INPUT' },
      });
      expect(getStripeClient).not.toHaveBeenCalled();
    });

    it('accepts a single configured price ID (either env var populates the allowlist)', async () => {
      const getStripeClient = await loadSchemaWithEnv(
        'price_monthly_test',
        undefined,
      );
      getStripeClient.mockRejectedValue(new Error('past-allowlist-gate'));

      const resolve = getResolver('createCheckoutSession');
      await expect(
        resolve(
          {},
          checkoutArgs('price_monthly_test'),
          mockContext,
          undefined as never,
        ),
      ).rejects.toThrow('past-allowlist-gate');
    });
  });

  // LS-7426: the already-subscribed Billing Portal branch of
  // createCheckoutSession must return to portalReturnUrl, not cancelUrl (which
  // would land the user on ?checkout=canceled after a normal portal visit).
  describe('createCheckoutSession billing-portal branch (LS-7426)', () => {
    // LS-7421: an empty price allowlist now fails closed, so the price used
    // below must be allowlisted. The allowlist is read at module load, so
    // re-import the schema after setting the env var.
    const savedMonthly = process.env['STRIPE_MONTHLY_PRICE_ID'];

    beforeEach(async () => {
      process.env['STRIPE_MONTHLY_PRICE_ID'] = 'price_123';
      jest.resetModules();
      schema = (await import('./index')).schema;
    });

    afterEach(() => {
      if (savedMonthly === undefined)
        delete process.env['STRIPE_MONTHLY_PRICE_ID'];
      else process.env['STRIPE_MONTHLY_PRICE_ID'] = savedMonthly;
    });

    it('uses portalReturnUrl, not cancelUrl, as the portal return_url', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [
                  {
                    id: 1,
                    status: 'active',
                    tier: 'premium',
                    stripeCustomerId: 'cus_123',
                  },
                ],
              }),
            }),
          }),
        }),
      };
      const dbClient = jest.requireMock('@legacy-sports/db-client');
      dbClient.runWithInternalClient.mockImplementation(
        async (_opts: unknown, cb: (db: typeof mockDb) => unknown) =>
          cb(mockDb),
      );

      const portalCreate = jest
        .fn()
        .mockResolvedValue({ url: 'https://billing.stripe.com/p/session' });
      const checkoutCreate = jest.fn();
      jest.requireMock('../server/stripe').getStripeClient.mockResolvedValue({
        billingPortal: { sessions: { create: portalCreate } },
        checkout: { sessions: { create: checkoutCreate } },
      });

      const resolve = getResolver('createCheckoutSession');
      const result = await resolve(
        {},
        {
          priceId: 'price_123',
          successUrl:
            'https://app.legacy-fantasy.com/profile/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}',
          cancelUrl:
            'https://app.legacy-fantasy.com/profile/subscription?checkout=canceled',
          portalReturnUrl:
            'https://app.legacy-fantasy.com/profile/subscription',
        },
        mockContext,
        undefined as never,
      );

      expect(result).toEqual({ url: 'https://billing.stripe.com/p/session' });
      expect(portalCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://app.legacy-fantasy.com/profile/subscription',
      });
      expect(checkoutCreate).not.toHaveBeenCalled();
    });
  });
});
