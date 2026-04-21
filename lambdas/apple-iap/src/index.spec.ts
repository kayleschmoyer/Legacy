import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { AppStoreNotification, NotificationType } from './types';

// The handler caches the bundle ID in a module-level promise. Use
// jest.resetModules() + jest.doMock + require() in beforeEach so each test
// gets a clean module with no stale cached promises.

type HandlerModule = typeof import('./index');

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/apple/iap',
    body: JSON.stringify({ signedPayload: 'fake.jws.payload' }),
    headers: {},
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

function fakeNotification(
  overrides: Partial<AppStoreNotification> = {},
): AppStoreNotification {
  return {
    notificationType: 'TEST' as NotificationType,
    notificationUUID: 'uuid-test-123',
    data: {
      bundleId: 'com.legacy.sports',
      environment: 'Sandbox',
      signedTransactionInfo: {
        originalTransactionId: 'orig-1',
        transactionId: 'tx-1',
        productId: 'premium_monthly',
        bundleId: 'com.legacy.sports',
        expiresDate: undefined,
      },
    },
    ...overrides,
  } as AppStoreNotification;
}

describe('apple-iap handler', () => {
  let handler: HandlerModule['handler'];
  let mockDecodeAndVerifyJws: jest.Mock;
  let mockRunWithInternalClient: jest.Mock;

  beforeEach(() => {
    process.env['APPLE_BUNDLE_ID'] = 'com.legacy.sports';
    process.env['EXPECTED_APPLE_ENVIRONMENT'] = 'Sandbox';
    jest.resetModules();

    mockDecodeAndVerifyJws = jest.fn();
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
      retrieveSecretParameterValue: jest.fn(),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      runWithInternalClient: mockRunWithInternalClient,
      clearLeagueTierFreezes: jest.fn(),
      handleSubscriptionDowngrade: jest.fn(),
      InternalSchema: {
        appleEvents: { eventId: 'eventId' },
        subscriptions: {
          appleOriginalTransactionId: 'appleOriginalTransactionId',
          tier: 'tier',
          status: 'status',
          userId: 'userId',
        },
        usersInAppInternal: { id: 'id' },
      },
    }));

    jest.doMock('./jws', () => ({
      decodeAndVerifyJws: mockDecodeAndVerifyJws,
    }));

    jest.doMock('./ga4', () => ({
      sendGa4ServerEvent: jest.fn(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires synchronous require() after mock setup
    const mod = require('./index') as HandlerModule;
    handler = mod.handler;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('idempotency', () => {
    it('returns 200 immediately when the event was already claimed by a concurrent invocation', async () => {
      mockDecodeAndVerifyJws.mockResolvedValue(fakeNotification());

      // claimAppleEvent → INSERT ... ON CONFLICT DO NOTHING RETURNING returns
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
      // No processing or release should run — the claim attempt is the only call.
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('processing failure releases the idempotency claim', () => {
    it('deletes the claim row so Apple retry can re-process the notification', async () => {
      mockDecodeAndVerifyJws.mockResolvedValue(
        fakeNotification({ notificationType: 'SUBSCRIBED' }),
      );

      // Call 1: claimAppleEvent → we own the claim
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'uuid-test-123' }]),
                }),
              }),
            }),
          }),
      );

      // Call 2: findUserIdByOriginalTransactionId (inside handleNotification) throws
      mockRunWithInternalClient.mockImplementationOnce(() =>
        Promise.reject(new Error('DB unavailable')),
      );

      // Call 3: releaseAppleEventClaim → delete succeeds
      const deleteWhere = jest.fn(() => Promise.resolve());
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            delete: () => ({ where: deleteWhere }),
          }),
      );

      const result = await handler(makeEvent());

      // 500 is correct — Apple will retry now that the claim was released.
      expect(result.statusCode).toBe(500);
      expect(deleteWhere).toHaveBeenCalledTimes(1);
    });

    it('still returns 500 when the claim release itself fails', async () => {
      mockDecodeAndVerifyJws.mockResolvedValue(
        fakeNotification({ notificationType: 'SUBSCRIBED' }),
      );

      // claim succeeds
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'uuid-test-123' }]),
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
        Promise.reject(new Error('DB still unavailable')),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(500);
    });
  });

  describe('happy path — race condition (userId not yet known)', () => {
    it('claims the event before processing and returns 200 when userId lookup yields null', async () => {
      mockDecodeAndVerifyJws.mockResolvedValue(
        fakeNotification({ notificationType: 'DID_RENEW' }),
      );

      // Call 1: claimAppleEvent → we own the claim
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'uuid-test-123' }]),
                }),
              }),
            }),
          }),
      );

      // Call 2: findUserIdByOriginalTransactionId → no row yet (race)
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

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { received: boolean };
      expect(body.received).toBe(true);
      // Claim + userId lookup = 2 calls; no further side effects, no release.
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('happy path — environment persisted on upsert', () => {
    it('passes apple_environment to the subscription upsert for a SUBSCRIBED notification', async () => {
      mockDecodeAndVerifyJws.mockResolvedValue(
        fakeNotification({
          notificationType: 'SUBSCRIBED',
          data: {
            bundleId: 'com.legacy.sports',
            environment: 'Sandbox',
            signedTransactionInfo: {
              originalTransactionId: 'orig-sandbox-1',
              transactionId: 'tx-sandbox-1',
              productId: 'premium_monthly',
              bundleId: 'com.legacy.sports',
              purchaseDate: Date.now(),
              expiresDate: Date.now() + 86400000,
            },
          },
        }),
      );

      // Call 1: claimAppleEvent → we own the claim
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () =>
                    Promise.resolve([{ eventId: 'uuid-test-123' }]),
                }),
              }),
            }),
          }),
      );

      // Call 2: findUserIdByOriginalTransactionId → found
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => Promise.resolve([{ userId: 42 }]),
                }),
              }),
            }),
          }),
      );

      // Call 3: upsertAppleSubscription — select previousTier
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => Promise.resolve([{ tier: 'free' }]),
                }),
              }),
            }),
          }),
      );

      // Call 4: upsertAppleSubscription — insert subscription + update user tier
      const insertValues = jest.fn(() => ({
        onConflictDoUpdate: jest.fn(() => Promise.resolve()),
      }));
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            insert: () => ({ values: insertValues }),
            update: () => ({
              set: () => ({
                where: () => Promise.resolve(),
              }),
            }),
          }),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ appleEnvironment: 'Sandbox' }),
      );
    });
  });

  describe('input validation', () => {
    it('returns 400 when the body is empty', async () => {
      const result = await handler(makeEvent({ body: '' }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when signedPayload is missing', async () => {
      const result = await handler(makeEvent({ body: JSON.stringify({}) }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when JWS verification fails', async () => {
      mockDecodeAndVerifyJws.mockRejectedValue(new Error('Invalid signature'));
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(400);
      // No DB calls should have happened.
      expect(mockRunWithInternalClient).not.toHaveBeenCalled();
    });
  });
});
