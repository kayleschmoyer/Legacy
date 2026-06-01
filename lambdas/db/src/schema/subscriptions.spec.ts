/**
 * Tests for expireSubscriptionGracePeriods (LS-2614).
 *
 * Scheduled sweep that downgrades premium subscriptions whose grace period
 * has expired, closing the gap where Stripe stops retrying payment failures.
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
  getDbOptions: jest.fn(() => ({})),
}));

const mockRunWithInternalClient = jest.fn();
const mockHandleSubscriptionDowngrade = jest.fn();
const mockClearLeagueTierFreezes = jest.fn();
const mockReapplyLeagueRestrictions = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  runWithInternalClient: (...args: unknown[]) =>
    mockRunWithInternalClient(...args),
  handleSubscriptionDowngrade: (...args: unknown[]) =>
    mockHandleSubscriptionDowngrade(...args),
  clearLeagueTierFreezes: (...args: unknown[]) =>
    mockClearLeagueTierFreezes(...args),
  reapplyLeagueRestrictions: (...args: unknown[]) =>
    mockReapplyLeagueRestrictions(...args),
  InternalSchema: {
    subscriptions: {
      id: 'subscriptions.id',
      userId: 'subscriptions.user_id',
      stripeSubscriptionId: 'subscriptions.stripe_subscription_id',
      gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
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

// Stub out the Stripe client loader (subscriptions.ts imports it at the top).
jest.mock('../server/stripe', () => ({
  getStripeClient: jest.fn(),
}));

// Stub out apple-jws (imports jose which is ESM-only and cannot be loaded by Jest).
jest.mock('../apple-jws', () => ({
  decodeAndVerifyJwsTransaction: jest.fn(),
}));

// Stub out the Google Play client loader (subscriptions.ts imports it at the top).
jest.mock('../server/google-play', () => ({
  fetchGoogleSubscription: jest.fn(),
  isActiveGoogleSubscription: jest.fn(),
  GOOGLE_PLAY_PACKAGE_NAME: 'com.legacySports',
}));

import {
  _resetStripePricesCache,
  expireSubscriptionGracePeriods,
  fetchStripePrices,
  getOrCreateStripeCustomer,
  shouldRedirectToBillingPortal,
} from './subscriptions';

type NotifyMock = jest.Mock<
  Promise<void>,
  [number, 'free' | 'premium', string]
>;

function makeNotificationService(notify: NotifyMock) {
  return {
    notifySubscriptionUpdated: notify,
  } as unknown as Parameters<typeof expireSubscriptionGracePeriods>[0];
}

/** Build a DB stub that returns `selectRows` for the initial SELECT, and
 *  resolves all chained update().set().where() calls. */
function makeDb(selectRows: unknown[]) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve(selectRows)),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve()),
      })),
    })),
  };
}

describe('expireSubscriptionGracePeriods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns expired=0 and no errors when no rows match', async () => {
    const db = makeDb([]);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );

    const result = await expireSubscriptionGracePeriods(null);

    expect(result).toEqual({ expired: 0, errors: [] });
    expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
  });

  it('downgrades each expired row and invokes side effects', async () => {
    const rows = [
      {
        id: 1,
        userId: 101,
        stripeSubscriptionId: 'sub_A',
        gracePeriodEndsAt: new Date('2026-04-01T00:00:00Z'),
      },
      {
        id: 2,
        userId: 102,
        stripeSubscriptionId: 'sub_B',
        gracePeriodEndsAt: new Date('2026-04-02T00:00:00Z'),
      },
    ];
    const db = makeDb(rows);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );
    mockHandleSubscriptionDowngrade.mockResolvedValue(undefined);

    const notify: NotifyMock = jest.fn().mockResolvedValue(undefined);
    const result = await expireSubscriptionGracePeriods(
      makeNotificationService(notify),
    );

    expect(result).toEqual({ expired: 2, errors: [] });
    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledTimes(2);
    expect(mockHandleSubscriptionDowngrade).toHaveBeenNthCalledWith(1, 101, {});
    expect(mockHandleSubscriptionDowngrade).toHaveBeenNthCalledWith(2, 102, {});
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(101, 'free', 'past_due');
    expect(notify).toHaveBeenCalledWith(102, 'free', 'past_due');
    // Two updates per row: subscriptions + usersInAppInternal. One initial
    // select adds one more. Total writes == rows.length * 2.
    expect(db.update).toHaveBeenCalledTimes(rows.length * 2);
  });

  it('records per-row errors without aborting remaining rows', async () => {
    const rows = [
      {
        id: 3,
        userId: 201,
        stripeSubscriptionId: 'sub_X',
        gracePeriodEndsAt: new Date('2026-04-01T00:00:00Z'),
      },
      {
        id: 4,
        userId: 202,
        stripeSubscriptionId: 'sub_Y',
        gracePeriodEndsAt: new Date('2026-04-02T00:00:00Z'),
      },
    ];
    const db = makeDb(rows);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );
    mockHandleSubscriptionDowngrade
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const result = await expireSubscriptionGracePeriods(null);

    expect(result.expired).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('User 201');
    expect(result.errors[0]).toContain('boom');
  });

  it('treats WebSocket notification failures as non-fatal', async () => {
    const rows = [
      {
        id: 5,
        userId: 301,
        stripeSubscriptionId: 'sub_N',
        gracePeriodEndsAt: new Date('2026-04-01T00:00:00Z'),
      },
    ];
    const db = makeDb(rows);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );
    mockHandleSubscriptionDowngrade.mockResolvedValue(undefined);
    const notify: NotifyMock = jest
      .fn()
      .mockRejectedValue(new Error('ws offline'));

    const result = await expireSubscriptionGracePeriods(
      makeNotificationService(notify),
    );

    expect(result).toEqual({ expired: 1, errors: [] });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('works without a notification service (EventBridge cold start)', async () => {
    const rows = [
      {
        id: 6,
        userId: 401,
        stripeSubscriptionId: 'sub_Z',
        gracePeriodEndsAt: new Date('2026-04-01T00:00:00Z'),
      },
    ];
    const db = makeDb(rows);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );
    mockHandleSubscriptionDowngrade.mockResolvedValue(undefined);

    const result = await expireSubscriptionGracePeriods(undefined);

    expect(result).toEqual({ expired: 1, errors: [] });
    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(401, {});
  });
});

// ─── getOrCreateStripeCustomer (LS-5129) ─────────────────────────────────────

function makeStripe(overrides?: {
  retrieve?: jest.Mock;
  create?: jest.Mock;
  list?: jest.Mock;
}) {
  return {
    customers: {
      retrieve: overrides?.retrieve ?? jest.fn(),
      create: overrides?.create ?? jest.fn(),
      list: overrides?.list ?? jest.fn(),
    },
  } as unknown as import('stripe').default;
}

describe('getOrCreateStripeCustomer', () => {
  it('retrieves by stored ID when existingCustomerId is provided', async () => {
    const existing = { id: 'cus_stored', deleted: false, metadata: {} };
    const retrieve = jest.fn().mockResolvedValue(existing);
    const create = jest.fn();
    const list = jest.fn();
    const stripe = makeStripe({ retrieve, create, list });

    const result = await getOrCreateStripeCustomer(
      stripe,
      1,
      'user@example.com',
      'cus_stored',
    );

    expect(result).toBe(existing);
    expect(retrieve).toHaveBeenCalledWith('cus_stored');
    expect(create).not.toHaveBeenCalled();
    // Must never list by email — that's the security bug being fixed.
    expect(list).not.toHaveBeenCalled();
  });

  it('creates a new customer when no existingCustomerId is provided', async () => {
    const created = { id: 'cus_new', deleted: false, metadata: {} };
    const retrieve = jest.fn();
    const create = jest.fn().mockResolvedValue(created);
    const list = jest.fn();
    const stripe = makeStripe({ retrieve, create, list });

    const result = await getOrCreateStripeCustomer(
      stripe,
      2,
      'new@example.com',
    );

    expect(result).toBe(created);
    expect(create).toHaveBeenCalledWith({
      email: 'new@example.com',
      metadata: { userId: '2' },
    });
    expect(retrieve).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('creates a new customer when existingCustomerId is null', async () => {
    const created = { id: 'cus_null', deleted: false, metadata: {} };
    const retrieve = jest.fn();
    const create = jest.fn().mockResolvedValue(created);
    const stripe = makeStripe({ retrieve, create });

    const result = await getOrCreateStripeCustomer(
      stripe,
      3,
      'null@example.com',
      null,
    );

    expect(result).toBe(created);
    expect(create).toHaveBeenCalledWith({
      email: 'null@example.com',
      metadata: { userId: '3' },
    });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('creates a new customer when stored Stripe customer has been deleted', async () => {
    const deleted = { id: 'cus_deleted', deleted: true };
    const created = { id: 'cus_fresh', deleted: false, metadata: {} };
    const retrieve = jest.fn().mockResolvedValue(deleted);
    const create = jest.fn().mockResolvedValue(created);
    const stripe = makeStripe({ retrieve, create });

    const result = await getOrCreateStripeCustomer(
      stripe,
      4,
      'gone@example.com',
      'cus_deleted',
    );

    expect(result).toBe(created);
    expect(retrieve).toHaveBeenCalledWith('cus_deleted');
    expect(create).toHaveBeenCalledWith({
      email: 'gone@example.com',
      metadata: { userId: '4' },
    });
  });

  it('omits email when email string is empty', async () => {
    const created = { id: 'cus_noemail', deleted: false, metadata: {} };
    const create = jest.fn().mockResolvedValue(created);
    const stripe = makeStripe({ create });

    await getOrCreateStripeCustomer(stripe, 5, '');

    expect(create).toHaveBeenCalledWith({
      email: undefined,
      metadata: { userId: '5' },
    });
  });
});

// ─── fetchStripePrices (LS-5134) ─────────────────────────────────────────────

import { getStripeClient } from '../server/stripe';

function makeStripeWithPrices(monthly: number, annual: number) {
  const retrieve = jest
    .fn()
    .mockResolvedValueOnce({ unit_amount: monthly })
    .mockResolvedValueOnce({ unit_amount: annual });
  (getStripeClient as jest.Mock).mockResolvedValue({
    prices: { retrieve },
  } as unknown as import('stripe').default);
  return retrieve;
}

describe('fetchStripePrices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetStripePricesCache();
    process.env['STRIPE_MONTHLY_PRICE_ID'] = 'price_monthly';
    process.env['STRIPE_ANNUAL_PRICE_ID'] = 'price_annual';
  });

  afterEach(() => {
    delete process.env['STRIPE_MONTHLY_PRICE_ID'];
    delete process.env['STRIPE_ANNUAL_PRICE_ID'];
    _resetStripePricesCache();
  });

  it('deduplicates concurrent calls — only one Stripe fetch fires (thundering herd protection)', async () => {
    const retrieve = makeStripeWithPrices(999, 8999);

    const results = await Promise.all([
      fetchStripePrices(),
      fetchStripePrices(),
      fetchStripePrices(),
    ]);

    // All three callers share the same in-flight promise: retrieve fires exactly
    // twice (once for monthly, once for annual), not 6 times.
    expect(retrieve).toHaveBeenCalledTimes(2);
    for (const r of results) {
      expect(r).toEqual({
        monthlyPriceCents: 999,
        annualTotalCents: 8999,
        monthlyPriceId: 'price_monthly',
        annualPriceId: 'price_annual',
      });
    }
  });

  it('returns cached promise on subsequent calls within TTL', async () => {
    const retrieve = makeStripeWithPrices(500, 4999);

    await fetchStripePrices();
    await fetchStripePrices();

    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('clears cache on failure so the next call retries', async () => {
    // Promise.all calls retrieve for both price IDs simultaneously on each attempt,
    // so 4 Once values are needed: [monthly-fail, annual-fail, monthly-ok, annual-ok].
    const retrieve = jest
      .fn()
      .mockRejectedValueOnce(new Error('Stripe timeout')) // monthly, attempt 1 → rejects Promise.all
      .mockResolvedValueOnce({ unit_amount: 0 }) // annual, attempt 1 → consumed but discarded
      .mockResolvedValueOnce({ unit_amount: 999 }) // monthly, attempt 2
      .mockResolvedValueOnce({ unit_amount: 8999 }); // annual, attempt 2
    const client = {
      prices: { retrieve },
    } as unknown as import('stripe').default;
    (getStripeClient as jest.Mock).mockResolvedValue(client);

    await expect(fetchStripePrices()).rejects.toThrow('Stripe timeout');

    // Allow the .catch handler to clear the cache.
    await Promise.resolve();

    const result = await fetchStripePrices();
    expect(result.monthlyPriceCents).toBe(999);
    expect(result.annualTotalCents).toBe(8999);
  });

  it('throws when price IDs are not configured', async () => {
    delete process.env['STRIPE_MONTHLY_PRICE_ID'];

    await expect(fetchStripePrices()).rejects.toThrow(
      'Stripe price IDs are not configured',
    );
  });
});

// ─── shouldRedirectToBillingPortal (LS-5196) ─────────────────────────────────

describe('shouldRedirectToBillingPortal', () => {
  it('redirects active subscribers with a Stripe customer', () => {
    expect(
      shouldRedirectToBillingPortal({
        status: 'active',
        stripeCustomerId: 'cus_active',
      }),
    ).toBe(true);
  });

  it('redirects past_due subscribers with a Stripe customer', () => {
    expect(
      shouldRedirectToBillingPortal({
        status: 'past_due',
        stripeCustomerId: 'cus_pastdue',
      }),
    ).toBe(true);
  });

  // Regression: a trialing user previously fell through this check and was
  // allowed to create a new checkout session, duplicating their subscription.
  it('redirects trialing subscribers with a Stripe customer (LS-5196)', () => {
    expect(
      shouldRedirectToBillingPortal({
        status: 'trialing',
        stripeCustomerId: 'cus_trial',
      }),
    ).toBe(true);
  });

  it('does not redirect when there is no Stripe customer ID', () => {
    expect(
      shouldRedirectToBillingPortal({
        status: 'trialing',
        stripeCustomerId: null,
      }),
    ).toBe(false);
  });

  it('does not redirect canceled or incomplete subscriptions', () => {
    expect(
      shouldRedirectToBillingPortal({
        status: 'canceled',
        stripeCustomerId: 'cus_canceled',
      }),
    ).toBe(false);
    expect(
      shouldRedirectToBillingPortal({
        status: 'incomplete',
        stripeCustomerId: 'cus_incomplete',
      }),
    ).toBe(false);
  });

  it('does not redirect when there is no existing subscription', () => {
    expect(shouldRedirectToBillingPortal(null)).toBe(false);
    expect(shouldRedirectToBillingPortal(undefined)).toBe(false);
  });
});
