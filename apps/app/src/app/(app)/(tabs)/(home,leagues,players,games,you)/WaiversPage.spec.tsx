import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import WaiversPage from './WaiversPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ leagueId: '42' })),
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../../__test-utils__/tamagui-mocks')
  >('../../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

jest.mock('@tamagui/lucide-icons', () => ({
  ShoppingCart: () => null,
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    createTokens: (tokens: unknown) => tokens,
    PendingWaiverClaims: () => <View testID="pending-waiver-claims" />,
  };
});

jest.mock('../../../../common/utilities/RouteUtils', () => ({
  toIntId: (v: unknown) => {
    const n = parseInt(String(Array.isArray(v) ? v[0] : v), 10);
    return isNaN(n) ? null : n;
  },
}));

const mockUseGetUserTeamIdQuery = jest.fn<
  { data: { userTeamId: number | null } | undefined; loading: boolean },
  []
>(() => ({
  data: { userTeamId: 10 },
  loading: false,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserTeamIdQuery: () => mockUseGetUserTeamIdQuery(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WaiversPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetUserTeamIdQuery.mockReturnValue({
      data: { userTeamId: 10 },
      loading: false,
    });
    const { useLocalSearchParams } = jest.requireMock<{
      useLocalSearchParams: jest.Mock;
    }>('expo-router');
    useLocalSearchParams.mockReturnValue({ leagueId: '42' });
  });

  it('shows a spinner while loading', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({
      data: undefined,
      loading: true,
    });
    render(<WaiversPage />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('shows no-league message when leagueId param is missing', () => {
    const { useLocalSearchParams } = jest.requireMock<{
      useLocalSearchParams: jest.Mock;
    }>('expo-router');
    useLocalSearchParams.mockReturnValue({ leagueId: undefined });
    render(<WaiversPage />);
    expect(screen.getByText(/No league selected/)).toBeTruthy();
  });

  it('shows no-team message when userTeamId is null', () => {
    mockUseGetUserTeamIdQuery.mockReturnValue({
      data: { userTeamId: null },
      loading: false,
    });
    render(<WaiversPage />);
    expect(
      screen.getByText(/You do not have a team in this league/),
    ).toBeTruthy();
  });

  it('renders PendingWaiverClaims and browse button when user has a team', () => {
    render(<WaiversPage />);
    expect(screen.getByTestId('pending-waiver-claims')).toBeTruthy();
    expect(screen.getByText('Browse Free Agents & Submit Claim')).toBeTruthy();
  });

  it('navigates to FreeAgents on browse button press', () => {
    render(<WaiversPage />);
    fireEvent.press(screen.getByText('Browse Free Agents & Submit Claim'));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/FreeAgents' }),
    );
  });
});
