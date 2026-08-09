import { act, renderHook } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { useLeagueWebSocketLifecycle } from './useLeagueWebSocketLifecycle';

jest.mock('@legacy-sports/websocket-client', () => ({
  WebSocketClient: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useIsFocused: jest.fn(() => true),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type AppStateChangeHandler = (state: string) => void;
let appStateListeners: AppStateChangeHandler[] = [];
const mockAppStateAddEventListener = jest.fn<
  { remove: () => void },
  [string, AppStateChangeHandler]
>();

jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return new Proxy(RN, {
    get(target, prop: string) {
      if (prop === 'AppState') {
        return {
          addEventListener: (...args: [string, AppStateChangeHandler]) =>
            mockAppStateAddEventListener(...args),
        };
      }
      return Reflect.get(target, prop) as unknown;
    },
  });
});

const { WebSocketClient } = jest.requireMock(
  '@legacy-sports/websocket-client',
) as unknown as { WebSocketClient: jest.Mock };

const mockUseIsFocused = useIsFocused as jest.MockedFunction<
  typeof useIsFocused
>;

function makeMockClient() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    }),
    connect: jest.fn(),
    dispose: jest.fn(),
    reconnectNow: jest.fn(),
    _emit(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };
}

describe('useLeagueWebSocketLifecycle', () => {
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    jest.resetAllMocks();
    appStateListeners = [];
    mockAppStateAddEventListener.mockImplementation(
      (_event: string, handler: AppStateChangeHandler) => {
        appStateListeners.push(handler);
        return {
          remove: () => {
            appStateListeners = appStateListeners.filter((h) => h !== handler);
          },
        };
      },
    );
    mockUseIsFocused.mockReturnValue(true);
    mockClient = makeMockClient();
    WebSocketClient.mockImplementation(() => mockClient);
  });

  const defaultOptions = {
    leagueId: 42,
    url: 'wss://test.example.com',
    token: 'test-token',
  };

  it('creates and connects a WebSocket client on mount when focused', () => {
    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    expect(WebSocketClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'wss://test.example.com',
        leagueId: 42,
        token: 'test-token',
        autoConnect: false,
      }),
    );
    expect(result.current.client).toBe(mockClient);
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
  });

  it('does not create a client when the screen is not focused', () => {
    mockUseIsFocused.mockReturnValue(false);

    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    expect(WebSocketClient).not.toHaveBeenCalled();
    expect(result.current.client).toBeNull();
  });

  // LS-6356: React Navigation's native stack keeps a prior league screen
  // mounted (for the back gesture) when a second league screen is pushed on
  // top of it. Without gating on focus, both screens' sockets would stay
  // open indefinitely — this is the "both LeagueWebSocketContext instances
  // remain mounted ... listening to both channels indefinitely" leak.
  it('disposes the client when the screen loses focus (backgrounded by navigation stack)', () => {
    const { rerender } = renderHook(
      (props: typeof defaultOptions) => useLeagueWebSocketLifecycle(props),
      { initialProps: defaultOptions },
    );

    expect(mockClient.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.dispose).not.toHaveBeenCalled();

    mockUseIsFocused.mockReturnValue(false);
    rerender(defaultOptions);

    expect(mockClient.dispose).toHaveBeenCalledTimes(1);
  });

  it('reconnects with a fresh client when the screen regains focus', () => {
    mockUseIsFocused.mockReturnValue(false);
    const { rerender } = renderHook(
      (props: typeof defaultOptions) => useLeagueWebSocketLifecycle(props),
      { initialProps: defaultOptions },
    );

    expect(WebSocketClient).not.toHaveBeenCalled();

    const secondClient = makeMockClient();
    WebSocketClient.mockImplementation(() => secondClient);
    mockUseIsFocused.mockReturnValue(true);
    rerender(defaultOptions);

    expect(WebSocketClient).toHaveBeenCalledTimes(1);
    expect(secondClient.connect).toHaveBeenCalledTimes(1);
  });

  it('calls reconnectNow when the app returns to the foreground (LS-8985)', () => {
    renderHook(() => useLeagueWebSocketLifecycle(defaultOptions));

    expect(appStateListeners).toHaveLength(1);

    void act(() => {
      appStateListeners[0]('active');
    });

    expect(mockClient.reconnectNow).toHaveBeenCalledTimes(1);
  });

  it('does not call reconnectNow for a background transition', () => {
    renderHook(() => useLeagueWebSocketLifecycle(defaultOptions));

    void act(() => {
      appStateListeners[0]('background');
    });

    expect(mockClient.reconnectNow).not.toHaveBeenCalled();
  });

  it('removes the AppState subscription on unmount', () => {
    const { unmount } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    expect(appStateListeners).toHaveLength(1);

    unmount();

    expect(appStateListeners).toHaveLength(0);
  });

  it('disposes the client on unmount', () => {
    const { unmount } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    unmount();

    expect(mockClient.dispose).toHaveBeenCalledTimes(1);
  });

  it('returns connected: true when the socket emits "connected"', () => {
    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    expect(result.current.connected).toBe(false);

    void act(() => {
      mockClient._emit('connected');
    });

    expect(result.current.connected).toBe(true);
  });

  it('does not create a client when leagueId is undefined', () => {
    renderHook(() =>
      useLeagueWebSocketLifecycle({ ...defaultOptions, leagueId: undefined }),
    );

    expect(WebSocketClient).not.toHaveBeenCalled();
  });

  it('does not create a client when url or token is missing', () => {
    renderHook(() =>
      useLeagueWebSocketLifecycle({ ...defaultOptions, token: undefined }),
    );

    expect(WebSocketClient).not.toHaveBeenCalled();
  });
});
