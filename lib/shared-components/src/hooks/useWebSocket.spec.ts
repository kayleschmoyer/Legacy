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
  setHeartbeatInterval: jest.Mock;
  reconnectNow: jest.Mock;
  updateToken: jest.Mock;
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
    setHeartbeatInterval: jest.fn(),
    reconnectNow: jest.fn(),
    updateToken: jest.fn(),
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

  it('passes draftId through to the client for the draft channel (LS-10160)', () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        draftId: 99,
        viewContext: 'draft',
      }),
    );

    expect(getConstructor()).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: 99, viewContext: 'draft' }),
    );
  });

  it('does not create client when url prop is omitted (callers must pass url)', () => {
    renderHook(() => useWebSocket({ token: 'jwt-token' }));
    expect(getConstructor()).not.toHaveBeenCalled();
  });

  // ── heartbeatMs (LS-8880) ───────────────────────────────────────────────

  it('calls client.setHeartbeatInterval when heartbeatMs is provided', () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        heartbeatMs: 15_000,
      }),
    );

    expect(mockInstance.setHeartbeatInterval).toHaveBeenCalledWith(15_000);
  });

  it('does not call client.setHeartbeatInterval when heartbeatMs is omitted', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    expect(mockInstance.setHeartbeatInterval).not.toHaveBeenCalled();
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

  it('calls onSubscriptionUpdated handler', () => {
    const onSubscriptionUpdated = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onSubscriptionUpdated,
      }),
    );

    const notification = {
      type: ClientNotificationType.SUBSCRIPTION_UPDATED,
      tier: 'free',
      status: 'past_due',
    };
    act(() =>
      mockInstance._emit(
        ClientNotificationType.SUBSCRIPTION_UPDATED,
        notification,
      ),
    );

    expect(onSubscriptionUpdated).toHaveBeenCalledWith(notification);
  });

  it('calls onTradeOffer handler', () => {
    const onTradeOffer = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onTradeOffer,
      }),
    );

    const offer = {
      leagueId: 42,
      tradeOfferId: 7,
      proposingTeamId: 1,
      receivingTeamId: 2,
    };
    act(() => mockInstance._emit(ClientNotificationType.TRADE_OFFER, offer));

    expect(onTradeOffer).toHaveBeenCalledWith(offer);
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

  // ── Reconnect (LS-5425) ─────────────────────────────────────────────────

  it('does not call onReconnect on the initial connect', () => {
    const onReconnect = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onReconnect,
      }),
    );

    act(() => mockInstance._emit('connected'));

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('calls onReconnect when the socket reconnects (connected after a prior connect)', () => {
    const onReconnect = jest.fn();
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com',
        token: 'jwt-token',
        onReconnect,
      }),
    );

    act(() => mockInstance._emit('connected')); // initial connect — no reconnect
    act(() => mockInstance._emit('connected')); // reconnect after a drop

    expect(onReconnect).toHaveBeenCalledTimes(1);
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

  it('keeps the live client and hands it a rotated token instead of recreating it (LS-6788, LS-10593)', async () => {
    const { rerender } = renderHook(
      ({ token }) => useWebSocket({ url: 'wss://example.com', token }),
      { initialProps: { token: 'jwt-token-old' } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    const instance = mockInstance;
    expect(getConstructor()).toHaveBeenCalledTimes(1);
    expect(instance.updateToken).not.toHaveBeenCalled();

    rerender({ token: 'jwt-token-new' });

    await act(async () => {
      await Promise.resolve();
    });

    // Recreating the client on every background JWT rotation tore down a
    // live draft socket; the client only reads the token at connect time,
    // so updating it is enough for the next (re)connect to use it.
    expect(instance.dispose).not.toHaveBeenCalled();
    expect(getConstructor()).toHaveBeenCalledTimes(1);
    expect(instance.updateToken).toHaveBeenCalledWith('jwt-token-new');
    // Revives a client that stopped retrying on the old, expired token
    // (a no-op on a live socket — see WebSocketClient.reconnectNow).
    expect(instance.reconnectNow).toHaveBeenCalledTimes(1);
  });

  it('tears the client down when the token goes away (sign-out)', () => {
    const initialProps: { token: string | undefined } = { token: 'jwt-token' };
    const { rerender } = renderHook(
      ({ token }) => useWebSocket({ url: 'wss://example.com', token }),
      { initialProps },
    );

    const instance = mockInstance;
    rerender({ token: undefined });

    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports connected=false when the client is replaced so consumers see a fresh connect edge (LS-10593)', () => {
    const { result, rerender } = renderHook(
      ({ draftId }) =>
        useWebSocket({ url: 'wss://example.com', token: 'jwt', draftId }),
      { initialProps: { draftId: 1 } },
    );

    act(() => mockInstance._emit('connected'));
    expect(result.current.connected).toBe(true);

    // The old client's handlers are unsubscribed before it is disposed, so
    // its 'disconnected' never reaches the hook — the cleanup must reset it.
    rerender({ draftId: 2 });
    expect(result.current.connected).toBe(false);

    act(() => mockInstance._emit('connected'));
    expect(result.current.connected).toBe(true);
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

  it('reconnectNow() forwards to client.reconnectNow() (LS-10593)', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    act(() => result.current.reconnectNow());

    expect(mockInstance.reconnectNow).toHaveBeenCalledTimes(1);
  });

  it('updateContext() forwards to client.updateContext()', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    const ctx = { matchupId: 99, viewContext: 'matchup' as const };
    act(() => result.current.updateContext(ctx));

    expect(mockInstance.updateContext).toHaveBeenCalledWith(ctx);
  });

  // ── Recovery after exhausted reconnect budget (LS-9192) ─────────────────

  it('calls client.reconnectNow() when the browser regains network connectivity', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(mockInstance.reconnectNow).toHaveBeenCalledTimes(1);
  });

  it('removes the online listener on unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    unmount();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(mockInstance.reconnectNow).not.toHaveBeenCalled();
  });

  // ── Recovery after exhausted reconnect budget (LS-9220) ─────────────────

  it('calls client.reconnectNow() when the tab becomes visible again', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockInstance.reconnectNow).toHaveBeenCalledTimes(1);
  });

  it('does not call reconnectNow when the tab is backgrounded', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockInstance.reconnectNow).not.toHaveBeenCalled();
  });

  it('removes the visibilitychange listener on unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com', token: 'jwt-token' }),
    );

    unmount();
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockInstance.reconnectNow).not.toHaveBeenCalled();
  });
});
