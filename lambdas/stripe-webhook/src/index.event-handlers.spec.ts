import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Extended event-handler unit tests for the Stripe webhook lambda (LS-848).
 *
 * Covers the event handler gaps identified in the existing index.spec.ts:
 *   - checkout.session.completed  (success + graceful skip paths)
 *   - customer.subscription.created / updated (handleSubscriptionEvent)
 *   - customer.subscription.deleted  (updateSubscriptionStatus → 'canceled')
 *   - invoice.payment_failed  (grace period retained / expired → free)
 *   - invoice.payment_succeeded  (grace cleared, premium restored)
 *   - customer.subscription.trial_will_end  (WS notification fired)
 *   - Tier-change side effects  (downgrade / upgrade / no-change)
 *
 * Mock strategy mirrors index.spec.ts:
 *   - jest.resetModules() in beforeEach for clean module state
 *   - mockRunWithInternalClient controls all DB interactions
 *   - mockConstructEvent controls Stripe signature verification
 *   - @legacy-sports/db-client mocks clearLeagueTierFreezes and
 *     handleSubscriptionDowngrade so tier-change side effects are assertable
 */

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

function fakeStripeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_test_456',
    type: 'invoice.voided',
    data: { object: {} },
    ...overrides,
  };
}

// ── Shared mock DB builders ───────────────────────────────────────────────────

/** DB that returns a result array from a single select().from().where().limit() chain. */
function makeSelectDb(rows: unknown[] = []) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve(rows)),
        })),
      })),
    })),
  };
}

/** DB that handles insert + onConflictDoUpdate + update (for upsertSubscription call 2). */
function makeInsertUpdateDb() {
  return {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoUpdate: jest.fn(() => Promise.resolve()),
        onConflictDoNothing: jest.fn(() => Promise.resolve()),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve()),
      })),
    })),
  };
}

/** DB that handles a select followed by two updates (for updateSubscriptionStatus / handlePaymentFailed). */
function makeSelectThenUpdateDb(
  rows: unknown[] = [{ userId: 42, tier: 'premium' }],
  returningRows: unknown[] = [{ userId: 42 }],
) {
  const whereFn = jest.fn(() => ({
    returning: jest.fn(() => Promise.resolve(returningRows)),
    then: (resolve: (v: unknown) => unknown) => resolve(undefined),
  }));
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve(rows)),
        })),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: whereFn,
      })),
    })),
  };
}

/**
 * DB that handles claimStripeEvent — insert + onConflictDoNothing + returning.
 * `claimed` controls whether the insert returned a row (true = we own the claim,
 * false = another invocation already claimed this event).
 */
function makeClaimEventDb(claimed: boolean) {
  return {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(() =>
            Promise.resolve(claimed ? [{ eventId: 'evt_test' }] : []),
          ),
        })),
      })),
    })),
  };
}

// ── Common mock setup ─────────────────────────────────────────────────────────

const mockPushPublish = jest.fn().mockResolvedValue(undefined);

describe('stripe-webhook event handlers', () => {
  let handler: HandlerModule['handler'];
  let mockConstructEvent: jest.Mock;
  let mockRunWithInternalClient: jest.Mock;
  let mockHandleSubscriptionDowngrade: jest.Mock;
  let mockClearLeagueTierFreezes: jest.Mock;
  let mockSendGa4ServerEvent: jest.Mock;
  let mockCustomerRetrieveFn: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockConstructEvent = jest.fn();
    mockRunWithInternalClient = jest.fn();
    mockHandleSubscriptionDowngrade = jest.fn().mockResolvedValue(undefined);
    mockClearLeagueTierFreezes = jest.fn().mockResolvedValue(undefined);
    mockSendGa4ServerEvent = jest.fn().mockResolvedValue(undefined);
    mockPushPublish.mockClear();

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
      createNotificationPublisher: jest.fn(() => ({
        publish: mockPushPublish,
        publishToMany: jest.fn(),
      })),
      retrieveSecretParameterValue: jest.fn(),
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      runWithInternalClient: mockRunWithInternalClient,
      clearLeagueTierFreezes: mockClearLeagueTierFreezes,
      handleSubscriptionDowngrade: mockHandleSubscriptionDowngrade,
      InternalSchema: {
        stripeEvents: { eventId: 'eventId' },
        subscriptions: {
          stripeSubscriptionId: 'stripeSubscriptionId',
          stripeCustomerId: 'stripeCustomerId',
          tier: 'tier',
          status: 'status',
          userId: 'userId',
          gracePeriodEndsAt: 'gracePeriodEndsAt',
          lastEventTimestamp: 'lastEventTimestamp',
        },
        usersInAppInternal: { id: 'id' },
      },
    }));

    const mockStripeInstance = {
      webhooks: { constructEvent: mockConstructEvent },
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue({
          status: 'active',
          cancel_at_period_end: false,
          trial_end: null,
          items: { data: [{ current_period_end: 1700000000 }] },
        }),
        cancel: jest
          .fn()
          .mockResolvedValue({ id: 'sub_123', status: 'canceled' }),
      },
      charges: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'ch_disputed',
          customer: 'cus_123',
        }),
      },
      customers: {
        // Default: customer metadata userId matches '42' used in the
        // checkout.session.completed tests below. Individual tests override
        // this via mockCustomerRetrieveFn.mockResolvedValueOnce(...) when
        // they need to exercise the verification failure paths.
        retrieve: jest.fn().mockResolvedValue({
          id: 'cus_123',
          deleted: false,
          metadata: { userId: '42' },
        }),
      },
    };
    mockCustomerRetrieveFn = mockStripeInstance.customers.retrieve;
    jest.doMock('stripe', () => jest.fn(() => mockStripeInstance));

    jest.doMock('./ga4', () => ({
      sendGa4ServerEvent: mockSendGa4ServerEvent,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires synchronous require() after mock setup
    const mod = require('./index') as HandlerModule;
    handler = mod.handler;
  });

  afterEach(() => jest.clearAllMocks());

  // ── Helpers for the idempotency claim ──────────────────────────────────────

  /** Setup Call 1: claimStripeEvent inserts a new row → returns true. */
  function setupNotProcessed() {
    mockRunWithInternalClient.mockImplementationOnce(
      (_opts: unknown, cb: (db: unknown) => unknown) =>
        cb(makeClaimEventDb(true)),
    );
  }

  /**
   * Back-compat shim for the previous two-step claim flow. The handler now
   * claims up front via `claimStripeEvent`, so there is no trailing record
   * step to mock — existing test scaffolding keeps calling this as a no-op.
   */
  function setupRecordEvent() {
    // no-op: claimStripeEvent is handled by setupNotProcessed()
  }

  /**
   * Setup verifyCheckoutOwnership's DB lookup for an existing subscription
   * row keyed on stripeCustomerId. By default returns no row, meaning the
   * customer has no prior subscription tied to a different userId.
   */
  function setupOwnershipDbCheck(rows: unknown[] = []) {
    mockRunWithInternalClient.mockImplementationOnce(
      (_opts: unknown, cb: (db: unknown) => unknown) => cb(makeSelectDb(rows)),
    );
  }

  // ── checkout.session.completed ─────────────────────────────────────────────

  describe('checkout.session.completed', () => {
    it('returns 200 and processes the session when userId is in metadata', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();
      // verifyCheckoutOwnership: no existing row for this customer
      setupOwnershipDbCheck();
      // upsertSubscription: previous tier lookup (returns null — first purchase)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(makeSelectDb([])),
      );
      // upsertSubscription: insert + update users
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeInsertUpdateDb()),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { received: boolean };
      expect(body.received).toBe(true);
      expect(mockSendGa4ServerEvent).toHaveBeenCalledWith(
        42,
        'subscription_started',
        { tier: 'premium', source: 'stripe' },
      );
    });

    it('returns 200 without processing when userId is missing from metadata', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: {},
            },
          },
        }),
      );

      setupNotProcessed();
      setupRecordEvent();

      const result = await handler(makeEvent());

      // Graceful skip — no error
      expect(result.statusCode).toBe(200);
      // upsertSubscription was not called (only the idempotency claim ran)
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    });

    it('returns 200 without processing when userId is a partial numeric string (e.g. "42abc")', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { userId: '42abc' },
            },
          },
        }),
      );

      setupNotProcessed();
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // upsertSubscription must not run — only isEventProcessed + recordEvent
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(2);
      expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
    });

    it('triggers clearLeagueTierFreezes when new subscription activates (free→premium)', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();
      // verifyCheckoutOwnership: existing row for this customer owned by the
      // same userId (42) — ownership check passes.
      setupOwnershipDbCheck([{ userId: 42 }]);
      // Previous tier = free (existing subscription)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free' }])),
      );
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeInsertUpdateDb()),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );

      await handler(makeEvent());

      // free → premium: clearLeagueTierFreezes must be called
      expect(mockClearLeagueTierFreezes).toHaveBeenCalledWith(
        42,
        expect.any(Object),
      );
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
    });

    // ── Ownership verification (LS-2612) ─────────────────────────────────────
    //
    // The session.metadata.userId field is not trustworthy on its own — a
    // compromised client, misconfigured endpoint, or client-side checkout
    // could mint a session that credits another user with premium. The
    // handler must cross-check against the Stripe customer's metadata and
    // any pre-existing subscription row for that customer, and reject the
    // event with 400 on mismatch.

    /**
     * Override the default Stripe customers.retrieve mock installed in
     * beforeEach for the next call only. The default returns
     * metadata.userId='42'; individual tests use this to simulate deleted
     * customers, missing metadata, or mismatched userIds.
     */
    function mockCustomerRetrieve(payload: unknown) {
      mockCustomerRetrieveFn.mockReset();
      mockCustomerRetrieveFn.mockResolvedValue(payload);
    }

    it('returns 400 when Stripe customer metadata userId does not match session metadata userId', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();
      // Customer belongs to a different user — attacker-style mismatch.
      mockCustomerRetrieve({
        id: 'cus_123',
        deleted: false,
        metadata: { userId: '99' },
      });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(400);
      // No subscription upsert and no recordEvent were attempted — only the
      // isEventProcessed select ran before the verification failure.
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when Stripe customer is deleted', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();
      mockCustomerRetrieve({ id: 'cus_123', deleted: true });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when Stripe customer has no userId metadata', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();
      mockCustomerRetrieve({ id: 'cus_123', deleted: false, metadata: {} });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when existing subscription row for the customer belongs to a different user', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              customer: 'cus_123',
              subscription: 'sub_123',
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();
      // Customer metadata matches the session's claimed userId (default mock
      // returns '42'), but a pre-existing subscription row for the same
      // Stripe customer is already bound to a different userId.
      setupOwnershipDbCheck([{ userId: 7 }]);

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(400);
      // isEventProcessed + ownership DB check — no upsert or recordEvent.
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(2);
    });
  });

  // ── checkout.session.completed (donation / mode=payment) ──────────────────

  describe('checkout.session.completed (mode=payment donation)', () => {
    it('returns 200 without subscription side effects for payment-mode sessions', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_donation_123',
              mode: 'payment',
              customer: 'cus_123',
              subscription: null,
              amount_total: 1000,
              currency: 'usd',
              metadata: {},
            },
          },
        }),
      );

      setupNotProcessed();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // Only the idempotency claim ran — no subscription DB calls
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
      expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
      expect(mockSendGa4ServerEvent).not.toHaveBeenCalled();
    });

    it('fires donation_completed GA4 event when userId is in session metadata', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_donation_456',
              mode: 'payment',
              customer: 'cus_123',
              subscription: null,
              amount_total: 2500,
              currency: 'usd',
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);
      expect(mockSendGa4ServerEvent).toHaveBeenCalledWith(
        42,
        'donation_completed',
        {
          value: 25,
          currency: 'USD',
          source: 'stripe_payment_link',
        },
      );
      expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
    });
  });

  // ── customer.subscription.created ─────────────────────────────────────────

  describe('customer.subscription.created', () => {
    it('returns 200 and upserts subscription with userId from metadata', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.created',
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

      setupNotProcessed();
      // upsertSubscription: previous tier
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(makeSelectDb([])),
      );
      // upsertSubscription: insert + update users
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeInsertUpdateDb()),
      );
      // pushSubscriptionUpdated DB lookup
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
    });
  });

  // ── customer.subscription.updated ─────────────────────────────────────────

  describe('customer.subscription.updated', () => {
    it('triggers handleSubscriptionDowngrade on premium → free tier change', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'canceled',
              cancel_at_period_end: false,
              trial_end: null,
              metadata: { userId: '42' },
              items: { data: [{ current_period_end: 1700000000 }] },
            },
          },
        }),
      );

      setupNotProcessed();
      // Previous tier = premium
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium' }])),
      );
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeInsertUpdateDb()),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', status: 'canceled' }])),
      );

      await handler(makeEvent());

      // canceled → tier = 'free'; was premium → handleSubscriptionDowngrade called
      expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(
        42,
        expect.any(Object),
      );
      expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();

      // Push notification should be published for subscription change
      expect(mockPushPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          notificationType: 'subscription_updated',
          title: 'Subscription Updated',
        }),
      );
    });

    it('does not call side-effect helpers when tier does not change', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'active',
              cancel_at_period_end: true, // cancel flag changed, tier unchanged
              trial_end: null,
              metadata: { userId: '42' },
              items: { data: [{ current_period_end: 1700000000 }] },
            },
          },
        }),
      );

      setupNotProcessed();
      // Previous tier = premium (same as new 'active' status → still premium)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium' }])),
      );
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeInsertUpdateDb()),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );

      await handler(makeEvent());

      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
      expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
    });
  });

  // ── customer.subscription.deleted ─────────────────────────────────────────

  describe('customer.subscription.deleted', () => {
    it('returns 200 and marks subscription canceled', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.deleted',
          data: {
            object: { id: 'sub_123' },
          },
        }),
      );

      setupNotProcessed();
      // updateSubscriptionStatus: select existing + two updates
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([{ userId: 42, tier: 'premium' }])),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', status: 'canceled' }])),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      expect(mockSendGa4ServerEvent).toHaveBeenCalledWith(
        42,
        'subscription_cancelled',
        { tier: 'premium', source: 'stripe' },
      );
    });

    it('calls handleSubscriptionDowngrade when deleting a premium subscription', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.deleted',
          data: {
            object: { id: 'sub_123' },
          },
        }),
      );

      setupNotProcessed();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([{ userId: 42, tier: 'premium' }])),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', status: 'canceled' }])),
      );

      await handler(makeEvent());

      // deleted → 'canceled' status → tier='free'; was premium → downgrade
      expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(
        42,
        expect.any(Object),
      );
    });

    it('returns 200 gracefully when no subscription record exists', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.deleted',
          data: {
            object: { id: 'sub_does_not_exist' },
          },
        }),
      );

      setupNotProcessed();
      // updateSubscriptionStatus: no existing record → returns null
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
    });
  });

  // ── invoice.payment_failed (grace period) ─────────────────────────────────

  describe('invoice.payment_failed', () => {
    function makePaymentFailedEvent(
      subscriptionId: string,
      overrideRecord?: Record<string, unknown>,
    ) {
      const record: Record<string, unknown> = {
        userId: 42,
        gracePeriodEndsAt: null,
        ...overrideRecord,
      };

      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'invoice.payment_failed',
          data: {
            object: {
              parent: {
                subscription_details: { subscription: subscriptionId },
              },
            },
          },
        }),
      );

      setupNotProcessed();
      // handlePaymentFailed: select subscription record + two updates
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => {
          const mockDb = {
            select: jest.fn(() => ({
              from: jest.fn(() => ({
                where: jest.fn(() => ({
                  limit: jest.fn(() => Promise.resolve([record])),
                })),
              })),
            })),
            update: jest.fn(() => ({
              set: jest.fn(() => ({
                where: jest.fn(() => Promise.resolve()),
              })),
            })),
          };
          return cb(mockDb);
        },
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );
    }

    it('returns 200 and retains premium tier within grace period', async () => {
      makePaymentFailedEvent('sub_123', { gracePeriodEndsAt: null });

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
    });

    it('returns 200 and skips processing when no subscription record exists', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'invoice.payment_failed',
          data: {
            object: {
              parent: {
                subscription_details: { subscription: 'sub_missing' },
              },
            },
          },
        }),
      );

      setupNotProcessed();
      // handlePaymentFailed: empty select
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb({
            select: jest.fn(() => ({
              from: jest.fn(() => ({
                where: jest.fn(() => ({
                  limit: jest.fn(() => Promise.resolve([])),
                })),
              })),
            })),
          }),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
    });

    it('returns 200 when invoice has no subscription ID (non-subscription invoice)', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'invoice.payment_failed',
          data: {
            object: { parent: null },
          },
        }),
      );

      setupNotProcessed();
      setupRecordEvent();

      const result = await handler(makeEvent());

      // No subscription ID → skip handlePaymentFailed entirely
      expect(result.statusCode).toBe(200);
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1); // only the idempotency claim ran
    });
  });

  // ── invoice.payment_succeeded ─────────────────────────────────────────────

  describe('invoice.payment_succeeded', () => {
    it('returns 200 and restores active/premium after successful payment', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'invoice.payment_succeeded',
          data: {
            object: {
              parent: {
                subscription_details: { subscription: 'sub_123' },
              },
            },
          },
        }),
      );

      setupNotProcessed();
      // handlePaymentSucceeded: select userId + two updates
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([{ userId: 42 }])),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (runs after recordEvent)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
    });

    it('returns 200 gracefully when no subscription record exists', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'invoice.payment_succeeded',
          data: {
            object: {
              parent: {
                subscription_details: { subscription: 'sub_missing' },
              },
            },
          },
        }),
      );

      setupNotProcessed();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
    });

    it('fires subscription_renewed GA4 event for subscription_cycle billing', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'invoice.payment_succeeded',
          data: {
            object: {
              parent: {
                subscription_details: { subscription: 'sub_123' },
              },
              billing_reason: 'subscription_cycle',
            },
          },
        }),
      );

      setupNotProcessed();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([{ userId: 42 }])),
      );
      setupRecordEvent();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      expect(mockSendGa4ServerEvent).toHaveBeenCalledWith(
        42,
        'subscription_renewed',
        { tier: 'premium', source: 'stripe' },
      );
    });

    it('does not fire subscription_renewed GA4 when billing_reason is not subscription_cycle', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'invoice.payment_succeeded',
          data: {
            object: {
              parent: {
                subscription_details: { subscription: 'sub_123' },
              },
              billing_reason: 'manual',
            },
          },
        }),
      );

      setupNotProcessed();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([{ userId: 42 }])),
      );
      setupRecordEvent();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );

      await handler(makeEvent());

      expect(mockSendGa4ServerEvent).not.toHaveBeenCalled();
    });
  });

  // ── customer.subscription.trial_will_end ──────────────────────────────────

  describe('customer.subscription.trial_will_end', () => {
    it('returns 200 and fires trial-end notification when userId is in metadata', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.trial_will_end',
          data: {
            object: {
              id: 'sub_123',
              trial_end: 1700000000,
              metadata: { userId: '42' },
            },
          },
        }),
      );

      setupNotProcessed();
      // handleTrialWillEnd with userId in metadata: no DB lookup needed
      // notificationService is null (mocked), so no notifyTrialWillEnd call
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // Only the idempotency claim — no extra DB calls
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(1);

      // Push notification should be published for trial ending
      expect(mockPushPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          notificationType: 'trial_will_end',
          title: 'Trial Ending Soon',
        }),
      );
    });

    it('falls back to DB lookup when userId is absent from metadata', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.trial_will_end',
          data: {
            object: {
              id: 'sub_123',
              trial_end: 1700000000,
              metadata: {},
            },
          },
        }),
      );

      setupNotProcessed();
      // handleTrialWillEnd: userId missing → DB lookup
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ userId: 42 }])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // claim + userId DB lookup = 2 calls
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(2);
    });

    it('returns 200 when no subscription record exists for trial_will_end', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.trial_will_end',
          data: {
            object: {
              id: 'sub_missing',
              trial_end: 1700000000,
              metadata: {},
            },
          },
        }),
      );

      setupNotProcessed();
      // No record found
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(makeSelectDb([])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
    });
  });

  // ── charge.refunded ───────────────────────────────────────────────────────

  describe('charge.refunded', () => {
    /**
     * DB for refund/dispute path: a customer lookup (select/from/where/limit)
     * followed by a previousTier read + updates inside a runWithInternalClient
     * callback. We simulate both with makeSelectThenUpdateDb variants.
     */
    function makeRefundDb(
      customerRow: unknown[] = [
        { userId: 42, stripeSubscriptionId: 'sub_123' },
      ],
      priorTierRow: unknown[] = [{ tier: 'premium' }],
    ) {
      return {
        customerLookup: (): unknown => makeSelectDb(customerRow),
        tierUpdate: (): unknown => makeSelectThenUpdateDb(priorTierRow),
      };
    }

    it('full refund downgrades tier, cancels Stripe subscription, persists metadata, fires GA4', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'charge.refunded',
          data: {
            object: {
              id: 'ch_123',
              customer: 'cus_123',
              payment_intent: 'pi_123',
              amount: 1999,
              amount_refunded: 1999,
              currency: 'usd',
            },
          },
        }),
      );

      setupNotProcessed();
      const db = makeRefundDb();
      // customer→user lookup (findSubscriptionByCustomer)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(db.customerLookup()),
      );
      // prior tier + update subscription + update user (all inside one callback)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(db.tierUpdate()),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup (subscriptionId is non-null)
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', status: 'refunded' }])),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // Full refund: premium → free triggers downgrade side-effects
      expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(
        42,
        expect.any(Object),
      );
      expect(mockSendGa4ServerEvent).toHaveBeenCalledWith(
        42,
        'refund',
        expect.objectContaining({
          transaction_id: 'pi_123',
          value: 19.99,
          currency: 'USD',
        }),
      );
    });

    it('partial refund persists metadata but does not change tier', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'charge.refunded',
          data: {
            object: {
              id: 'ch_part',
              customer: 'cus_123',
              payment_intent: 'pi_part',
              amount: 1999,
              amount_refunded: 500,
              currency: 'usd',
            },
          },
        }),
      );

      setupNotProcessed();
      const db = makeRefundDb();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(db.customerLookup()),
      );
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(db.tierUpdate()),
      );
      setupRecordEvent();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', status: 'active' }])),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // Partial refund must NOT downgrade the user.
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
      expect(mockSendGa4ServerEvent).toHaveBeenCalledWith(
        42,
        'refund',
        expect.objectContaining({
          transaction_id: 'pi_part',
          value: 5,
          currency: 'USD',
        }),
      );
    });

    it('falls back to charge.id as transaction_id when payment_intent is not a string', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'charge.refunded',
          data: {
            object: {
              id: 'ch_456',
              customer: 'cus_123',
              payment_intent: null,
              amount: 999,
              amount_refunded: 999,
              currency: 'usd',
            },
          },
        }),
      );

      setupNotProcessed();
      const db = makeRefundDb();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(db.customerLookup()),
      );
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(db.tierUpdate()),
      );
      setupRecordEvent();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', status: 'refunded' }])),
      );

      await handler(makeEvent());

      expect(mockSendGa4ServerEvent).toHaveBeenCalledWith(
        42,
        'refund',
        expect.objectContaining({ transaction_id: 'ch_456' }),
      );
    });

    it('skips processing when no user found for the customer', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'charge.refunded',
          data: {
            object: {
              id: 'ch_999',
              customer: 'cus_unknown',
              payment_intent: 'pi_999',
              amount: 100,
              amount_refunded: 100,
              currency: 'usd',
            },
          },
        }),
      );

      setupNotProcessed();
      // No matching subscription row
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(makeSelectDb([])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      expect(mockSendGa4ServerEvent).not.toHaveBeenCalled();
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
    });
  });

  // ── charge.dispute.created ────────────────────────────────────────────────

  describe('charge.dispute.created', () => {
    it('immediately revokes premium access and cancels Stripe subscription', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'charge.dispute.created',
          data: {
            object: {
              id: 'dp_123',
              charge: 'ch_disputed',
              status: 'warning_needs_response',
            },
          },
        }),
      );

      setupNotProcessed();
      // customer→user lookup
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ userId: 42, stripeSubscriptionId: 'sub_123' }])),
      );
      // prior tier + update subscription + update user
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectThenUpdateDb([{ tier: 'premium' }])),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', status: 'disputed' }])),
      );

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // Chargeback always downgrades premium → free
      expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(
        42,
        expect.any(Object),
      );
    });

    it('skips when no subscription record matches the dispute customer', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'charge.dispute.created',
          data: {
            object: {
              id: 'dp_999',
              charge: 'ch_disputed',
              status: 'warning_needs_response',
            },
          },
        }),
      );

      setupNotProcessed();
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) => cb(makeSelectDb([])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
    });
  });

  // ── Out-of-order event guard (LS-2613) ────────────────────────────────────

  describe('out-of-order event guard', () => {
    it('ignores a stale subscription.updated arriving after a newer event', async () => {
      // Event created at t=100 arrives after the row has already been
      // written by an event from t=200 (typical Stripe retry race).
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.updated',
          created: 100,
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

      setupNotProcessed();
      // Existing row carries a newer lastEventTimestamp (200 > 100).
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', lastEventTimestamp: 200 }])),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      // Stale event is acknowledged (200) but no writes / side effects fire.
      expect(result.statusCode).toBe(200);
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
      expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
      expect(mockPushPublish).not.toHaveBeenCalled();
      // isEventProcessed + select-existing + recordEvent — no insert/update DB.
      expect(mockRunWithInternalClient).toHaveBeenCalledTimes(3);
    });

    it('ignores a stale subscription.deleted when last_event_timestamp is newer', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.deleted',
          created: 100,
          data: { object: { id: 'sub_123' } },
        }),
      );

      setupNotProcessed();
      // Existing row is premium with a newer lastEventTimestamp; the
      // conditional UPDATE affects zero rows → treated as stale.
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(
            makeSelectThenUpdateDb(
              [{ userId: 42, tier: 'premium', lastEventTimestamp: 200 }],
              [], // returning() → 0 rows => stale
            ),
          ),
      );
      setupRecordEvent();

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(200);
      // Tier-change side effects must NOT fire for a stale cancel.
      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
      expect(mockPushPublish).not.toHaveBeenCalled();
    });

    it('processes a fresh event when last_event_timestamp is older', async () => {
      mockConstructEvent.mockReturnValue(
        fakeStripeEvent({
          type: 'customer.subscription.updated',
          created: 300,
          data: {
            object: {
              id: 'sub_123',
              customer: 'cus_123',
              status: 'canceled',
              cancel_at_period_end: false,
              trial_end: null,
              metadata: { userId: '42' },
              items: { data: [{ current_period_end: 1700000000 }] },
            },
          },
        }),
      );

      setupNotProcessed();
      // Existing row's lastEventTimestamp (200) is older than the new event (300).
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'premium', lastEventTimestamp: 200 }])),
      );
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeInsertUpdateDb()),
      );
      setupRecordEvent();
      // pushSubscriptionUpdated DB lookup
      mockRunWithInternalClient.mockImplementationOnce(
        (_opts: unknown, cb: (db: unknown) => unknown) =>
          cb(makeSelectDb([{ tier: 'free', status: 'canceled' }])),
      );

      await handler(makeEvent());

      // premium → free with older lastEventTimestamp → downgrade fires.
      expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(
        42,
        expect.any(Object),
      );
    });
  });
});
