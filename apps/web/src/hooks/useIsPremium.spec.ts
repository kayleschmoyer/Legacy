import { act, renderHook } from '@testing-library/react';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import type { UseLeagueWebSocketOptions } from './useLeagueWebSocket';
import {
  useEntitlements,
  useHasEntitlement,
  useIsPremiumStatus,
} from './useIsPremium';

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: jest.fn(),
  useMyEntitlementsQuery: jest.fn(),
}));

jest.mock('../lib/jwt-refresh', () => ({
  silentlyRefreshJwt: jest.fn().mockResolvedValue('new-jwt'),
}));

jest.mock('./useLeagueWebSocket', () => ({
  useLeagueWebSocket: jest.fn(),
}));

jest.mock('../context/LeagueWebSocketContext', () => ({
  useLeagueWebSocketClient: jest.fn(() => ({ client: {}, connected: true })),
}));

const { useAuth } = jest.requireMock(
  '@legacy-sports/shared-components/auth',
) as unknown as { useAuth: jest.Mock };

const { useGetUserByIdQuery, useMyEntitlementsQuery } = jest.requireMock(
  '@legacy-sports/graphql',
) as unknown as {
  useGetUserByIdQuery: jest.Mock;
  useMyEntitlementsQuery: jest.Mock;
};

const { silentlyRefreshJwt } = jest.requireMock('../lib/jwt-refresh');

const { useLeagueWebSocket } = jest.requireMock('./useLeagueWebSocket');

const { useLeagueWebSocketClient } = jest.requireMock(
  '../context/LeagueWebSocketContext',
);

describe('useIsPremiumStatus', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useLeagueWebSocketClient.mockReturnValue({ client: {}, connected: true });
  });

  it('returns isPremium: false while auth is loading', () => {
    useAuth.mockReturnValue({ user: undefined, isLoading: true });
    useGetUserByIdQuery.mockReturnValue({ data: undefined, loading: false });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns isPremium: false while user query is loading', () => {
    useAuth.mockReturnValue({
      user: { id: 1 },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({ data: undefined, loading: true });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns isPremium: true for a server-reported admin regardless of subscription tier', () => {
    useAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'admin' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { accessLevel: 'admin', subscriptionTier: 'free' } },
      loading: false,
    });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a forged client-side admin claim when the server does not report admin (LGN-013)', () => {
    // The auth-state `accessLevel` is hydrated from localStorage, written from
    // an unverified JWT. A forged `accessLevel: 'admin'` must NOT grant premium
    // when the server-authoritative GetUserById response says the user is a
    // non-admin on the free tier.
    useAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'admin' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { id: 1, accessLevel: 'none', subscriptionTier: 'free' } },
      loading: false,
    });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isPremium: true for user with premium subscription tier', () => {
    useAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'none' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { subscriptionTier: 'premium' } },
      loading: false,
    });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isPremium: false for user with free subscription tier', () => {
    useAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'none' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { subscriptionTier: 'free' } },
      loading: false,
    });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isPremium: false when Apollo data belongs to a previous user (stale cache)', () => {
    // Simulates logout-then-login: auth now shows user 2, but Apollo still
    // holds user 1's premium record while the new query is in-flight.
    useAuth.mockReturnValue({
      user: { id: 2, accessLevel: 'none' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { id: 1, subscriptionTier: 'premium' } },
      loading: false,
    });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns correct premium status once fresh data arrives for new user', () => {
    useAuth.mockReturnValue({
      user: { id: 2, accessLevel: 'none' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { id: 2, subscriptionTier: 'free' } },
      loading: false,
    });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('does not poll the user query (push notifications keep it fresh)', () => {
    useAuth.mockReturnValue({
      user: { id: 42, accessLevel: 'none' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { subscriptionTier: 'premium' } },
      loading: false,
      refetch: jest.fn(),
    });

    renderHook(() => useIsPremiumStatus());

    expect(useGetUserByIdQuery).toHaveBeenCalledWith(
      expect.not.objectContaining({ pollInterval: expect.anything() }),
    );
  });

  it('refetches the user query on SUBSCRIPTION_UPDATED push', () => {
    const refetch = jest.fn().mockResolvedValue({});
    useAuth.mockReturnValue({
      user: { id: 42, accessLevel: 'none' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { subscriptionTier: 'premium' } },
      loading: false,
      refetch,
    });

    renderHook(() => useIsPremiumStatus());

    const opts = useLeagueWebSocket.mock
      .calls[0]?.[0] as UseLeagueWebSocketOptions;
    expect(opts.onSubscriptionUpdated).toBeDefined();
    opts.onSubscriptionUpdated?.({
      type: 'subscription_updated',
      tier: 'free',
      status: 'canceled',
    } as never);
    expect(refetch).toHaveBeenCalledTimes(1);
    // Proactive path (LS-8645): the same notification re-mints the JWT so the
    // fresh entitlement claim propagates before any request is rejected.
    expect(silentlyRefreshJwt).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on SUBSCRIPTION_UPDATED when there is no authed user', () => {
    const refetch = jest.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ user: undefined, isLoading: false });
    useGetUserByIdQuery.mockReturnValue({
      data: undefined,
      loading: false,
      refetch,
    });

    renderHook(() => useIsPremiumStatus());

    const opts = useLeagueWebSocket.mock
      .calls[0]?.[0] as UseLeagueWebSocketOptions;
    opts.onSubscriptionUpdated?.({
      type: 'subscription_updated',
      tier: 'premium',
      status: 'active',
    } as never);
    expect(refetch).not.toHaveBeenCalled();
  });

  describe('checkout redirect refetch', () => {
    // jsdom's window.history.pushState updates window.location.search for the
    // same-origin test document, so the hook's `new
    // URLSearchParams(window.location.search)` read reflects it without ever
    // touching the (as of jsdom 26 / jest-environment-jsdom 30) unforgeable
    // `window.location` global — see jestjs/jest#15674.
    function setLocationSearch(search: string) {
      window.history.pushState({}, '', `/${search}`);
    }

    afterEach(() => {
      window.history.pushState({}, '', '/');
    });

    it('refetches on mount when ?checkout=success is in the URL', () => {
      setLocationSearch('?checkout=success&session_id=cs_123');

      const refetch = jest.fn().mockResolvedValue({});
      useAuth.mockReturnValue({
        user: { id: 42, accessLevel: 'none' },
        isLoading: false,
      });
      useGetUserByIdQuery.mockReturnValue({
        data: { user: { id: 42, subscriptionTier: 'free' } },
        loading: false,
        refetch,
      });

      renderHook(() => useIsPremiumStatus());

      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('does not refetch on mount when ?checkout=success is absent', () => {
      setLocationSearch('');

      const refetch = jest.fn().mockResolvedValue({});
      useAuth.mockReturnValue({
        user: { id: 42, accessLevel: 'none' },
        isLoading: false,
      });
      useGetUserByIdQuery.mockReturnValue({
        data: { user: { id: 42, subscriptionTier: 'free' } },
        loading: false,
        refetch,
      });

      renderHook(() => useIsPremiumStatus());

      expect(refetch).not.toHaveBeenCalled();
    });

    it('does not refetch on mount when ?checkout=success is present but user is not authed', () => {
      setLocationSearch('?checkout=success');

      const refetch = jest.fn().mockResolvedValue({});
      useAuth.mockReturnValue({ user: undefined, isLoading: false });
      useGetUserByIdQuery.mockReturnValue({
        data: undefined,
        loading: false,
        refetch,
      });

      renderHook(() => useIsPremiumStatus());

      expect(refetch).not.toHaveBeenCalled();
    });
  });
});

describe('useEntitlements / useHasEntitlement', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns isLoading: true (empty set) while auth is loading', () => {
    useAuth.mockReturnValue({ user: undefined, isLoading: true });
    useMyEntitlementsQuery.mockReturnValue({ data: undefined, loading: false });

    const { result } = renderHook(() => useEntitlements());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.entitlements).toEqual([]);
  });

  it('skips the query until a user is authenticated', () => {
    useAuth.mockReturnValue({ user: undefined, isLoading: false });
    useMyEntitlementsQuery.mockReturnValue({ data: undefined, loading: false });

    renderHook(() => useEntitlements());

    expect(useMyEntitlementsQuery).toHaveBeenCalledWith({ skip: true });
  });

  it('exposes the token-derived entitlement set for an authed user', () => {
    useAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });
    useMyEntitlementsQuery.mockReturnValue({
      data: { myEntitlements: [ENTITLEMENTS.player_comparison] },
      loading: false,
    });

    const { result } = renderHook(() => useEntitlements());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.entitlements).toEqual([
      ENTITLEMENTS.player_comparison,
    ]);
  });

  it('useHasEntitlement returns true only for a granted key', () => {
    useAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });
    useMyEntitlementsQuery.mockReturnValue({
      data: { myEntitlements: [ENTITLEMENTS.player_comparison] },
      loading: false,
    });

    const granted = renderHook(() =>
      useHasEntitlement(ENTITLEMENTS.player_comparison),
    );
    const notGranted = renderHook(() =>
      useHasEntitlement(ENTITLEMENTS.trade_analyzer),
    );

    expect(granted.result.current).toBe(true);
    expect(notGranted.result.current).toBe(false);
  });

  it('useHasEntitlement returns false while the set is still loading', () => {
    useAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });
    useMyEntitlementsQuery.mockReturnValue({ data: undefined, loading: true });

    const { result } = renderHook(() =>
      useHasEntitlement(ENTITLEMENTS.player_comparison),
    );

    expect(result.current).toBe(false);
  });

  it('refetches the entitlement set on an auth:token-refreshed event', () => {
    const refetch = jest.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });
    useMyEntitlementsQuery.mockReturnValue({
      data: { myEntitlements: [] },
      loading: false,
      refetch,
    });

    renderHook(() => useEntitlements());

    act(() => {
      window.dispatchEvent(new CustomEvent('auth:token-refreshed'));
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
