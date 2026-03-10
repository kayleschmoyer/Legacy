/**
 * Subscription & billing GraphQL mock data factories.
 *
 * Use these as defaults when mocking mySubscription, createCheckoutSession,
 * createBillingPortalSession, etc.  Override individual fields per-test as needed.
 */

// ---------------------------------------------------------------------------
// Subscription info shape (mirrors SubscriptionInfo GraphQL type)
// ---------------------------------------------------------------------------

export interface MockSubscription {
  __typename: 'SubscriptionInfo';
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
  tier: 'free' | 'premium' | 'monthly' | 'annual';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
}

export function mockSubscription(
  overrides: Partial<MockSubscription> = {},
): MockSubscription {
  return {
    __typename: 'SubscriptionInfo',
    status: 'active',
    tier: 'premium',
    currentPeriodEnd: '2026-04-10T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    gracePeriodEndsAt: null,
    ...overrides,
  };
}

export function mockFreeSubscription(
  overrides: Partial<MockSubscription> = {},
): MockSubscription {
  return mockSubscription({
    status: 'inactive',
    tier: 'free',
    currentPeriodEnd: null,
    ...overrides,
  });
}

export function mockTrialingSubscription(
  overrides: Partial<MockSubscription> = {},
): MockSubscription {
  return mockSubscription({
    status: 'trialing',
    tier: 'premium',
    currentPeriodEnd: '2026-03-24T00:00:00.000Z',
    trialEndsAt: '2026-03-24T00:00:00.000Z',
    ...overrides,
  });
}

export function mockPastDueSubscription(
  overrides: Partial<MockSubscription> = {},
): MockSubscription {
  return mockSubscription({
    status: 'past_due',
    tier: 'premium',
    gracePeriodEndsAt: '2026-03-17T00:00:00.000Z',
    ...overrides,
  });
}

export function mockCanceledSubscription(
  overrides: Partial<MockSubscription> = {},
): MockSubscription {
  return mockSubscription({
    status: 'canceled',
    tier: 'free',
    currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Response shapes (ready to return from route.fulfill)
// ---------------------------------------------------------------------------

/** Response for the `mySubscription` query when user has an active premium sub. */
export function myPremiumSubscriptionResponse(
  overrides: Partial<MockSubscription> = {},
) {
  return { data: { mySubscription: mockSubscription(overrides) } };
}

/** Response for the `mySubscription` query when user is on the free tier. */
export function myFreeSubscriptionResponse() {
  return { data: { mySubscription: null } };
}

/** Response for the `mySubscription` query when user is past_due. */
export function myPastDueSubscriptionResponse(
  overrides: Partial<MockSubscription> = {},
) {
  return {
    data: { mySubscription: mockPastDueSubscription(overrides) },
  };
}

/** Response for the `mySubscription` query when sub is canceled. */
export function myCanceledSubscriptionResponse(
  overrides: Partial<MockSubscription> = {},
) {
  return {
    data: { mySubscription: mockCanceledSubscription(overrides) },
  };
}

/** Response for the `createCheckoutSession` mutation. */
export function createCheckoutSessionResponse(
  url = 'https://checkout.stripe.com/pay/cs_test_abc123',
) {
  return { data: { createCheckoutSession: { url } } };
}

/** Response for the `createBillingPortalSession` mutation. */
export function createBillingPortalSessionResponse(
  url = 'https://billing.stripe.com/session/test_abc123',
) {
  return { data: { createBillingPortalSession: { url } } };
}
