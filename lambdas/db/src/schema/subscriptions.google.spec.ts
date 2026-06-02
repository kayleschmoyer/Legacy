/**
 * Unit tests for tierAndStatusFromGoogleSubscription (LS-5140).
 *
 * restoreGooglePurchases previously set status:active unconditionally; now it
 * validates the purchase token via the Play Developer API and maps the
 * SubscriptionPurchaseV2 state to a tier/status before writing to the DB.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('@legacy-sports/utils/node', () => ({
  ...jest.requireActual('@legacy-sports/utils/node'),
  getDbOptions: jest.fn(() => ({})),
}));
jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  runWithInternalClient: jest.fn(),
  handleSubscriptionDowngrade: jest.fn(),
  clearLeagueTierFreezes: jest.fn(),
  reapplyLeagueRestrictions: jest.fn(),
  InternalSchema: {
    subscriptions: {
      id: 'subscriptions.id',
      userId: 'subscriptions.user_id',
      googlePurchaseToken: 'subscriptions.google_purchase_token',
      status: 'subscriptions.status',
      tier: 'subscriptions.tier',
      updatedAt: 'subscriptions.updated_at',
    },
    usersInAppInternal: {
      id: 'users.id',
      subscriptionTier: 'users.subscription_tier',
      updatedAt: 'users.updated_at',
    },
  },
}));
jest.mock('../server/stripe', () => ({ getStripeClient: jest.fn() }));
jest.mock('../server/google-play', () => ({
  fetchGoogleSubscription: jest.fn(),
  GOOGLE_PLAY_PACKAGE_NAME: 'com.legacysports.app',
  isActiveGoogleSubscription: jest.fn(),
}));
jest.mock('../apple-jws', () => ({
  decodeAndVerifyJwsTransaction: jest.fn(),
}));

import { tierAndStatusFromGoogleSubscription } from './subscriptions';
import type { SubscriptionPurchaseV2 } from '../server/google-play';

const PRODUCT_ID = 'com.legacysports.app.premium.monthly';
const EXPIRY = '2030-12-31T00:00:00Z';

function makeSubscription(
  subscriptionState: SubscriptionPurchaseV2['subscriptionState'],
  expiryTime?: string,
): SubscriptionPurchaseV2 {
  return {
    subscriptionState,
    lineItems: [{ productId: PRODUCT_ID, expiryTime }],
  };
}

describe('tierAndStatusFromGoogleSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns premium/active for SUBSCRIPTION_STATE_ACTIVE', () => {
    const result = tierAndStatusFromGoogleSubscription(
      makeSubscription('SUBSCRIPTION_STATE_ACTIVE', EXPIRY),
      PRODUCT_ID,
    );
    expect(result.tier).toBe('premium');
    expect(result.status).toBe('active');
    expect(result.currentPeriodEnd).toEqual(new Date(EXPIRY));
  });

  it('returns premium/past_due for SUBSCRIPTION_STATE_IN_GRACE_PERIOD', () => {
    const result = tierAndStatusFromGoogleSubscription(
      makeSubscription('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', EXPIRY),
      PRODUCT_ID,
    );
    expect(result.tier).toBe('premium');
    expect(result.status).toBe('past_due');
    expect(result.currentPeriodEnd).toEqual(new Date(EXPIRY));
  });

  it('returns free/canceled for SUBSCRIPTION_STATE_CANCELED', () => {
    const result = tierAndStatusFromGoogleSubscription(
      makeSubscription('SUBSCRIPTION_STATE_CANCELED'),
      PRODUCT_ID,
    );
    expect(result.tier).toBe('free');
    expect(result.status).toBe('canceled');
    expect(result.currentPeriodEnd).toBeNull();
  });

  it('returns free/canceled for SUBSCRIPTION_STATE_EXPIRED', () => {
    const result = tierAndStatusFromGoogleSubscription(
      makeSubscription('SUBSCRIPTION_STATE_EXPIRED'),
      PRODUCT_ID,
    );
    expect(result.tier).toBe('free');
    expect(result.status).toBe('canceled');
  });

  it('returns free/canceled for SUBSCRIPTION_STATE_ON_HOLD', () => {
    const result = tierAndStatusFromGoogleSubscription(
      makeSubscription('SUBSCRIPTION_STATE_ON_HOLD'),
      PRODUCT_ID,
    );
    expect(result.tier).toBe('free');
    expect(result.status).toBe('canceled');
  });

  it('returns free/canceled for SUBSCRIPTION_STATE_PAUSED', () => {
    const result = tierAndStatusFromGoogleSubscription(
      makeSubscription('SUBSCRIPTION_STATE_PAUSED'),
      PRODUCT_ID,
    );
    expect(result.tier).toBe('free');
    expect(result.status).toBe('canceled');
  });

  it('returns null currentPeriodEnd when no lineItems match the productId', () => {
    const subscription: SubscriptionPurchaseV2 = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId: 'com.other.product', expiryTime: EXPIRY }],
    };
    const result = tierAndStatusFromGoogleSubscription(
      subscription,
      PRODUCT_ID,
    );
    expect(result.currentPeriodEnd).toBeNull();
  });

  it('returns null currentPeriodEnd when lineItems is absent', () => {
    const subscription: SubscriptionPurchaseV2 = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    };
    const result = tierAndStatusFromGoogleSubscription(
      subscription,
      PRODUCT_ID,
    );
    expect(result.currentPeriodEnd).toBeNull();
  });

  it('logs a warning and returns free/canceled for an unknown subscriptionState', () => {
    const unknownState = 'SUBSCRIPTION_STATE_NEW_UNKNOWN_FUTURE_STATE';
    const sub = {
      subscriptionState: unknownState,
      lineItems: [],
    } as unknown as SubscriptionPurchaseV2;
    const result = tierAndStatusFromGoogleSubscription(sub, PRODUCT_ID);
    expect(result.tier).toBe('free');
    expect(result.status).toBe('canceled');
    // Access via requireMock (any) to avoid @typescript-eslint/unbound-method
    const logMock = jest.requireMock('@legacy-sports/logging');
    expect(logMock.LOGGER.warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown subscriptionState'),
      expect.objectContaining({ subscriptionState: unknownState }),
    );
  });
});
