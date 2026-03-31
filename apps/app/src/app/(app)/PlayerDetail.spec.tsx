import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import PlayerDetailScreen from './PlayerDetail';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: (
    ...args: unknown[]
  ): Record<string, string | undefined> =>
    mockUseLocalSearchParams(...args) as Record<string, string | undefined>,
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlayerDetailById: ({ playerId }: { playerId: number }) => (
      <View testID={`player-detail-${playerId}`} />
    ),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: '1' });
    render(<PlayerDetailScreen />);
    expect(screen.getByTestId('player-detail-1')).toBeTruthy();
  });

  it('parses playerId string to number and passes it to PlayerDetailById', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: '42' });
    render(<PlayerDetailScreen />);
    expect(screen.getByTestId('player-detail-42')).toBeTruthy();
  });

  it('defaults to playerId 0 when playerId param is missing', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    render(<PlayerDetailScreen />);
    expect(screen.getByTestId('player-detail-0')).toBeTruthy();
  });

  it('defaults to playerId 0 when playerId param is undefined', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: undefined });
    render(<PlayerDetailScreen />);
    expect(screen.getByTestId('player-detail-0')).toBeTruthy();
  });
});
