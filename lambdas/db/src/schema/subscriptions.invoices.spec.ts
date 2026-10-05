/**
 * Tests for the myInvoices query / listInvoicesForUser (LS-10397).
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

const mockRunWithInternalClient = jest.fn();

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
        stripeSubscriptionId: 'subscriptions.stripe_subscription_id',
        currentPeriodEnd: 'subscriptions.current_period_end',
        cancelAtPeriodEnd: 'subscriptions.cancel_at_period_end',
        trialEndsAt: 'subscriptions.trial_ends_at',
        gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
        status: 'subscriptions.status',
        tier: 'subscriptions.tier',
      },
    },
  }),
);

jest.mock('../server/stripe', () => ({
  getStripeClient: jest.fn(),
}));

jest.mock('../apple-jws', () => ({
  decodeAndVerifyJwsTransaction: jest.fn(),
}));

jest.mock('../server/google-play', () => ({
  fetchGoogleSubscription: jest.fn(),
  isActiveGoogleSubscription: jest.fn(),
  GOOGLE_PLAY_PACKAGE_NAME: 'com.legacySports',
}));

import { listInvoicesForUser } from './subscriptions';
import { builder } from './builder';
import { getStripeClient } from '../server/stripe';

function mockSubscriptionRows(rows: unknown[]) {
  const limit = jest.fn(() => Promise.resolve(rows));
  const orderBy = jest.fn(() => ({ limit }));
  const where = jest.fn(() => ({ orderBy }));
  const from = jest.fn(() => ({ where }));
  const select = jest.fn(() => ({ from }));
  mockRunWithInternalClient.mockImplementation(
    async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) =>
      cb({ select }),
  );
}

function mockInvoicesList(impl: jest.Mock) {
  (getStripeClient as jest.Mock).mockResolvedValue({
    invoices: { list: impl },
  });
}

describe('listInvoicesForUser (LS-10397)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns [] when the user has no subscriptions row', async () => {
    mockSubscriptionRows([]);

    expect(await listInvoicesForUser(1)).toEqual([]);
    expect(getStripeClient).not.toHaveBeenCalled();
  });

  it('returns [] when the subscription has no stripeCustomerId', async () => {
    mockSubscriptionRows([{ id: 1, stripeCustomerId: null }]);

    expect(await listInvoicesForUser(1)).toEqual([]);
    expect(getStripeClient).not.toHaveBeenCalled();
  });

  it('lists up to 20 invoices for the customer and maps them', async () => {
    mockSubscriptionRows([{ id: 1, stripeCustomerId: 'cus_123' }]);
    const list = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'in_1',
          amount_paid: 499,
          currency: 'usd',
          status: 'paid',
          created: 1700000000,
          hosted_invoice_url: 'https://invoice.stripe.com/i/in_1',
          invoice_pdf: 'https://pay.stripe.com/invoice/in_1/pdf',
        },
        {
          id: 'in_2',
          amount_paid: 0,
          currency: 'usd',
          status: null,
          created: 1700086400,
          hosted_invoice_url: null,
          invoice_pdf: null,
        },
      ],
    });
    mockInvoicesList(list);

    const result = await listInvoicesForUser(1);

    expect(list).toHaveBeenCalledWith({ customer: 'cus_123', limit: 20 });
    expect(result).toEqual([
      {
        id: 'in_1',
        amountPaidCents: 499,
        currency: 'usd',
        status: 'paid',
        created: '2023-11-14T22:13:20.000Z',
        hostedInvoiceUrl: 'https://invoice.stripe.com/i/in_1',
        invoicePdf: 'https://pay.stripe.com/invoice/in_1/pdf',
      },
      {
        id: 'in_2',
        amountPaidCents: 0,
        currency: 'usd',
        status: null,
        created: '2023-11-15T22:13:20.000Z',
        hostedInvoiceUrl: null,
        invoicePdf: null,
      },
    ]);
  });

  it('returns [] and logs a warning when Stripe throws', async () => {
    mockSubscriptionRows([{ id: 1, stripeCustomerId: 'cus_123' }]);
    mockInvoicesList(jest.fn().mockRejectedValue(new Error('stripe down')));

    expect(await listInvoicesForUser(1)).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to list Stripe invoices'),
      expect.objectContaining({ userId: 1, error: 'stripe down' }),
    );
  });
});

describe('myInvoices schema nullability (LS-10397)', () => {
  it('exposes the always-present invoice fields as non-null', () => {
    const schema = builder.toSchema();
    const fields = (
      schema.getType('MyInvoice') as import('graphql').GraphQLObjectType
    ).getFields();

    for (const name of ['id', 'amountPaidCents', 'currency', 'created']) {
      expect(String(fields[name]?.type)).toMatch(/!$/);
    }
    for (const name of ['status', 'hostedInvoiceUrl', 'invoicePdf']) {
      expect(String(fields[name]?.type)).not.toMatch(/!$/);
    }
    expect(String(schema.getQueryType()?.getFields()['myInvoices']?.type)).toBe(
      '[MyInvoice!]!',
    );
  });
});

describe('myInvoices query (LS-10397)', () => {
  it('rejects an unauthenticated caller', async () => {
    const field = builder.toSchema().getQueryType()?.getFields()['myInvoices'];
    if (!field?.resolve) throw new Error('myInvoices resolver not found');

    await expect(
      field.resolve({}, {}, { user: null }, undefined as never),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});
