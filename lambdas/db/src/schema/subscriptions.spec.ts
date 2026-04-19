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

import { expireSubscriptionGracePeriods } from './subscriptions';

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
