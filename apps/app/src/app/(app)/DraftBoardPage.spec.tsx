import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import DraftBoardPage from './DraftBoardPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockWebsocketUrl: string | undefined = undefined;
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return { websocketUrl: mockWebsocketUrl };
  },
}));

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;

// Native module — not parseable/usable under Jest (LS-10593).
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    dismissTo: mockDismissTo,
    navigate: mockNavigate,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
}));

const mockEliteDraftBoardScreen = jest.fn<void, [Record<string, unknown>]>();
// What the board sees from LeagueWebSocketContext (LS-10593).
const mockBoardSocketContext = jest.fn<void, [unknown]>();
jest.mock('@legacy-sports/shared-components/elite-draft', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const { useContext } = jest.requireActual<typeof import('react')>('react');
  const { LeagueWebSocketContext } = jest.requireActual<
    typeof import('../../context/LeagueWebSocketContext')
  >('../../context/LeagueWebSocketContext');
  return {
    DraftChatTab: () => null,
    EliteDraftBoardScreen: (props: Record<string, unknown>) => {
      mockEliteDraftBoardScreen(props);
      mockBoardSocketContext(useContext(LeagueWebSocketContext));
      return <View testID="elite-draft-board-screen" />;
    },
  };
});

const mockLifecycle = jest.fn();
const mockSocketClient = { id: 'league-socket' };
jest.mock('../../hooks/useLeagueWebSocketLifecycle', () => ({
  useLeagueWebSocketLifecycle: (...args: unknown[]): unknown => {
    mockLifecycle(...args);
    return { client: mockSocketClient, connected: true };
  },
}));

// Never settles by default so unrelated tests don't trip act() warnings
// from the async token state update; the socket test resolves it.
let mockKeychainToken: Promise<string | null> = new Promise(() => undefined);
jest.mock('../../common/auth/AuthHooks', () => ({
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
  readKeychainValue: (): Promise<string | null> => mockKeychainToken,
}));

interface MockChatMessage {
  id: number;
  userId: number;
  username: string;
  messageText: string;
  pending?: boolean;
}
let mockChatMessages: MockChatMessage[] = [];
jest.mock('../../features/leagues/hooks/useLeagueChat', () => ({
  useLeagueChat: () => ({
    messages: mockChatMessages,
    loading: false,
    sending: false,
    sendError: null,
    sendMessage: jest.fn(),
  }),
}));

let mockStoredLastRead: number | null = null;
const mockSetLastRead = jest.fn();
jest.mock('../../common/utilities/lastReadChatMessage', () => ({
  getLastReadChatMessageId: (): Promise<number | null> =>
    Promise.resolve(mockStoredLastRead),
  setLastReadChatMessageId: (...args: unknown[]): unknown =>
    mockSetLastRead(...args),
}));

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
    mockCanGoBack = true;
    mockParams = {};
    mockChatMessages = [];
    mockStoredLastRead = null;
    mockKeychainToken = new Promise(() => undefined);
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

  // LS-9446: Exit Draft used to push router.navigate('/baseball') — a
  // redirect-only route on native that left the (tabs)/Home screen hidden
  // behind the stale draft stack instead of revealing it. onExitDraft pops
  // the stack via closeToHomeTab instead.
  describe('onExitDraft', () => {
    it('pops the navigation stack via router.back() instead of pushing /baseball', () => {
      render(<DraftBoardPage />);

      const onExitDraft = mockEliteDraftBoardScreen.mock.calls[0][0]
        .onExitDraft as () => void;
      onExitDraft();

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalledWith('/baseball');
    });

    it('falls back to navigating to the Home tab when there is nothing to pop', () => {
      mockCanGoBack = false;
      render(<DraftBoardPage />);

      const onExitDraft = mockEliteDraftBoardScreen.mock.calls[0][0]
        .onExitDraft as () => void;
      onExitDraft();

      expect(mockBack).not.toHaveBeenCalled();
      expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/(home)/home');
    });
  });

  // LS-10593: league chat only fans out to sockets registered under the
  // league id, so the draft room must open and provide its own league socket
  // or useLeagueChat never connects (sends queue forever, nothing arrives).
  describe('league websocket', () => {
    it('opens a league socket with the keychain JWT and provides it to the board', async () => {
      mockParams = { leagueId: '12' };
      mockWebsocketUrl = 'wss://example.com/ws';
      mockKeychainToken = Promise.resolve('jwt-token');
      render(<DraftBoardPage />);

      await waitFor(() =>
        expect(mockLifecycle).toHaveBeenLastCalledWith({
          leagueId: 12,
          url: 'wss://example.com/ws',
          token: 'jwt-token',
        }),
      );
      expect(mockBoardSocketContext).toHaveBeenLastCalledWith({
        client: mockSocketClient,
        connected: true,
      });
    });
  });

  // LS-10593: the unread dot used to compare messages.length against a
  // baseline taken while history was still loading, so every re-entry
  // re-raised it. It now keys off a persisted last-read message id.
  describe('chat tab unread tracking', () => {
    type RenderChatTab = (props: Record<string, unknown>) => React.ReactNode;

    function renderConnector(props: {
      chatOpen?: boolean;
      onNewMessage: () => void;
    }) {
      render(<DraftBoardPage />);
      const renderChatTab = mockEliteDraftBoardScreen.mock.calls[0][0]
        .renderChatTab as RenderChatTab;
      const view = (p: typeof props) => (
        <>{renderChatTab({ leagueId: 12, userId: 1, ...p })}</>
      );
      const utils = render(view(props));
      return {
        rerender: (next: typeof props) => utils.rerender(view(next)),
      };
    }

    const history: MockChatMessage[] = [
      { id: 10, userId: 2, username: 'a', messageText: 'hi' },
      { id: 11, userId: 1, username: 'me', messageText: 'yo' },
    ];

    it('does not raise unread for already-read history on re-entry', async () => {
      mockStoredLastRead = 11;
      mockChatMessages = history;
      const onNewMessage = jest.fn();
      renderConnector({ chatOpen: false, onNewMessage });
      await act(async () => {
        await Promise.resolve();
      });

      expect(onNewMessage).not.toHaveBeenCalled();
    });

    it('raises unread once for a new message from someone else while closed', async () => {
      mockStoredLastRead = 11;
      mockChatMessages = history;
      const onNewMessage = jest.fn();
      const { rerender } = renderConnector({ chatOpen: false, onNewMessage });
      await act(async () => {
        await Promise.resolve();
      });

      mockChatMessages = [
        ...history,
        { id: 12, userId: 3, username: 'b', messageText: 'pick!' },
      ];
      rerender({ chatOpen: false, onNewMessage });
      // A fresh onNewMessage identity must not re-fire for the same message.
      const nextOnNewMessage = jest.fn();
      rerender({ chatOpen: false, onNewMessage: nextOnNewMessage });

      expect(onNewMessage).toHaveBeenCalledTimes(1);
      expect(nextOnNewMessage).not.toHaveBeenCalled();
    });

    it('ignores own and pending messages while closed', async () => {
      mockStoredLastRead = 11;
      mockChatMessages = [
        ...history,
        { id: 12, userId: 1, username: 'me', messageText: 'mine' },
        {
          id: -5,
          userId: 1,
          username: 'me',
          messageText: 'queued',
          pending: true,
        },
      ];
      const onNewMessage = jest.fn();
      renderConnector({ chatOpen: false, onNewMessage });
      await act(async () => {
        await Promise.resolve();
      });

      expect(onNewMessage).not.toHaveBeenCalled();
    });

    it('persists the newest message as read under the league key when chat is open', async () => {
      mockStoredLastRead = 5;
      mockChatMessages = history;
      const onNewMessage = jest.fn();
      renderConnector({ chatOpen: true, onNewMessage });

      await waitFor(() => expect(mockSetLastRead).toHaveBeenCalledWith(12, 11));
      expect(onNewMessage).not.toHaveBeenCalled();
    });
  });
});
