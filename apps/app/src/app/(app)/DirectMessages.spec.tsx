import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { ConversationThread } from './DirectMessages';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    cb();
  },
}));

jest.mock('../../common/auth/AuthorizedUserContext', () => ({
  useAuthorizedUserInfo: () => ({ id: 1 }),
}));

const mockReadKeychainValue = jest.fn();
jest.mock('../../common/auth/AuthHooks', () => ({
  readKeychainValue: (...args: unknown[]): unknown =>
    mockReadKeychainValue(...args),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

let mockWebsocketUrl: string | undefined = 'wss://example.com';
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return { websocketUrl: mockWebsocketUrl };
  },
}));

// See useSubscription.spec.ts for why ClientNotificationType is pulled from
// its canonical source instead of the jest-mapped native barrel.
jest.mock('@legacy-sports/utils', () => ({
  ClientNotificationType: jest.requireActual<
    typeof import('../../../../../lib/utils/src/lib/notification-types')
  >('../../../../../lib/utils/src/lib/notification-types')
    .ClientNotificationType,
}));

const mockRefetch = jest.fn().mockResolvedValue(undefined);
const mockSendMessage = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetDirectMessagesQuery: jest.fn(() => ({
    data: { getDirectMessages: [] },
    loading: false,
    refetch: mockRefetch,
  })),
  useSendDirectMessageMutation: jest.fn(() => [
    mockSendMessage,
    { loading: false },
  ]),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn() },
}));

const mockCaptureError = jest.fn();
jest.mock('@legacy-sports/rollbar/native', () => ({
  captureError: (...args: unknown[]): unknown => mockCaptureError(...args),
}));

// Capture constructor options and per-event handlers so tests can assert
// connection params and simulate an incoming DIRECT_MESSAGE notification.
let mockCtorOpts: Record<string, unknown> | null = null;
const mockRegisteredHandlers = new Map<string, (n: unknown) => void>();
const mockClientDispose = jest.fn();
jest.mock('@legacy-sports/websocket-client', () => ({
  WebSocketClient: class {
    constructor(opts: Record<string, unknown>) {
      mockCtorOpts = opts;
    }
    on(type: string, handler: (n: unknown) => void): () => void {
      mockRegisteredHandlers.set(type, handler);
      return () => undefined;
    }
    dispose(): void {
      mockClientDispose();
    }
  },
}));

type RNComponents = { View: typeof RNView; Text: typeof RNText };
jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    createTokens: (tokens: unknown) => tokens,
    Card: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    Input: () => <View testID="message-input" />,
    Spinner: () => <View testID="spinner" />,
    Text: ({ children }: { children?: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    XStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
    YStack: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  MessageSquare: () => null,
  Send: () => null,
  Users: () => null,
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Button: ({ children }: { children?: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

/** Invoke the handler the component registered for a given notification type. */
function emitNotification(type: string, payload: Record<string, unknown>) {
  const handler = mockRegisteredHandlers.get(type);
  if (!handler) throw new Error(`No handler registered for ${type}`);
  handler({ type, ...payload });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConversationThread — WebSocket live-append (LS-6000)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCtorOpts = null;
    mockRegisteredHandlers.clear();
    mockReadKeychainValue.mockResolvedValue('mock-token');
    mockWebsocketUrl = 'wss://example.com';
  });

  it('AC: connects with viewContext "dm" once a token is available', async () => {
    render(
      <ConversationThread
        otherUserId={2}
        otherRecipientName="Bob"
        leagueId={5}
      />,
    );

    await waitFor(() => expect(mockCtorOpts).not.toBeNull());
    expect(mockCtorOpts).toMatchObject({
      url: 'wss://example.com',
      token: 'mock-token',
      viewContext: 'dm',
      autoConnect: true,
      reconnect: true,
    });
  });

  it('AC: refetches the thread when a DIRECT_MESSAGE from the other party arrives', async () => {
    render(
      <ConversationThread
        otherUserId={2}
        otherRecipientName="Bob"
        leagueId={5}
      />,
    );

    await waitFor(() =>
      expect(mockRegisteredHandlers.has('direct-message')).toBe(true),
    );
    mockRefetch.mockClear();

    emitNotification('direct-message', {
      messageId: 99,
      fromUserId: 2,
      fromUsername: 'Bob',
      toUserId: 1,
      leagueId: 5,
      messageText: 'hi',
      createdAt: new Date().toISOString(),
    });

    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
  });

  it('ignores DIRECT_MESSAGE notifications for a different conversation', async () => {
    render(
      <ConversationThread
        otherUserId={2}
        otherRecipientName="Bob"
        leagueId={5}
      />,
    );

    await waitFor(() =>
      expect(mockRegisteredHandlers.has('direct-message')).toBe(true),
    );
    mockRefetch.mockClear();

    emitNotification('direct-message', {
      messageId: 100,
      fromUserId: 3,
      fromUsername: 'Someone Else',
      toUserId: 1,
      leagueId: 5,
      messageText: 'hi',
      createdAt: new Date().toISOString(),
    });

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('disposes the socket on unmount', async () => {
    const { unmount } = render(
      <ConversationThread
        otherUserId={2}
        otherRecipientName="Bob"
        leagueId={5}
      />,
    );

    await waitFor(() => expect(mockCtorOpts).not.toBeNull());
    unmount();

    expect(mockClientDispose).toHaveBeenCalledTimes(1);
  });

  it('does not connect when no token is available', async () => {
    mockReadKeychainValue.mockResolvedValue(null);

    render(
      <ConversationThread
        otherUserId={2}
        otherRecipientName="Bob"
        leagueId={5}
      />,
    );

    await waitFor(() => expect(mockReadKeychainValue).toHaveBeenCalled());
    expect(mockCtorOpts).toBeNull();
  });
});
