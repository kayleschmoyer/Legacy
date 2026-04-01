import React from 'react';
import { render, screen } from '@testing-library/react-native';

import DraftBoardPage from './DraftBoardPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    EliteDraftBoardScreen: () => <View testID="elite-draft-board-screen" />,
  };
});

jest.mock('tamagui', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <Text {...(rest as object)}>{children}</Text>,
    YStack: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn() },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DraftBoardPage', () => {
  const originalWebsocketUrl = process.env.EXPO_PUBLIC_WEBSOCKET_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_WEBSOCKET_URL;
  });

  afterEach(() => {
    if (originalWebsocketUrl !== undefined) {
      process.env.EXPO_PUBLIC_WEBSOCKET_URL = originalWebsocketUrl;
    } else {
      delete process.env.EXPO_PUBLIC_WEBSOCKET_URL;
    }
  });

  describe('when EXPO_PUBLIC_WEBSOCKET_URL is not configured', () => {
    it('renders an error message', () => {
      render(<DraftBoardPage />);
      expect(screen.getByText(/WebSocket URL is not configured/i)).toBeTruthy();
    });
  });

  describe('when EXPO_PUBLIC_WEBSOCKET_URL is configured', () => {
    it('renders the EliteDraftBoardScreen', () => {
      process.env.EXPO_PUBLIC_WEBSOCKET_URL = 'wss://example.com/ws';
      render(<DraftBoardPage />);
      expect(screen.getByTestId('elite-draft-board-screen')).toBeTruthy();
    });
  });
});
