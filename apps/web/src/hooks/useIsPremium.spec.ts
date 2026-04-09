import { renderHook } from '@testing-library/react';
import { useIsPremiumStatus } from './useIsPremium';

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../api/db/graphql.generated', () => ({
  useGetUserByIdQuery: jest.fn(),
}));

const { useAuth } = jest.requireMock(
  '@legacy-sports/shared-components/auth',
) as unknown as { useAuth: jest.Mock };

const { useGetUserByIdQuery } = jest.requireMock(
  '../api/db/graphql.generated',
) as unknown as { useGetUserByIdQuery: jest.Mock };

describe('useIsPremiumStatus', () => {
  beforeEach(() => {
    jest.resetAllMocks();
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
});
