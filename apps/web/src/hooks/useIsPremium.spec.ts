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
});
