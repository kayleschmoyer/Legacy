import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import GamesTab from './games';
import { trackMinigameTap } from '../../../utils/analytics';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => ({ push: mockPush }),
  };
});

jest.mock('../../../utils/analytics', () => ({
  trackMinigameTap: jest.fn(),
}));

jest.mock('../_screenErrorBoundary', () => ({
  ScreenErrorBoundary: () => null,
}));

jest.mock('tamagui', () => {
  const { View, Text, TouchableOpacity } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => <Text {...(rest as object)}>{children}</Text>,
    XStack: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => <View {...(rest as object)}>{children}</View>,
    YStack: ({
      children,
      onPress,
      pressStyle: _pressStyle,
      ...rest
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      pressStyle?: unknown;
      [key: string]: unknown;
    }) =>
      onPress ? (
        <TouchableOpacity onPress={onPress} {...(rest as object)}>
          {children}
        </TouchableOpacity>
      ) : (
        <View {...(rest as object)}>{children}</View>
      ),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GamesTab', () => {
  it('renders all three game entries', () => {
    render(<GamesTab />);

    expect(screen.getByTestId('games-entry-season-draft')).toBeTruthy();
    expect(screen.getByTestId('games-entry-disclosure')).toBeTruthy();
    expect(screen.getByTestId('games-entry-twenty-questions')).toBeTruthy();
  });

  it('tracks and navigates on Season Draft tap', () => {
    render(<GamesTab />);

    fireEvent.press(screen.getByTestId('games-entry-season-draft'));

    expect(jest.mocked(trackMinigameTap)).toHaveBeenCalledWith('season-draft');
    expect(mockPush).toHaveBeenCalledWith('/season-draft');
  });

  it('tracks and navigates on Who Am I? tap', () => {
    render(<GamesTab />);

    fireEvent.press(screen.getByTestId('games-entry-disclosure'));

    expect(jest.mocked(trackMinigameTap)).toHaveBeenCalledWith('disclosure');
    expect(mockPush).toHaveBeenCalledWith('/disclosure-game');
  });

  it('tracks and navigates on 20 Questions tap', () => {
    render(<GamesTab />);

    fireEvent.press(screen.getByTestId('games-entry-twenty-questions'));

    expect(jest.mocked(trackMinigameTap)).toHaveBeenCalledWith(
      'twenty-questions',
    );
    expect(mockPush).toHaveBeenCalledWith('/games/twenty-questions');
  });
});
