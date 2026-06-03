import { act, renderHook } from '@testing-library/react';
import { ClientNotificationType } from '@legacy-sports/utils';
import { useWebSocket } from './useWebSocket';

// ─── Mock WebSocketClient ────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

interface MockWSClient {
  on: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  send: jest.Mock;
  updateContext: jest.Mock;
  dispose: jest.Mock;
  _handlers: Map<string, EventHandler[]>;
  _emit: (event: string, ...args: unknown[]) => void;
}

let mockInstance: MockWSClient;

function mockCreateInstance(): MockWSClient {
  const handlers = new Map<string, EventHandler[]>();
  return {
    on: jest.fn((event: string, handler: EventHandler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      const list = handlers.get(event);
      if (list) list.push(handler);
      return jest.fn(() => {
        const list = handlers.get(event);
        if (list) {
          const idx = list.indexOf(handler);
          if (idx >= 0) list.splice(idx, 1);
        }
      });
    }),
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
    updateContext: jest.fn(),
    dispose: jest.fn(),
    _handlers: handlers,
    _emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((h) => h(...args));
    },
  };
}

jest.mock('@legacy-sports/websocket-client', () => ({
  WebSocketClient: jest.fn().mockImplementation(() => {
    mockInstance = mockCreateInstance();
    return mockInstance;
  }),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useWebSocket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function getConstructor(): jest.Mock {
    return jest.requireMock<{ WebSocketClient: jest.Mock }>(
      '@legacy-sports/websocket-client',
    ).WebSocketClient;
  }

  // ── Default / missing config ────────────────────────────────────────────

  it('returns default state when called with no arguments', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe('WebSocket URL not configured');
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.updateContext).toBe('function');
  });

  it('sets error when url prop is not provided', () => {
    const { result } = renderHook(() => useWebSocket({}));
    expect(result.current.error).toBe('WebSocket URL not configured');
  });

  it('does not create client when token is missing', () => {
    renderHook(() => useWebSocket({ url: 'wss://example.com' }));
    expect(getConstructor()).not.toHaveBeenCalled();
  });

  // ── Client creation ─────────────────────────────────────────────────────

  it('creates client with correct options', () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        leagueId: 42,
        matchupId: 7,
        viewContext: 'league',
      }),
    );

    expect(getConstructor()).toHaveBeenCalledWith({
      url: 'wss://example.com',
      token: 'jwt-token',
      leagueId: 42,
      matchupId: 7,
      viewContext: 'league',
      autoConnect: false,
    });
  });

  it('does not create client when url prop is omitted (callers must pass url)', () => {
    renderHook(() => useWebSocket({ token: 'jwt-token' }));
    expect(getConstructor()).not.toHaveBeenCalled();
  });

  // ── Auto-connect ────────────────────────────────────────────────────────

  it('auto-connects via microtask when autoConnect defaults to true', async () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockInstance.connect).toHaveBeenCalledTimes(1);
  });

  it('does not auto-connect when autoConnect is false', async () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        autoConnect: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockInstance.connect).not.toHaveBeenCalled();
  });

  it('cancels deferred connect on immediate unmount (Strict Mode safety)', async () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    const instance = mockInstance;
    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(instance.connect).not.toHaveBeenCalled();
  });

  // ── Connection events ───────────────────────────────────────────────────

  it('sets connected=true when "connected" event fires', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    act(() => mockInstance._emit('connected'));

    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets connected=false when "disconnected" event fires', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    act(() => mockInstance._emit('connected'));
    expect(result.current.connected).toBe(true);

    act(() => mockInstance._emit('disconnected'));
    expect(result.current.connected).toBe(false);
  });

  it('sets error and calls onError when "error" event fires', () => {
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onError,
      }),
    );

    const err = new Error('connection failed');
    act(() => mockInstance._emit('error', err));

    expect(result.current.error).toBe('connection failed');
    expect(onError).toHaveBeenCalledWith(err);
  });

  // ── Message / notification callbacks ────────────────────────────────────

  it('calls onMessage when "message" event fires', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onMessage,
      }),
    );

    const msg = { type: 'test', data: {} };
    act(() => mockInstance._emit('message', msg));

    expect(onMessage).toHaveBeenCalledWith(msg);
  });

  it('calls onDraftCompleted handler', () => {
    const onDraftCompleted = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onDraftCompleted,
      }),
    );

    const notification = { leagueId: 42, draftId: 'draft-1' };
    act(() =>
      mockInstance._emit(ClientNotificationType.DRAFT_COMPLETED, notification),
    );

    expect(onDraftCompleted).toHaveBeenCalledWith(notification);
  });

  it('calls onDraftPickMade handler', () => {
    const onDraftPickMade = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onDraftPickMade,
      }),
    );

    const pick = { playerId: 'p1', teamId: 't1', round: 1, pick: 3 };
    act(() => mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, pick));

    expect(onDraftPickMade).toHaveBeenCalledWith(pick);
  });

  it('calls onRosterUpdate handler', () => {
    const onRosterUpdate = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onRosterUpdate,
      }),
    );

    const update = { leagueId: 42, teamId: 't1' };
    act(() => mockInstance._emit(ClientNotificationType.ROSTER_UPDATE, update));

    expect(onRosterUpdate).toHaveBeenCalledWith(update);
  });

  it('calls onUserJoined handler', () => {
    const onUserJoined = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onUserJoined,
      }),
    );

    const user = { userId: 'u1', displayName: 'Alice' };
    act(() => mockInstance._emit(ClientNotificationType.USER_JOINED, user));

    expect(onUserJoined).toHaveBeenCalledWith(user);
  });

  // ── Ref-stable callbacks (no client teardown) ──────────────────────────

  it('uses latest callback ref without recreating client', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useWebSocket({
          url: 'wss://example.com',
          token: 'jwt-token',
          onDraftCompleted: cb,
        }),
      { initialProps: { cb: handler1 } },
    );

    const callCount = getConstructor().mock.calls.length;
    rerender({ cb: handler2 });

    // Client must NOT be recreated when only callbacks change
    expect(getConstructor()).toHaveBeenCalledTimes(callCount);

    const notification = { leagueId: 42 };
    act(() =>
      mockInstance._emit(ClientNotificationType.DRAFT_COMPLETED, notification),
    );

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledWith(notification);
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────

  it('disposes client on unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    const instance = mockInstance;
    unmount();

    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });

  // ── Forwarding methods ──────────────────────────────────────────────────

  it('connect() forwards to client.connect()', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        autoConnect: false,
      }),
    );

    act(() => result.current.connect());

    expect(mockInstance.connect).toHaveBeenCalled();
  });

  it('disconnect() forwards to client.disconnect()', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    act(() => result.current.disconnect());

    expect(mockInstance.disconnect).toHaveBeenCalled();
  });

  it('sendMessage() forwards to client.send()', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    const data = { action: 'join', roomId: '123' };
    act(() => result.current.sendMessage(data));

    expect(mockInstance.send).toHaveBeenCalledWith(data);
  });

  it('updateContext() forwards to client.updateContext()', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    const ctx = { matchupId: 99, viewContext: 'matchup' as const };
    act(() => result.current.updateContext(ctx));

    expect(mockInstance.updateContext).toHaveBeenCalledWith(ctx);
  });
});
