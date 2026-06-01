import { renderHook } from '@testing-library/react';
import type { UseLeagueWebSocketOptions } from './useLeagueWebSocket';
import { useIsPremiumStatus } from './useIsPremium';

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../api/db/graphql.generated', () => ({
  useGetUserByIdQuery: jest.fn(),
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

const { useGetUserByIdQuery } = jest.requireMock(
  '../api/db/graphql.generated',
) as unknown as { useGetUserByIdQuery: jest.Mock };

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

  it('returns isPremium: true for admin regardless of subscription tier', () => {
    useAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'admin' },
      isLoading: false,
    });
    useGetUserByIdQuery.mockReturnValue({
      data: { user: { subscriptionTier: 'free' } },
      loading: false,
    });

    const { result } = renderHook(() => useIsPremiumStatus());

    expect(result.current.isPremium).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns isPremium: true for user with premium subscription tier', () => {
    useAuth.mockReturnValue({
      user: { id: 1, accessLevel: 'user' },
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
      user: { id: 1, accessLevel: 'user' },
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
      user: { id: 2, accessLevel: 'user' },
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
      user: { id: 2, accessLevel: 'user' },
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
      user: { id: 42, accessLevel: 'user' },
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
      user: { id: 42, accessLevel: 'user' },
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
    function setLocationSearch(search: string) {
      Object.defineProperty(window, 'location', {
        value: { search },
        writable: true,
        configurable: true,
      });
    }

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
        configurable: true,
      });
    });

    it('refetches on mount when ?checkout=success is in the URL', () => {
      setLocationSearch('?checkout=success&session_id=cs_123');

      const refetch = jest.fn().mockResolvedValue({});
      useAuth.mockReturnValue({
        user: { id: 42, accessLevel: 'user' },
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
        user: { id: 42, accessLevel: 'user' },
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
