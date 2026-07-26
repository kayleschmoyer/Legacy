import { act, renderHook } from '@testing-library/react';
import { useLeagueWebSocketLifecycle } from './useLeagueWebSocketLifecycle';

jest.mock('@legacy-sports/websocket-client', () => ({
  WebSocketClient: jest.fn(),
}));

// The factory must be a pure literal — `jest.mock` is hoisted above module
// scope, so referencing an outer `const` from inside it hits a TDZ error.
// We grab the same `env` object reference back via `jest.requireMock` and
// mutate it per-test. The hook reads `env.websocketUrl` at effect-run time
// (not module-load time), so flipping `websocketUrl` before rendering (e.g.
// to '' for the disabled path) is observed by the hook. `beforeEach` resets
// it to the default connected URL.
jest.mock('../config/environment', () => ({
  env: { websocketUrl: 'wss://test.example.com' },
}));

const mockEnv: { websocketUrl: string } = jest.requireMock(
  '../config/environment',
).env;

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
    updateToken: jest.fn(),
    _emit(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };
}

describe('useLeagueWebSocketLifecycle', () => {
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    jest.resetAllMocks();
    mockEnv.websocketUrl = 'wss://test.example.com';
    mockClient = makeMockClient();
    WebSocketClient.mockImplementation(() => mockClient);
  });

  const defaultOptions = {
    leagueId: 42,
    isAuthenticated: true,
    authToken: 'test-token',
  };

  it('creates and connects a WebSocket client on mount', () => {
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

  // No-reconnect-on-token-refresh: authToken is read via a ref, not the
  // effect's dependency array, so a token rotation (e.g. the async JWT
  // refresh that resolves shortly after mount) must NOT tear down and
  // recreate the live connection — doing so raced e2e tests that sent a
  // simulated server event against a connection that was about to be
  // disposed (LS-7856). The client is instead told about the new token via
  // `updateToken` so future (re)connects pick it up.
  it('does not recreate the client when only authToken changes, but does update its token', () => {
    const { rerender } = renderHook(
      (props: typeof defaultOptions) => useLeagueWebSocketLifecycle(props),
      { initialProps: defaultOptions },
    );

    expect(WebSocketClient).toHaveBeenCalledTimes(1);
    expect(WebSocketClient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ token: 'test-token' }),
    );
    expect(mockClient.connect).toHaveBeenCalledTimes(1);

    rerender({ ...defaultOptions, authToken: 'rotated-token' });

    expect(mockClient.dispose).not.toHaveBeenCalled();
    expect(WebSocketClient).toHaveBeenCalledTimes(1);
    expect(mockClient.updateToken).toHaveBeenCalledWith('rotated-token');
  });

  // Recreate-on-identity-change: leagueId/isAuthenticated changes still
  // represent a real change of context, so the client must be torn down and
  // recreated for those (only the authToken-alone case is exempted above).
  it('disposes the old client and creates + connects a new one when leagueId changes', () => {
    const firstClient = mockClient;

    const { rerender } = renderHook(
      (props: typeof defaultOptions) => useLeagueWebSocketLifecycle(props),
      { initialProps: defaultOptions },
    );

    expect(WebSocketClient).toHaveBeenCalledTimes(1);

    const secondClient = makeMockClient();
    WebSocketClient.mockImplementation(() => secondClient);

    rerender({ ...defaultOptions, leagueId: 99 });

    expect(firstClient.dispose).toHaveBeenCalledTimes(1);
    expect(WebSocketClient).toHaveBeenCalledTimes(2);
    expect(WebSocketClient).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ leagueId: 99 }),
    );
    expect(secondClient.connect).toHaveBeenCalledTimes(1);
  });

  // Recreate-on-identity-change: same as above, but for isAuthenticated.
  it('disposes the old client and creates + connects a new one when isAuthenticated changes', () => {
    const firstClient = mockClient;

    const { rerender } = renderHook(
      (props: typeof defaultOptions) => useLeagueWebSocketLifecycle(props),
      { initialProps: defaultOptions },
    );

    expect(WebSocketClient).toHaveBeenCalledTimes(1);

    const secondClient = makeMockClient();
    WebSocketClient.mockImplementation(() => secondClient);

    rerender({ ...defaultOptions, isAuthenticated: false });

    expect(firstClient.dispose).toHaveBeenCalledTimes(1);
    // isAuthenticated: false means the effect returns early — no new client.
    expect(WebSocketClient).toHaveBeenCalledTimes(1);
  });

  // Disabled/misconfigured URL: when env.websocketUrl is empty the effect
  // returns early — no client is constructed and `connected` stays false even
  // though the user is authenticated. See LS-7625 (GAP-001).
  it('does not create a client and stays disconnected when websocketUrl is empty (even when authenticated)', () => {
    mockEnv.websocketUrl = '';

    const { result } = renderHook(() =>
      useLeagueWebSocketLifecycle(defaultOptions),
    );

    expect(WebSocketClient).not.toHaveBeenCalled();
    expect(result.current.client).toBeNull();
    expect(result.current.connected).toBe(false);
  });
});
