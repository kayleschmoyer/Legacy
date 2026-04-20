import type { APIGatewayProxyEvent } from 'aws-lambda';

// The handler caches the Stripe client and webhook secret in module-level
// promises. Use jest.resetModules() + jest.doMock + require() in beforeEach so
// each test gets a clean module with no stale cached promises.

type HandlerModule = typeof import('./index');

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/stripe/webhook',
    body: JSON.stringify({ id: 'evt_test_123', type: 'invoice.voided' }),
    headers: { 'stripe-signature': 'sig_test' },
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

/** A minimal Stripe event object returned by constructEvent. */
function fakeStripeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_test_123',
    type: 'invoice.voided',
    data: { object: {} },
    ...overrides,
  };
}

describe('stripe-webhook handler', () => {
  let handler: HandlerModule['handler'];
  let mockConstructEvent: jest.Mock;
  let mockRunWithInternalClient: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockConstructEvent = jest.fn();
    mockRunWithInternalClient = jest.fn();

    jest.doMock('@legacy-sports/rollbar', () => ({
      getRollbarConfigFromEnv: jest.fn(() => null),
      initRollbar: jest.fn(),
      captureError: jest.fn(),
      withRollbar: jest.fn(
        (fn: (...args: unknown[]) => unknown) =>
          (...args: unknown[]) =>
            fn(...args),
      ),
    }));

    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    jest.doMock('@legacy-sports/aws-utils', () => ({
      createNotificationService: jest.fn(() => null),
      createNotificationPublisher: jest.fn(() => null),
      retrieveSecretParameterValue: jest.fn(),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      runWithInternalClient: mockRunWithInternalClient,
      clearLeagueTierFreezes: jest.fn(),
      handleSubscriptionDowngrade: jest.fn(),
      InternalSchema: {
        stripeEvents: { eventId: 'eventId' },
        subscriptions: {
          stripeSubscriptionId: 'stripeSubscriptionId',
          tier: 'tier',
          status: 'status',
          userId: 'userId',
          lastEventTimestamp: 'lastEventTimestamp',
        },
        usersInAppInternal: { id: 'id' },
      },
    }));

    // Mock the Stripe constructor so constructEvent works without real signatures
    const mockStripeInstance = {
      webhooks: { constructEvent: mockConstructEvent },
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue({
          status: 'active',
          cancel_at_period_end: false,
          trial_end: null,
          items: { data: [{ current_period_end: 1700000000 }] },
        }),
      },
    };
    jest.doMock('stripe', () => jest.fn(() => mockStripeInstance));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires synchronous require() after mock setup
    const mod = require('./index') as HandlerModule;
    handler = mod.handler;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signature verification', () => {
    it('returns 400 when Stripe signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toContain('Invalid signature');
    });
  });

  describe('idempotency', () => {
    it('returns 200 immediately when the event was already claimed by a concurrent invocation', async () => {
      mockConstructEvent.mockReturnValue(fakeStripeEvent());
      // claimStripeEvent → INSERT ... ON CONFLICT DO NOTHING RETURNING returns
      // an empty array because another invocation already inserted the row.
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () => Promise.resolve([]),
                }),
              }),
            }),
          }),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { received: boolean };
      expect(body.received).toBe(true);
      // No processing or release should run — claim-already-held is the only call.
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('processing failure releases the idempotency claim', () => {
    it('deletes the claim row so Stripe retry can re-process the event', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: false,
              trial_end: null,
              metadata: { userId: '42' },
              items: { data: [{ current_period_end: 1700000000 }] },
            },
          },
        }),
      );

      // Call 1: claimStripeEvent → we own the claim
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'evt_test_123' }]),
                }),
              }),
            }),
          }),
      );

      // Call 2: upsertSubscription's first DB call throws
      mockRunWithInternalClient.mockImplementationOnce(() =>
        Promise.reject(new Error('DB unavailable')),
      );

      // Call 3: releaseStripeEventClaim → delete succeeds
      const deleteWhere = jest.fn(() => Promise.resolve());
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            delete: () => ({ where: deleteWhere }),
          }),
      );

      const result = await handler(makeEvent());

      // 500 is correct — Stripe will retry now that the claim was released.
      expect(result.statusCode).toBe(500);
      expect(deleteWhere).toHaveBeenCalledTimes(1);
    });

    it('still returns 500 when the claim release itself fails', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: false,
              trial_end: null,
              metadata: { userId: '42' },
              items: { data: [{ current_period_end: 1700000000 }] },
            },
          },
        }),
      );

      // claim succeeds
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'evt_test_123' }]),
                }),
              }),
            }),
          }),
      );

      // processing throws
      mockRunWithInternalClient.mockImplementationOnce(() =>
        Promise.reject(new Error('DB unavailable')),
      );

      // release also throws
      mockRunWithInternalClient.mockImplementationOnce(() =>
        Promise.reject(new Error('Release failed')),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(500);
    });
  });

  describe('processing error', () => {
    it('returns 500 when event processing itself fails', async () => {
      // Use customer.subscription.updated to exercise the processing path
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: false,
              trial_end: null,
              metadata: { userId: '42' },
              items: { data: [{ current_period_end: 1700000000 }] },
            },
          },
        }),
      );

      // claimStripeEvent → we own the claim
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'evt_test_123' }]),
                }),
              }),
            }),
          }),
      );

      // First subscription DB call inside upsertSubscription → throws
      mockRunWithInternalClient.mockImplementationOnce(() =>
        Promise.reject(new Error('DB unavailable')),
      );

      // releaseStripeEventClaim → delete succeeds
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            delete: () => ({ where: () => Promise.resolve() }),
          }),
      );

      const result = await handler(makeEvent());

      // Processing failed — correct to return 500 so Stripe retries
      expect(result.statusCode).toBe(500);
    });
  });

  describe('happy path', () => {
    it('returns 200 for an unhandled (acknowledged) event type', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({ type: 'invoice.voided' }),
      );

      // claimStripeEvent → we own the claim (insert returned a row)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'evt_test_123' }]),
                }),
              }),
            }),
          }),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { received: boolean };
      expect(body.received).toBe(true);
    });
  });
});
