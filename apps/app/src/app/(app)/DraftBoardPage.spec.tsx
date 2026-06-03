import React from 'react';
import { render, screen } from '@testing-library/react-native';

import DraftBoardPage from './DraftBoardPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockWebsocketUrl: string | undefined = undefined;
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return { websocketUrl: mockWebsocketUrl };
  },
}));

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
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebsocketUrl = undefined;
  });

  describe('when websocketUrl is not configured', () => {
    it('renders an error message', () => {
      render(<DraftBoardPage />);
      expect(screen.getByText(/WebSocket URL is not configured/i)).toBeTruthy();
    });
  });

  describe('when websocketUrl is configured', () => {
    it('renders the EliteDraftBoardScreen', () => {
      mockWebsocketUrl = 'wss://example.com/ws';
      render(<DraftBoardPage />);
      expect(screen.getByTestId('elite-draft-board-screen')).toBeTruthy();
    });
  });
});
