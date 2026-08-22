import { renderHook } from '@testing-library/react';
import { useEntitlements, useHasEntitlement } from './useEntitlement';

interface MockAuthState {
  user: { id: number } | null;
  isLoading: boolean;
}
interface MockEntitlementsResult {
  data: { myEntitlements: string[] } | undefined;
  loading: boolean;
}

const mockUseAuth = jest.fn<MockAuthState, []>();
jest.mock('../features/auth', () => ({
  useAuth: (): MockAuthState => mockUseAuth(),
}));

const mockUseMyEntitlementsQuery = jest.fn<MockEntitlementsResult, [unknown]>();
jest.mock('@legacy-sports/graphql', () => ({
  useMyEntitlementsQuery: (args: unknown): MockEntitlementsResult =>
    mockUseMyEntitlementsQuery(args),
}));

describe('useEntitlements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns loading while auth is resolving', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    mockUseMyEntitlementsQuery.mockReturnValue({
      data: undefined,
      loading: false,
    });

    const { result } = renderHook(() => useEntitlements());

    expect(result.current).toEqual({ entitlements: [], isLoading: true });
  });

  it('skips the query while unauthenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseMyEntitlementsQuery.mockReturnValue({
      data: undefined,
      loading: false,
    });

    renderHook(() => useEntitlements());

    expect(mockUseMyEntitlementsQuery).toHaveBeenCalledWith({ skip: true });
  });

  it('returns the entitlement set once resolved', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });
    mockUseMyEntitlementsQuery.mockReturnValue({
      data: { myEntitlements: ['matchup_projections'] },
      loading: false,
    });

    const { result } = renderHook(() => useEntitlements());

    expect(result.current).toEqual({
      entitlements: ['matchup_projections'],
      isLoading: false,
    });
  });
});

describe('useHasEntitlement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns false while loading, even if the key is present', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 }, isLoading: true });
    mockUseMyEntitlementsQuery.mockReturnValue({
      data: { myEntitlements: ['matchup_projections'] },
      loading: false,
    });

    const { result } = renderHook(() =>
      useHasEntitlement('matchup_projections'),
    );

    expect(result.current).toBe(false);
  });

  it('returns true when the resolved set includes the key', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });
    mockUseMyEntitlementsQuery.mockReturnValue({
      data: { myEntitlements: ['matchup_projections'] },
      loading: false,
    });

    const { result } = renderHook(() =>
      useHasEntitlement('matchup_projections'),
    );

    expect(result.current).toBe(true);
  });

  it('returns false when the resolved set excludes the key', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });
    mockUseMyEntitlementsQuery.mockReturnValue({
      data: { myEntitlements: [] },
      loading: false,
    });

    const { result } = renderHook(() =>
      useHasEntitlement('matchup_projections'),
    );

    expect(result.current).toBe(false);
  });
});
