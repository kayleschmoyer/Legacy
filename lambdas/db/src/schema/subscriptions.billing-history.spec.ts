/**
 * Tests for the subscriptionBillingHistory query helpers (LS-10403).
 */

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('@legacy-sports/logging', () => ({
  get LOGGER() {
    return mockLogger;
  },
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

const mockCaptureWarning = jest.fn();
jest.mock('@legacy-sports/rollbar', () => ({
  captureWarning: (...args: unknown[]) => mockCaptureWarning(...args),
}));

const mockRunWithInternalClient = jest.fn();
const mockLedgerTable = { __table: 'ledger' };

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    createDatabaseService: jest.fn(),
    runWithInternalClient: (...args: unknown[]) =>
      mockRunWithInternalClient(...args),
    handleSubscriptionDowngrade: jest.fn(),
    clearLeagueTierFreezes: jest.fn(),
    reapplyLeagueRestrictions: jest.fn(),
    InternalSchema: {
      subscriptions: {
        id: 'subscriptions.id',
        userId: 'subscriptions.user_id',
        stripeCustomerId: 'subscriptions.stripe_customer_id',
        appleOriginalTransactionId: 'subscriptions.apple_original_tx',
        googlePurchaseToken: 'subscriptions.google_purchase_token',
        currentPeriodEnd: 'subscriptions.current_period_end',
        status: 'subscriptions.status',
      },
      subscriptionTransactions: Object.assign(mockLedgerTable, {
        userId: 'tx.user_id',
        provider: 'tx.provider',
        eventType: 'tx.event_type',
        amountCents: 'tx.amount_cents',
        currency: 'tx.currency',
        providerEventId: 'tx.provider_event_id',
        occurredAt: 'tx.occurred_at',
      }),
    },
  }),
);

jest.mock('../server/stripe', () => ({ getStripeClient: jest.fn() }));
jest.mock('../apple-jws', () => ({ decodeAndVerifyJwsTransaction: jest.fn() }));
jest.mock('../server/google-play', () => ({
  fetchGoogleSubscription: jest.fn(),
  isActiveGoogleSubscription: jest.fn(),
  GOOGLE_PLAY_PACKAGE_NAME: 'com.legacySports',
}));
jest.mock('../server/app-store-server-api', () => ({
  fetchAppleTransactionHistory: jest.fn(),
}));

import {
  listBillingHistoryForUser,
  mergeBillingHistory,
} from './subscriptions';
import { getStripeClient } from '../server/stripe';
import { fetchGoogleSubscription } from '../server/google-play';
import { fetchAppleTransactionHistory } from '../server/app-store-server-api';

/** First select() is the subscriptions rows; the ledger select is routed by table. */
function mockDb(subscriptionRows: unknown[], ledgerRows: unknown[] = []) {
  const select = jest.fn(() => ({
    from: (table: unknown) => ({
      where: () =>
        table === mockLedgerTable
          ? Promise.resolve(ledgerRows)
          : { orderBy: () => Promise.resolve(subscriptionRows) },
    }),
  }));
  mockRunWithInternalClient.mockImplementation(
    async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) =>
      cb({ select }),
  );
}

function mockStripeInvoices(data: unknown[]) {
  (getStripeClient as jest.Mock).mockResolvedValue({
    invoices: { list: jest.fn().mockResolvedValue({ data }) },
  });
}

describe('listBillingHistoryForUser (LS-10403)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a single platform’s entries (stripe only)', async () => {
    mockDb([
      {
        id: 1,
        stripeCustomerId: 'cus_1',
        appleOriginalTransactionId: null,
        googlePurchaseToken: null,
      },
    ]);
    mockStripeInvoices([
      {
        id: 'in_1',
        amount_paid: 499,
        currency: 'usd',
        status: 'paid',
        created: 1700000000,
      },
    ]);

    const result = await listBillingHistoryForUser(7);

    expect(result).toEqual([
      expect.objectContaining({
        platform: 'stripe',
        amountCents: 499,
        currency: 'usd',
        status: 'paid',
        occurredAt: '2023-11-14T22:13:20.000Z',
      }),
    ]);
    expect(fetchAppleTransactionHistory).not.toHaveBeenCalled();
    expect(fetchGoogleSubscription).not.toHaveBeenCalled();
  });

  it('merges a switched-platform user across sources, newest first', async () => {
    mockDb(
      [
        {
          id: 2,
          stripeCustomerId: 'cus_1',
          appleOriginalTransactionId: 'orig_1',
          googlePurchaseToken: 'tok_1',
        },
        {
          id: 1,
          stripeCustomerId: 'cus_1',
          appleOriginalTransactionId: null,
          googlePurchaseToken: null,
        },
      ],
      [
        {
          provider: 'stripe',
          eventType: 'refund',
          amountCents: 499,
          currency: 'usd',
          providerEventId: 'ch_1',
          occurredAt: new Date('2023-12-01T00:00:00.000Z'),
        },
      ],
    );
    mockStripeInvoices([
      {
        id: 'in_1',
        amount_paid: 499,
        currency: 'usd',
        status: 'paid',
        created: Date.parse('2023-11-01T00:00:00Z') / 1000,
      },
    ]);
    (fetchAppleTransactionHistory as jest.Mock).mockResolvedValue([
      {
        transactionId: 'tx_1',
        purchaseDate: Date.parse('2024-01-01T00:00:00Z'),
        priceCents: 599,
        currency: 'USD',
        type: 'Auto-Renewable Subscription',
        revocation: null,
      },
    ]);
    (fetchGoogleSubscription as jest.Mock).mockResolvedValue({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      startTime: '2024-02-01T00:00:00.000Z',
      latestOrderId: 'GPA.1',
    });

    const result = await listBillingHistoryForUser(7);

    expect(result.map((e) => [e.platform, e.status])).toEqual([
      ['google', 'active'],
      ['apple', 'paid'],
      ['stripe', 'refunded'],
      ['stripe', 'paid'],
    ]);
    // Same customer id on both rows is fetched once.
    const stripe = await (getStripeClient as jest.Mock).mock.results[0].value;
    expect(stripe.invoices.list).toHaveBeenCalledTimes(1);
  });

  it('omits a failing source, logs it, and returns the rest', async () => {
    mockDb([
      {
        id: 1,
        stripeCustomerId: 'cus_1',
        appleOriginalTransactionId: 'orig_1',
        googlePurchaseToken: null,
      },
    ]);
    mockStripeInvoices([
      {
        id: 'in_1',
        amount_paid: 499,
        currency: 'usd',
        status: 'paid',
        created: 1700000000,
      },
    ]);
    (fetchAppleTransactionHistory as jest.Mock).mockRejectedValue(
      new Error('apple down'),
    );

    const result = await listBillingHistoryForUser(7);

    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('stripe');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Billing history source failed; omitting',
      expect.objectContaining({ source: 'apple', error: 'apple down' }),
    );
    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
  });
});

describe('mergeBillingHistory', () => {
  const entry = (
    over: Partial<Parameters<typeof mergeBillingHistory>[0][0][0]>,
  ) => ({
    id: 'a',
    platform: 'apple' as const,
    amountCents: 100,
    currency: 'USD',
    status: 'refunded',
    description: null,
    occurredAt: '2024-01-01T00:00:00.000Z',
    ...over,
  });

  it('de-duplicates by id and by identical platform/status/amount/time', () => {
    const merged = mergeBillingHistory([
      [entry({ id: 'apple:tx:revocation' })],
      [
        entry({ id: 'apple:ledger:ev_1' }),
        entry({ id: 'apple:tx:revocation' }),
      ],
    ]);
    expect(merged).toHaveLength(1);
  });
});
