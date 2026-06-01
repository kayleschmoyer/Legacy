import { renderHook } from '@testing-library/react-native';

// ── Module under test ─────────────────────────────────────────────────────────

import { useSubscription } from './useSubscription';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

const mockUseGetMySubscriptionQuery = jest.fn();
jest.mock('../../api/db/graphql.generated', () => ({
  useGetMySubscriptionQuery: (...args: unknown[]): unknown =>
    mockUseGetMySubscriptionQuery(...args),
  useCreateBillingPortalSessionMutation: jest.fn(() => [jest.fn(), {}]),
  useCreateCheckoutSessionMutation: jest.fn(() => [jest.fn(), {}]),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryResult(
  subscription: {
    status: string;
    tier: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean | null;
    gracePeriodEndsAt?: string | null;
  } | null,
  opts: { loading?: boolean; error?: unknown } = {},
) {
  return {
    data: subscription
      ? { mySubscription: subscription }
      : { mySubscription: null },
    loading: opts.loading ?? false,
    error: opts.error,
    refetch: jest.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSubscription — isPremium', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('AC1: returns isPremium=true during grace period (status=past_due, tier=premium)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'past_due', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(true);
  });

  it('AC2: returns isPremium=true for active premium users (status=active, tier=premium)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(true);
  });

  it('AC2: returns isPremium=true for trialing premium users (status=trialing, tier=premium)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'trialing', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(true);
  });

  it('AC3: returns isPremium=false for free-tier users (status=active, tier=free)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'free' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(false);
  });

  it('AC3: returns isPremium=false when subscription is null', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(makeQueryResult(null));

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(false);
  });

  it('returns isPremium=false for canceled subscriptions with free tier', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'canceled', tier: 'free' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(false);
  });

  it('exposes tier from the subscription', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.tier).toBe('premium');
  });

  it('defaults tier to free when subscription is null', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(makeQueryResult(null));

    const { result } = renderHook(() => useSubscription());

    expect(result.current.tier).toBe('free');
  });
});
