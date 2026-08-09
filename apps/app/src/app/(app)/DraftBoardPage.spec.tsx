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
    createTokens: (tokens: unknown) => tokens,
    Text: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <Text {...rest}>{children}</Text>,
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
    it('renders a degraded-polling banner instead of a hard error', () => {
      render(<DraftBoardPage />);
      expect(
        screen.getByText(
          /Real-time updates unavailable — polling for picks every 5s/i,
        ),
      ).toBeTruthy();
      expect(screen.queryByText(/WebSocket URL is not configured/i)).toBeNull();
    });

    it('still renders the EliteDraftBoardScreen so the draft remains usable', () => {
      render(<DraftBoardPage />);
      expect(screen.getByTestId('elite-draft-board-screen')).toBeTruthy();
    });
  });

  describe('when websocketUrl is configured', () => {
    it('renders the EliteDraftBoardScreen without the degraded-polling banner', () => {
      mockWebsocketUrl = 'wss://example.com/ws';
      render(<DraftBoardPage />);
      expect(screen.getByTestId('elite-draft-board-screen')).toBeTruthy();
      expect(screen.queryByText(/Real-time updates unavailable/i)).toBeNull();
    });
  });
});
