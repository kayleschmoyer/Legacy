/**
 * Integration tests for Google Play mutation resolver validation paths (LS-5121).
 *
 * Verifies that verifyGooglePurchase throws UserInputError and
 * restoreGooglePurchases returns false when fetchGoogleSubscription
 * returns an inactive subscription state.
 */

import type { GraphQLSchema } from 'graphql';

// jose is ESM-only (v6) and cannot be parsed by jest's CJS transform. It is
// pulled in transitively via apple-jws.ts when the schema is imported. These
// tests only exercise the Google Play path and never touch Apple JWS
// verification, so mock it out (mirrors apple-jws.spec.ts).
jest.mock('jose', () => ({
  decodeProtectedHeader: jest.fn(),
  importX509: jest.fn(),
  jwtVerify: jest.fn(),
}));

describe('Google Play mutation validation (LS-5121)', () => {
  let schema: GraphQLSchema;
  let mockFetchGoogleSubscription: jest.Mock;
  let mockIsActiveGoogleSubscription: jest.Mock;
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
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    jest.doMock('@legacy-sports/logging', () => ({ LOGGER: mockLogger }));

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
});
