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
  let mockCaptureError: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockConstructEvent = jest.fn();
    mockRunWithInternalClient = jest.fn();
    mockCaptureError = jest.fn();

    jest.doMock('@legacy-sports/rollbar', () => ({
      getRollbarConfigFromEnv: jest.fn(() => null),
      initRollbar: jest.fn(),
      captureError: mockCaptureError,
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
    it('returns 200 immediately when the event was already processed', async () => {
      mockConstructEvent.mockReturnValue(fakeStripeEvent());
      // isEventProcessed → returns a row (already recorded)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => Promise.resolve([{ eventId: 'evt_test_123' }]),
                }),
              }),
            }),
          }),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { received: boolean };
      expect(body.received).toBe(true);
      // recordEvent should NOT be called again
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordEvent failure (core bug fix)', () => {
    it('returns 200 even when recordEvent throws a DB error', async () => {
      // Use an unhandled event type so only isEventProcessed and recordEvent
      // are called, keeping the mock setup minimal.
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({ type: 'invoice.voided' }),
      );

      // Call 1: isEventProcessed → not yet recorded
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: () => ({
              from: () => ({
                where: () => ({ limit: () => Promise.resolve([]) }),
              }),
            }),
          }),
      );

      // Call 2: recordEvent → DB insert throws
      mockRunWithInternalClient.mockImplementationOnce(() => {
        return Promise.reject(new Error('DB connection lost'));
      });

      const result = await handler(makeEvent());

      // Must return 200 — returning 500 here would cause Stripe to retry and
      // re-run all processing side effects on an already-handled event.
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { received: boolean };
      expect(body.received).toBe(true);
    });

    it('captures the error in Rollbar when recordEvent throws', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({ type: 'invoice.voided' }),
      );

      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: () => ({
              from: () => ({
                where: () => ({ limit: () => Promise.resolve([]) }),
              }),
            }),
          }),
      );
      mockRunWithInternalClient.mockImplementationOnce(() =>
        Promise.reject(new Error('DB connection lost')),
      );

      await handler(makeEvent());

      expect(mockCaptureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({ lambda: 'stripe-webhook' }),
        }),
      );
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

      // isEventProcessed → not yet recorded
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: () => ({
              from: () => ({
                where: () => ({ limit: () => Promise.resolve([]) }),
              }),
            }),
          }),
      );

      // First subscription DB call inside upsertSubscription → throws
      mockRunWithInternalClient.mockImplementationOnce(() =>
        Promise.reject(new Error('DB unavailable')),
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

      // isEventProcessed → not yet recorded
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: () => ({
              from: () => ({
                where: () => ({ limit: () => Promise.resolve([]) }),
              }),
            }),
          }),
      );

      // recordEvent → succeeds (insert, onConflictDoNothing)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({ onConflictDoNothing: () => Promise.resolve() }),
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
