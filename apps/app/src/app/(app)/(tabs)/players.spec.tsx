import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import PlayersTab from './players';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseFeatureIsOn = jest.fn(() => false);
jest.mock('@growthbook/growthbook-react', () => ({
  useFeatureIsOn: (...args: unknown[]) => mockUseFeatureIsOn(...args),
}));

jest.mock('tamagui', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View, Pressable, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => ReactActual.createElement(Text, rest, children),
    XStack: ({
      children,
      testID,
    }: {
      children: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(View, { testID }, children),
    YStack: ({
      children,
      onPress,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      if (onPress) {
        return ReactActual.createElement(
          Pressable,
          { onPress, testID },
          children,
        );
      }
      return ReactActual.createElement(View, { testID }, children);
    },
  };
});

jest.mock('../PlayerStats', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: () =>
      ReactActual.createElement(View, { testID: 'player-stats-screen' }),
  };
});

jest.mock('../PlayerComparison', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: () =>
      ReactActual.createElement(View, { testID: 'player-comparison-screen' }),
  };
});

jest.mock('../football/players', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: () =>
      ReactActual.createElement(View, { testID: 'football-players-screen' }),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlayersTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFeatureIsOn.mockReturnValue(false);
  });

  describe('segmented control', () => {
    it('renders Stats and Compare segment buttons', () => {
      render(<PlayersTab />);
      expect(screen.getByTestId('players-segment-control')).toBeTruthy();
      expect(screen.getByTestId('segment-stats')).toBeTruthy();
      expect(screen.getByTestId('segment-compare')).toBeTruthy();
      expect(screen.getByText('Stats')).toBeTruthy();
      expect(screen.getByText('Compare')).toBeTruthy();
    });

    it('shows Stats content by default', () => {
      render(<PlayersTab />);
      expect(screen.getByTestId('player-stats-screen')).toBeTruthy();
      expect(screen.queryByTestId('player-comparison-screen')).toBeNull();
    });

    it('switches to Compare content when Compare is pressed', () => {
      render(<PlayersTab />);
      fireEvent.press(screen.getByTestId('segment-compare'));
      expect(screen.getByTestId('player-comparison-screen')).toBeTruthy();
      expect(screen.queryByTestId('player-stats-screen')).toBeNull();
    });

    it('switches back to Stats content when Stats is pressed after Compare', () => {
      render(<PlayersTab />);
      fireEvent.press(screen.getByTestId('segment-compare'));
      fireEvent.press(screen.getByTestId('segment-stats'));
      expect(screen.getByTestId('player-stats-screen')).toBeTruthy();
      expect(screen.queryByTestId('player-comparison-screen')).toBeNull();
    });
  });

  describe('sport filter — football disabled', () => {
    it('hides the sport filter when football is not enabled', () => {
      mockUseFeatureIsOn.mockReturnValue(false);
      render(<PlayersTab />);
      expect(screen.queryByTestId('players-sport-filter')).toBeNull();
    });

    it('shows baseball stats when football is disabled', () => {
      mockUseFeatureIsOn.mockReturnValue(false);
      render(<PlayersTab />);
      expect(screen.getByTestId('player-stats-screen')).toBeTruthy();
      expect(screen.queryByTestId('football-players-screen')).toBeNull();
    });
  });

  describe('sport filter — football enabled', () => {
    beforeEach(() => {
      mockUseFeatureIsOn.mockReturnValue(true);
    });

    it('shows the sport filter when football is enabled', () => {
      render(<PlayersTab />);
      expect(screen.getByTestId('players-sport-filter')).toBeTruthy();
      expect(screen.getByTestId('sport-baseball')).toBeTruthy();
      expect(screen.getByTestId('sport-football')).toBeTruthy();
      expect(screen.getByText('Baseball')).toBeTruthy();
      expect(screen.getByText('Football')).toBeTruthy();
    });

    it('shows baseball stats by default when football is enabled', () => {
      render(<PlayersTab />);
      expect(screen.getByTestId('player-stats-screen')).toBeTruthy();
      expect(screen.queryByTestId('football-players-screen')).toBeNull();
    });

    it('switches to football players when Football pill is pressed', () => {
      render(<PlayersTab />);
      fireEvent.press(screen.getByTestId('sport-football'));
      expect(screen.getByTestId('football-players-screen')).toBeTruthy();
      expect(screen.queryByTestId('player-stats-screen')).toBeNull();
    });

    it('switches back to baseball when Baseball pill is pressed', () => {
      render(<PlayersTab />);
      fireEvent.press(screen.getByTestId('sport-football'));
      fireEvent.press(screen.getByTestId('sport-baseball'));
      expect(screen.getByTestId('player-stats-screen')).toBeTruthy();
      expect(screen.queryByTestId('football-players-screen')).toBeNull();
    });

    it('shows Compare content regardless of sport selection', () => {
      render(<PlayersTab />);
      fireEvent.press(screen.getByTestId('sport-football'));
      fireEvent.press(screen.getByTestId('segment-compare'));
      expect(screen.getByTestId('player-comparison-screen')).toBeTruthy();
      expect(screen.queryByTestId('football-players-screen')).toBeNull();
    });
  });
});
