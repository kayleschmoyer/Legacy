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

const mockEliteDraftBoardScreen = jest.fn();
jest.mock('@legacy-sports/shared-components/elite-draft', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    EliteDraftBoardScreen: (props: Record<string, unknown>) => {
      mockEliteDraftBoardScreen(props);
      return <View testID="elite-draft-board-screen" />;
    },
  };
});

// Mirrors the other `(app)` screen specs (LS-8625/LS-8834): no real
// SafeAreaProvider is mounted in this unit-test tree, so the hook needs a
// fixed value. `bottom: 48` stands in for Android's 3-button nav bar.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 48, left: 0, right: 0 }),
}));

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

  // LS-9444: this route is pushed outside the `(tabs)` group, so React
  // Navigation's tab bar never reserves the Android navigation-bar inset for
  // it — the draft board's own bottom nav has to, and only gets the chance if
  // this screen forwards the inset.
  it('forwards the safe-area bottom inset to the draft board', () => {
    render(<DraftBoardPage />);

    expect(mockEliteDraftBoardScreen).toHaveBeenCalledWith(
      expect.objectContaining({ bottomInset: 48 }),
    );
  });
});
