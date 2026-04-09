import { act, renderHook } from '@testing-library/react';
import { useLeagueWebSocketLifecycle } from './useLeagueWebSocketLifecycle';

jest.mock('@legacy-sports/websocket-client', () => ({
  WebSocketClient: jest.fn(),
}));

jest.mock('../config/environment', () => ({
  env: { websocketUrl: 'wss://test.example.com' },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { WebSocketClient } = jest.requireMock(
  '@legacy-sports/websocket-client',
) as unknown as { WebSocketClient: jest.Mock };

function makeMockClient() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
    }),
    connect: jest.fn(),
    dispose: jest.fn(),
    _emit(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };
}

describe('useLeagueWebSocketLifecycle', () => {
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    jest.resetAllMocks();
    mockClient = makeMockClient();
    WebSocketClient.mockImplementation(() => mockClient);
  });

  const defaultOptions = {
    leagueId: 42,
    isAuthenticated: true,
    authToken: 'test-token',
  };

  it('creates and connects a WebSocket client on mount', async () => {
    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    // Flush effects and the microtask that calls connect()
    await act(async () => {
      await Promise.resolve();
    });

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

  it('disposes the client on unmount', async () => {
    const { unmount } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(mockClient.dispose).toHaveBeenCalledTimes(1);
  });

  it('returns connected: true when the socket emits "connected"', () => {
    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    expect(result.current.connected).toBe(false);

    act(() => {
      mockClient._emit('connected');
    });

    expect(result.current.connected).toBe(true);
  });

  it('returns connected: false after the socket emits "disconnected"', () => {
    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    act(() => {
      mockClient._emit('connected');
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      mockClient._emit('disconnected');
    });
    expect(result.current.connected).toBe(false);
  });

  it('does not create a client when isAuthenticated is false', () => {
    renderHook(() =>
      useLeagueWebSocketLifecycle({
        ...defaultOptions,
        isAuthenticated: false,
      }),
    );

    expect(WebSocketClient).not.toHaveBeenCalled();
  });

  it('returns null client before the hook effect fires (no url / auth)', () => {
    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle({
        ...defaultOptions,
        isAuthenticated: false,
      }),
    );

    expect(result.current.client).toBeNull();
    expect(result.current.connected).toBe(false);
  });
});
