import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import PlayerDetailScreen from './PlayerDetail';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseLocalSearchParams = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: (
    ...args: unknown[]
  ): Record<string, string | undefined> =>
    mockUseLocalSearchParams(...args) as Record<string, string | undefined>,
  useRouter: () => ({ back: mockBack }),
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

jest.mock('tamagui', () => {
  const {
    View: RNView,
    Text,
    Pressable,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  return {
    Button: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(Pressable, { testID, onPress }, children),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(Text, { testID }, children),
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(RNView, { testID }, children),
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

  it('shows invalid-deep-link-fallback when playerId param is missing', () => {
    mockUseLocalSearchParams.mockReturnValue({});
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
    expect(screen.getByTestId('player-detail-invalid-back')).toBeTruthy();
  });

  it('shows invalid-deep-link-fallback when playerId param is undefined', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: undefined });
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
    expect(screen.getByTestId('player-detail-invalid-back')).toBeTruthy();
  });

  it('shows invalid-deep-link-fallback when playerId param is non-numeric', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: 'abc' });
    render(<PlayerDetailScreen />);
    expect(screen.getByText('Player Not Found')).toBeTruthy();
    expect(screen.getByTestId('player-detail-invalid-back')).toBeTruthy();
  });

  it('calls router.back when the Go Back button is pressed on the fallback screen', () => {
    mockUseLocalSearchParams.mockReturnValue({ playerId: undefined });
    render(<PlayerDetailScreen />);
    fireEvent.press(screen.getByTestId('player-detail-invalid-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
