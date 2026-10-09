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

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
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
        stripeCustomerId: 'subscriptions.stripe_customer_id',
        stripeSubscriptionId: 'subscriptions.stripe_subscription_id',
        currentPeriodEnd: 'subscriptions.current_period_end',
        cancelAtPeriodEnd: 'subscriptions.cancel_at_period_end',
        trialEndsAt: 'subscriptions.trial_ends_at',
        gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
        status: 'subscriptions.status',
        tier: 'subscriptions.tier',
        createdAt: 'subscriptions.created_at',
        updatedAt: 'subscriptions.updated_at',
      },
      usersInAppInternal: {
        id: 'users.id',
        subscriptionTier: 'users.subscription_tier',
        updatedAt: 'users.updated_at',
      },
    },
  }),
);

// Stub out the Stripe client loader (subscriptions.ts imports it at the top).
jest.mock('@legacy-sports/rollbar', () => ({
  captureWarning: jest.fn(),
}));

jest.mock('../server/stripe', () => ({
  getStripeClient: jest.fn(),
}));

// Stub out apple-jws to prevent real Apple JWS crypto calls in tests.
jest.mock('../apple-jws', () => ({
  decodeAndVerifyJwsTransaction: jest.fn(),
}));

// Stub out the Google Play client loader (subscriptions.ts imports it at the top).
jest.mock('../server/google-play', () => ({
  fetchGoogleSubscription: jest.fn(),
  isActiveGoogleSubscription: jest.fn(),
  GOOGLE_PLAY_PACKAGE_NAME: 'com.legacySports',
}));

// Keep drizzle-orm helpers real, but make `desc()` produce an assertable marker
// so getSubscriptionForUser's ORDER BY arguments can be checked (LS-5201).
jest.mock('drizzle-orm', () =>
  mockDrizzleOrm({
    desc: (col: unknown) => `${String(col)}-desc`,
  }),
);

import { isObjectType } from 'graphql';
import { captureWarning } from '@legacy-sports/rollbar';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import {
  _resetAdminRevenueStatsCache,
  _resetStripePricesCache,
  billingIntervalFromStripe,
  buildCheckoutTrialParams,
  computeRevenueCents,
  deriveSubscriptionManagedBy,
  expireSubscriptionGracePeriods,
  fetchStripePrices,
  getCachedAdminRevenueStats,
  getOrCreateStripeCustomer,
  getSubscriptionForUser,
  logCheckoutTrial,
  parseTrialPeriodDays,
  requireCheckoutEmail,
  shouldRedirectToBillingPortal,
  subscriptionStatusPriority,
  toRetryInvoiceResult,
} from './subscriptions';
import { builder } from './builder';

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
 *  resolves all chained update().set().where() calls.
 *
 *  The atomic claim on the subscriptions table (`.where().returning()`) yields
 *  the row unless `claim(row)` says a concurrent run already took it — by
 *  default every candidate is claimed.  Claim attempts are matched to
 *  candidates in order (one attempt per candidate, since the sweep iterates
 *  `selectRows` sequentially). */
function makeDb(
  selectRows: Array<Record<string, unknown>>,
  claim: (row: Record<string, unknown>) => boolean = () => true,
) {
  let claimAttempt = 0;
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve(selectRows)),
      })),
    })),
    update: jest.fn((table: { id: string }) => ({
      set: jest.fn(() => ({
        where: jest.fn(() => {
          if (table.id !== 'subscriptions.id') return Promise.resolve();
          const row = selectRows[claimAttempt++];
          return {
            returning: jest.fn(() =>
              Promise.resolve(row && claim(row) ? [row] : []),
            ),
          };
        }),
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

  it('skips side effects for rows a concurrent run already claimed (LS-7399)', async () => {
    const rows = [
      {
        id: 7,
        userId: 501,
        stripeSubscriptionId: 'sub_claimed',
        gracePeriodEndsAt: new Date('2026-04-01T00:00:00Z'),
      },
      {
        id: 8,
        userId: 502,
        stripeSubscriptionId: 'sub_free',
        gracePeriodEndsAt: new Date('2026-04-02T00:00:00Z'),
      },
    ];
    const db = makeDb(rows, (row) => row['id'] !== 7);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );
    mockHandleSubscriptionDowngrade.mockResolvedValue(undefined);
    const notify: NotifyMock = jest.fn().mockResolvedValue(undefined);

    const result = await expireSubscriptionGracePeriods(
      makeNotificationService(notify),
    );

    expect(result).toEqual({ expired: 1, errors: [] });
    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledTimes(1);
    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(502, {});
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(502, 'free', 'past_due');
    // Claim attempt for both rows, but the users-table update only for the
    // claimed one: 2 subscription updates + 1 user update.
    expect(db.update).toHaveBeenCalledTimes(3);
  });

  it('processes each row exactly once when two invocations see the same candidate (LS-7399)', async () => {
    const candidate = {
      id: 9,
      userId: 601,
      stripeSubscriptionId: 'sub_race',
      gracePeriodEndsAt: new Date('2026-04-01T00:00:00Z'),
    };
    // Shared "database": the first UPDATE to reach the row wins; the row is no
    // longer premium afterwards, so the second conditional UPDATE matches nothing.
    const claimedIds = new Set<number>();
    const claimOnce = (row: Record<string, unknown>) => {
      const id = row['id'] as number;
      if (claimedIds.has(id)) return false;
      claimedIds.add(id);
      return true;
    };
    // Both invocations SELECT before either UPDATE, so both "see" the row.
    const dbA = makeDb([candidate], claimOnce);
    const dbB = makeDb([candidate], claimOnce);
    const dbs = [dbA, dbB];
    let selectCalls = 0;
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
        // The first call of each invocation is the candidate SELECT; hand out
        // dbA then dbB, then reuse each invocation's own db for its updates.
        const db = dbs[selectCalls % 2];
        selectCalls++;
        return cb(db);
      },
    );
    mockHandleSubscriptionDowngrade.mockResolvedValue(undefined);
    const notify: NotifyMock = jest.fn().mockResolvedValue(undefined);
    const service = makeNotificationService(notify);

    const [resultA, resultB] = await Promise.all([
      expireSubscriptionGracePeriods(service),
      expireSubscriptionGracePeriods(service),
    ]);

    expect(resultA.expired + resultB.expired).toBe(1);
    expect(resultA.errors).toEqual([]);
    expect(resultB.errors).toEqual([]);
    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledTimes(1);
    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(601, {});
    expect(notify).toHaveBeenCalledTimes(1);
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

function makeStripeWithPrices(
  monthly: number,
  annual: number,
  currency = 'usd',
) {
  const retrieve = jest
    .fn()
    .mockResolvedValueOnce({ unit_amount: monthly, currency })
    .mockResolvedValueOnce({ unit_amount: annual, currency });
  (getStripeClient as jest.Mock).mockResolvedValue({
    prices: { retrieve },
  });
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
        currency: 'usd',
      });
    }
  });

  it('exposes the Stripe Price currency (LS-7195)', async () => {
    makeStripeWithPrices(499, 3999, 'jpy');

    const result = await fetchStripePrices();

    expect(result.currency).toBe('jpy');
  });

  it('rejects when monthly and annual prices use different currencies (LS-7195)', async () => {
    const retrieve = jest
      .fn()
      .mockResolvedValueOnce({ unit_amount: 499, currency: 'usd' })
      .mockResolvedValueOnce({ unit_amount: 3999, currency: 'eur' });
    (getStripeClient as jest.Mock).mockResolvedValue({ prices: { retrieve } });

    await expect(fetchStripePrices()).rejects.toThrow(/share a currency/);
  });

  it('returns cached promise on subsequent calls within TTL', async () => {
    const retrieve = makeStripeWithPrices(500, 4999);

    await fetchStripePrices();
    await fetchStripePrices();

    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  describe('negative cache on failure (LS-7197)', () => {
    const failingClient = (retrieve: jest.Mock) =>
      (getStripeClient as jest.Mock).mockResolvedValue({
        prices: { retrieve },
      });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not re-hit Stripe within the 30s failure window and warns once', async () => {
      jest.useFakeTimers({ now: 1_000_000 });
      const retrieve = jest.fn().mockRejectedValue(new Error('Stripe timeout'));
      failingClient(retrieve);

      await expect(fetchStripePrices()).rejects.toThrow('Stripe timeout');
      jest.setSystemTime(1_000_000 + 29_000);
      await expect(fetchStripePrices()).rejects.toThrow('Stripe timeout');

      // monthly + annual retrieve on the single attempt only
      expect(retrieve).toHaveBeenCalledTimes(2);
      expect(captureWarning).toHaveBeenCalledTimes(1);
    });

    it('retries after the failure window elapses', async () => {
      jest.useFakeTimers({ now: 1_000_000 });
      const retrieve = jest
        .fn()
        .mockRejectedValueOnce(new Error('Stripe timeout')) // monthly, attempt 1
        .mockResolvedValueOnce({ unit_amount: 0 }) // annual, attempt 1 (discarded)
        .mockResolvedValueOnce({ unit_amount: 999, currency: 'usd' })
        .mockResolvedValueOnce({ unit_amount: 8999, currency: 'usd' });
      failingClient(retrieve);

      await expect(fetchStripePrices()).rejects.toThrow('Stripe timeout');
      jest.setSystemTime(1_000_000 + 31_000);

      const result = await fetchStripePrices();
      expect(result.monthlyPriceCents).toBe(999);
      expect(result.annualTotalCents).toBe(8999);
    });
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

// ─── buildCheckoutTrialParams (LS-5200) ──────────────────────────────────────

describe('buildCheckoutTrialParams', () => {
  it('defers card collection and applies trial days when a trial is configured', () => {
    expect(buildCheckoutTrialParams(14)).toEqual({
      session: { payment_method_collection: 'if_required' },
      subscription: { trial_period_days: 14 },
    });
  });

  it('returns empty fragments when no trial is configured (undefined)', () => {
    expect(buildCheckoutTrialParams(undefined)).toEqual({
      session: {},
      subscription: {},
    });
  });

  it('returns empty fragments when the trial period is zero', () => {
    // A 0-day trial is not a trial — checkout must still collect a card, so the
    // "no credit card required" copy must not be shown for this config (LS-5200).
    expect(buildCheckoutTrialParams(0)).toEqual({
      session: {},
      subscription: {},
    });
  });
});

describe('parseTrialPeriodDays (LS-7425)', () => {
  const { warn } = jest.requireMock<{ LOGGER: { warn: jest.Mock } }>(
    '@legacy-sports/logging',
  ).LOGGER;
  beforeEach(() => warn.mockClear());

  it.each([
    ['0', 0],
    ['14', 14],
    ['90', 90],
  ])('passes in-range %s through without warning', (raw, expected) => {
    expect(parseTrialPeriodDays(raw)).toBe(expected);
    expect(warn).not.toHaveBeenCalled();
  });

  it('clamps negative values to 0 and warns', () => {
    expect(parseTrialPeriodDays('-5')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each(['91', '999999'])('clamps %s to 90 and warns', (raw) => {
    expect(parseTrialPeriodDays(raw)).toBe(90);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for non-numeric input', () => {
    expect(parseTrialPeriodDays('abc')).toBeUndefined();
  });

  it('returns undefined for missing or empty input', () => {
    expect(parseTrialPeriodDays(undefined)).toBeUndefined();
    expect(parseTrialPeriodDays('')).toBeUndefined();
  });
});

describe('logCheckoutTrial (LS-7425)', () => {
  const { info } = jest.requireMock<{ LOGGER: { info: jest.Mock } }>(
    '@legacy-sports/logging',
  ).LOGGER;
  beforeEach(() => info.mockClear());

  it('logs the applied trial days with userId', () => {
    logCheckoutTrial(7, buildCheckoutTrialParams(14));
    expect(info).toHaveBeenCalledWith(expect.any(String), {
      userId: 7,
      trialPeriodDays: 14,
    });
  });

  it('explicitly logs when no trial is applied', () => {
    logCheckoutTrial(7, buildCheckoutTrialParams(undefined));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('no trial'), {
      userId: 7,
    });
  });
});

describe('getSubscriptionForUser (LS-5201, LS-7383)', () => {
  /**
   * Build a DB stub recording the SELECT chain. `.where()` returns an object
   * exposing `.orderBy()` and `.limit()` so we can assert the query is ordered
   * before the row is taken — without ORDER BY, `.limit(1)` could return a
   * stale canceled row after the user resubscribed.
   */
  function makeOrderedDb(selectRows: unknown[]) {
    const limit = jest.fn(() => Promise.resolve(selectRows));
    const orderBy = jest.fn(() => ({ limit }));
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    return { db: { select }, select, from, where, orderBy, limit };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderSql = (chunk: SQL) => new PgDialect().sqlToQuery(chunk).sql;

  it('orders by entitlement priority, period end, then id before limiting to one row (LS-7383)', async () => {
    const activeRow = { id: 2, status: 'active', tier: 'premium' };
    const { db, orderBy, limit } = makeOrderedDb([activeRow]);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );

    const result = await getSubscriptionForUser(42);

    // ORDER BY must be applied, and before the LIMIT.
    expect(orderBy).toHaveBeenCalledTimes(1);
    const [priorityArg, periodEndArg, idArg] = orderBy.mock
      .calls[0] as unknown as [string, SQL, string];
    // 1st: entitlement priority, descending (desc() is mocked to a marker
    // string; the CASE expression itself is asserted in the next test).
    expect(priorityArg).toMatch(/-desc$/);
    expect(priorityArg).not.toContain('subscriptions.');
    // 2nd: current_period_end DESC with NULLs last, so a dated row beats an
    // undated one within the same priority tier.
    expect(renderSql(periodEndArg)).toBe('$1 DESC NULLS LAST');
    // 3rd: id DESC as the final deterministic tiebreaker.
    expect(idArg).toBe('subscriptions.id-desc');
    expect(limit).toHaveBeenCalledWith(1);
    expect(orderBy.mock.invocationCallOrder[0]).toBeLessThan(
      limit.mock.invocationCallOrder[0],
    );
    // Returns the row the ordered query yields.
    expect(result).toBe(activeRow);
  });

  it('ranks active/trialing above past_due above canceled/inactive/other, so a newer canceled row cannot shadow an older active one', () => {
    // The DB applies this expression, so the regression guard is on the
    // expression itself rather than on pre-sorted fixtures.
    const text = renderSql(subscriptionStatusPriority()).replace(/\s+/g, ' ');
    expect(text).toBe(
      "CASE $1 WHEN 'active' THEN 3 WHEN 'trialing' THEN 3 WHEN 'past_due' THEN 2 ELSE 1 END",
    );
  });

  it('does not order by created_at, which would let a newer canceled row win', async () => {
    const { db, orderBy } = makeOrderedDb([]);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );

    await getSubscriptionForUser(42);

    // Render SQL chunks (column mocks surface as bound params) so the check
    // is not vacuous for the non-string ORDER BY arguments.
    const args = orderBy.mock.calls[0] as unknown[];
    const rendered = args
      .map((arg) => {
        if (typeof arg === 'string') {
          return arg;
        }
        const query = new PgDialect().sqlToQuery(arg as SQL);
        return `${query.sql} ${JSON.stringify(query.params)}`;
      })
      .join(' ');
    expect(rendered).toContain('subscriptions.current_period_end');
    expect(rendered).not.toContain('created_at');
  });

  it('returns null when the user has no subscription rows', async () => {
    const { db } = makeOrderedDb([]);
    mockRunWithInternalClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
    );

    expect(await getSubscriptionForUser(99)).toBeNull();
  });
});

describe('deriveSubscriptionManagedBy (LS-7403)', () => {
  const none = {
    stripeCustomerId: null,
    appleOriginalTransactionId: null,
    googlePurchaseToken: null,
  };

  it('returns stripe when a Stripe customer exists', () => {
    expect(
      deriveSubscriptionManagedBy({ ...none, stripeCustomerId: 'cus_1' }),
    ).toBe('stripe');
  });

  it('returns apple when only an Apple transaction id exists', () => {
    expect(
      deriveSubscriptionManagedBy({ ...none, appleOriginalTransactionId: '1' }),
    ).toBe('apple');
  });

  it('returns google when only a Google purchase token exists', () => {
    expect(
      deriveSubscriptionManagedBy({ ...none, googlePurchaseToken: 'tok' }),
    ).toBe('google');
  });

  it('falls back to stripe for legacy rows with no billing identifiers', () => {
    expect(deriveSubscriptionManagedBy(none)).toBe('stripe');
  });
});

// ─── computeRevenueCents (LS-5766) ────────────────────────────────────────────

describe('computeRevenueCents', () => {
  it('computes MRR as subscribers × monthly price', () => {
    const result = computeRevenueCents(100, 999);
    expect(result.mrrCents).toBe(99900);
  });

  it('computes ARR as MRR × 12', () => {
    const result = computeRevenueCents(100, 999);
    expect(result.arrCents).toBe(99900 * 12);
  });

  it('returns zero for both when there are no subscribers', () => {
    const result = computeRevenueCents(0, 999);
    expect(result.mrrCents).toBe(0);
    expect(result.arrCents).toBe(0);
  });
});

// ─── getCachedAdminRevenueStats (LS-5751) ─────────────────────────────────────

describe('getCachedAdminRevenueStats', () => {
  const fakeStats = {
    totalSubscribers: 10,
    stripeSubscribers: 8,
    totalPremiumUsers: 12,
    totalFreeUsers: 88,
    totalUsers: 100,
    conversionRate: 0.12,
    newSubscribersThisMonth: 3,
    mrrCents: null,
    arrCents: null,
    statusBreakdown: [],
    subscriberGrowth: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    _resetAdminRevenueStatsCache();
  });

  afterEach(() => {
    _resetAdminRevenueStatsCache();
  });

  it('runs the DB aggregate only once within the TTL window', async () => {
    mockRunWithInternalClient.mockResolvedValue(fakeStats);

    const first = await getCachedAdminRevenueStats();
    const second = await getCachedAdminRevenueStats();

    expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    expect(first).toEqual(fakeStats);
    expect(second).toEqual(fakeStats);
  });

  it('deduplicates concurrent callers onto a single in-flight compute', async () => {
    mockRunWithInternalClient.mockResolvedValue(fakeStats);

    const results = await Promise.all([
      getCachedAdminRevenueStats(),
      getCachedAdminRevenueStats(),
      getCachedAdminRevenueStats(),
    ]);

    expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r).toEqual(fakeStats);
    }
  });

  it('recomputes after the cache is reset', async () => {
    mockRunWithInternalClient.mockResolvedValue(fakeStats);

    await getCachedAdminRevenueStats();
    _resetAdminRevenueStatsCache();
    await getCachedAdminRevenueStats();

    expect(mockRunWithInternalClient).toHaveBeenCalledTimes(2);
  });

  it('clears the cache on failure so the next call retries', async () => {
    mockRunWithInternalClient
      .mockRejectedValueOnce(new Error('DB unavailable'))
      .mockResolvedValueOnce(fakeStats);

    await expect(getCachedAdminRevenueStats()).rejects.toThrow(
      'DB unavailable',
    );

    // Allow the .catch handler to clear the cache.
    await Promise.resolve();

    const result = await getCachedAdminRevenueStats();
    expect(result).toEqual(fakeStats);
    expect(mockRunWithInternalClient).toHaveBeenCalledTimes(2);
  });
});

// ─── createCheckoutSession email validation (LS-7422) ────────────────────────

describe('requireCheckoutEmail', () => {
  it('returns a valid email trimmed', () => {
    expect(requireCheckoutEmail('  user@example.com ')).toBe(
      'user@example.com',
    );
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace-only string', '   \t '],
    ['no @', 'not-an-email'],
    ['no dot after @', 'user@localhost'],
    ['inner whitespace', 'us er@example.com'],
    ['multiple @', 'a@b@example.com'],
  ])('throws UserInputError for %s', (_label, value) => {
    expect(() => requireCheckoutEmail(value)).toThrow(
      expect.objectContaining({
        extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
      }),
    );
  });
});

describe('createCheckoutSession resolver email guard (LS-7422)', () => {
  const PRICE_ID = 'price_test';

  function getResolver() {
    const field = builder.toSchema().getMutationType()?.getFields()[
      'createCheckoutSession'
    ];
    if (!field?.resolve) throw new Error('createCheckoutSession not found');
    const resolve = field.resolve;
    return (email: string | undefined, existing: unknown = null) => {
      const limit = jest.fn(() => Promise.resolve(existing ? [existing] : []));
      const db = {
        select: () => ({
          from: () => ({ where: () => ({ orderBy: () => ({ limit }) }) }),
        }),
      };
      mockRunWithInternalClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => cb(db),
      );
      return resolve(
        undefined,
        {
          priceId: PRICE_ID,
          successUrl: 'https://example.com/ok',
          cancelUrl: 'https://example.com/cancel',
        },
        { user: { id: 7, email } },
        {} as never,
      );
    };
  }

  function stubStripe() {
    const stripe = {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      checkout: { sessions: { create: jest.fn() } },
      billingPortal: {
        sessions: {
          create: jest.fn().mockResolvedValue({ url: 'https://portal' }),
        },
      },
    };
    (getStripeClient as jest.Mock).mockResolvedValue(stripe);
    return stripe;
  }

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
    ['malformed', 'not-an-email'],
  ])('rejects %s email without calling Stripe', async (_label, email) => {
    const stripe = stubStripe();
    const resolve = getResolver();

    await expect(resolve(email)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('still redirects to the billing portal for a subscribed user with no email', async () => {
    const stripe = stubStripe();
    const resolve = getResolver();

    const result = await resolve(undefined, {
      status: 'active',
      stripeCustomerId: 'cus_existing',
    });

    expect(result).toEqual({ url: 'https://portal' });
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });
});

// ─── SubscriptionInfo.billingInterval (LS-7171) ──────────────────────────────

describe('billingIntervalFromStripe', () => {
  it.each([
    ['month', 'monthly'],
    ['year', 'annual'],
    ['week', null],
    ['day', null],
    [undefined, null],
    [null, null],
  ])('maps %s to %s', (interval, expected) => {
    expect(billingIntervalFromStripe(interval)).toBe(expected);
  });
});

describe('SubscriptionInfo.billingInterval resolver', () => {
  function getResolver() {
    const type = builder.toSchema().getType('SubscriptionInfo');
    if (!isObjectType(type)) throw new Error('SubscriptionInfo not found');
    const field = type.getFields()['billingInterval'];
    if (!field?.resolve) throw new Error('billingInterval not found');
    const resolve = field.resolve;
    return (stripeSubscriptionId: string | null) =>
      resolve({ stripeSubscriptionId }, {}, {}, {} as never) as Promise<
        string | null
      >;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['year', 'annual'],
    ['month', 'monthly'],
  ])('resolves a Stripe %s subscription to %s', async (interval, expected) => {
    const retrieve = jest.fn().mockResolvedValue({
      items: { data: [{ price: { recurring: { interval } } }] },
    });
    (getStripeClient as jest.Mock).mockResolvedValue({
      subscriptions: { retrieve },
    });

    await expect(getResolver()('sub_123')).resolves.toBe(expected);
    expect(retrieve).toHaveBeenCalledWith('sub_123');
  });

  it('returns null without calling Stripe when there is no Stripe subscription', async () => {
    const retrieve = jest.fn();
    (getStripeClient as jest.Mock).mockResolvedValue({
      subscriptions: { retrieve },
    });

    await expect(getResolver()(null)).resolves.toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('returns null (unknown) when the Stripe lookup fails', async () => {
    (getStripeClient as jest.Mock).mockResolvedValue({
      subscriptions: {
        retrieve: jest.fn().mockRejectedValue(new Error('stripe down')),
      },
    });

    await expect(getResolver()('sub_123')).resolves.toBeNull();
  });

  it('returns null when the subscription has no line items', async () => {
    (getStripeClient as jest.Mock).mockResolvedValue({
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue({ items: { data: [] } }),
      },
    });

    await expect(getResolver()('sub_123')).resolves.toBeNull();
  });
});

// ─── toRetryInvoiceResult (LS-7398) ──────────────────────────────────────────

describe('toRetryInvoiceResult', () => {
  it('reports success for a paid invoice', () => {
    expect(toRetryInvoiceResult({ status: 'paid' })).toEqual({
      success: true,
      status: 'paid',
      message: null,
    });
  });

  it('reports failure with a retry message for a still-open invoice', () => {
    const result = toRetryInvoiceResult({ status: 'open' });
    expect(result.success).toBe(false);
    expect(result.status).toBe('open');
    expect(result.message).toMatch(/try again/i);
  });

  it('treats a missing status as unknown failure', () => {
    expect(toRetryInvoiceResult({ status: null }).success).toBe(false);
    expect(toRetryInvoiceResult({ status: null }).status).toBe('unknown');
  });
});
