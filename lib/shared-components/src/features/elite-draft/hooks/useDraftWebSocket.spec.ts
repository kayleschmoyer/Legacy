/**
 * useDraftWebSocket — focused regression tests for LS-3823
 *
 * Verifies that the "Draft Complete!" banner becomes visible after draft
 * completion even when the last-pick WS event is missed (e.g. transient
 * WebSocket disconnect), by ensuring handleDraftCompleted calls refetchDraft()
 * so the Apollo cache is hydrated with draftCompletedAt.
 */

import { act, renderHook } from '@testing-library/react';
import { LOGGER } from '@legacy-sports/logging';
import { ClientNotificationType } from '@legacy-sports/utils';
import { useDraftWebSocket } from './useDraftWebSocket';

// ── WebSocketClient mock ───────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

interface MockWSClient {
  on: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  send: jest.Mock;
  updateContext: jest.Mock;
  setHeartbeatInterval: jest.Mock;
  dispose: jest.Mock;
  _handlers: Map<string, EventHandler[]>;
  _emit: (event: string, ...args: unknown[]) => void;
}

let mockInstance: MockWSClient;

function mockMakeWSClient(): MockWSClient {
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
    dispose: jest.fn(),
    _handlers: handlers,
    _emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((h) => h(...args));
    },
  };
}

jest.mock('@legacy-sports/websocket-client', () => ({
  WebSocketClient: jest.fn().mockImplementation(() => {
    mockInstance = mockMakeWSClient();
    return mockInstance;
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDefaultParams() {
  return {
    leagueId: 1,
    draftId: 42,
    isAuthenticated: true,
    isAuctionDraft: false,
    myTeamId: 10,
    enrichedPlayers: [],
    statsLookup: new Map(),
    teamNameById: jest.fn(() => 'Team A'),
    notifiedPicksRef: { current: new Set<number>() },
    showAnnouncement: jest.fn(),
    showToast: jest.fn(),
    setDraftComplete: jest.fn(),
    setDraftPaused: jest.fn(),
    setPickDeadline: jest.fn(),
    setPickTimeLimitSeconds: jest.fn(),
    setLiveMessage: jest.fn(),
    setOnlineUserIds: jest.fn(),
    refetchDraft: jest.fn().mockResolvedValue(undefined),
    refetchLeague: jest.fn().mockResolvedValue(undefined),
    refetchCurrentPick: jest.fn().mockResolvedValue(undefined),
    refetchPickHistory: jest.fn().mockResolvedValue(undefined),
    refetchAvailablePlayers: jest.fn().mockResolvedValue(undefined),
    refetchQueue: jest.fn().mockResolvedValue(undefined),
    refetchAutoPickStatuses: jest.fn().mockResolvedValue(undefined),
    websocketUrl: 'wss://test.example.com',
    token: 'test-token',
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useDraftWebSocket — draft completion (LS-3823)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls setDraftComplete(true) and refetchDraft when DraftCompleted event fires', () => {
    const params = makeDefaultParams();

    renderHook(() => useDraftWebSocket(params));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_COMPLETED, {
        leagueId: 1,
        selectionMethod: 'standard',
      });
    });

    expect(params.setDraftComplete).toHaveBeenCalledWith(true);
    // refetchDraft must be called so draftCompletedAt is persisted in the
    // Apollo cache — without it the banner only shows via the in-memory
    // draftComplete flag and disappears on component re-mount / page reload
    // unless the user manually refreshes (LS-3823).
    expect(params.refetchDraft).toHaveBeenCalled();
  });

  it('calls refetchLeague when DraftCompleted event fires', () => {
    const params = makeDefaultParams();

    renderHook(() => useDraftWebSocket(params));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_COMPLETED, {
        leagueId: 1,
        selectionMethod: 'standard',
      });
    });

    expect(params.refetchLeague).toHaveBeenCalled();
  });

  it('calls setDraftComplete(true) when last pick notification has no nextPick', () => {
    const params = makeDefaultParams();

    // setDraftComplete(true) is called synchronously before the debounce timer,
    // so no real setTimeout wait is needed. Use fake timers to silence the pending
    // debounce without slowing the test suite.
    jest.useFakeTimers();

    renderHook(() => useDraftWebSocket(params));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, {
        draftId: 42,
        pickId: 104,
        teamId: 10,
        playerId: 999,
        round: 26,
        pickNumber: 4,
        overallPick: 104,
        // nextPick intentionally omitted — signals draft is complete
        wasAutoPick: false,
        currentPickDeadline: null,
      });
    });

    expect(params.setDraftComplete).toHaveBeenCalledWith(true);

    jest.useRealTimers();
  });
});

// ── Paused draft must never render as complete (LS-8849) ───────────────────

/**
 * pauseDraft only succeeds when league.draftStatus is 'in-progress' (see
 * pause-resume-draft.ts), so a DraftPaused WS event is server proof the draft
 * is not complete. Before this fix, `draftComplete` was a one-way ratchet:
 * once set true by a stale/misrouted DraftCompleted or missing-nextPick
 * DraftPickMade event, nothing ever cleared it — a subsequent, legitimate
 * DraftPaused event left the draft room permanently stuck on the
 * "Draft Complete!" banner instead of the paused overlay.
 */
describe('useDraftWebSocket — paused draft resets stale completion state (LS-8849)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls setDraftComplete(false) when DraftPaused fires', () => {
    const params = makeDefaultParams();

    renderHook(() => useDraftWebSocket(params));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PAUSED, {
        leagueId: 1,
        pausedAt: '2026-07-31T01:13:53.000Z',
      });
    });

    expect(params.setDraftPaused).toHaveBeenCalledWith(true);
    expect(params.setDraftComplete).toHaveBeenCalledWith(false);
  });

  it('clears a previously-latched draftComplete=true when the draft is paused', () => {
    const params = makeDefaultParams();
    jest.useFakeTimers();

    renderHook(() => useDraftWebSocket(params));

    // A stale/misrouted "no nextPick" pick notification latches draftComplete.
    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, {
        draftId: 42,
        pickId: 104,
        teamId: 10,
        playerId: 999,
        round: 26,
        pickNumber: 4,
        overallPick: 104,
        wasAutoPick: false,
        currentPickDeadline: null,
      });
    });
    expect(params.setDraftComplete).toHaveBeenLastCalledWith(true);

    // The commissioner then pauses — the server-confirmed event must win.
    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PAUSED, {
        leagueId: 1,
      });
    });
    expect(params.setDraftComplete).toHaveBeenLastCalledWith(false);

    jest.useRealTimers();
  });
});

// ── Pick announcements for players outside the local lookup (LS-8845) ──────

describe('useDraftWebSocket — pick announcement fallback (LS-8845)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('still announces a pick when the player is absent from enrichedPlayers and statsLookup', () => {
    const params = makeDefaultParams();

    renderHook(() => useDraftWebSocket(params));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, {
        draftId: 42,
        pickId: 201,
        teamId: 2,
        playerId: 555,
        round: 1,
        pickNumber: 2,
        overallPick: 2,
        wasAutoPick: false,
        autoPickReason: null,
        currentPickDeadline: null,
        nextPick: {
          teamId: 3,
          round: 1,
          pickNumber: 3,
          overallPick: 3,
        },
      });
    });

    // The lookup misses (enrichedPlayers and statsLookup are both empty in
    // makeDefaultParams), but the announcement must still fire — dropping it
    // silently is exactly the bug this test guards against.
    expect(params.showAnnouncement).toHaveBeenCalledTimes(1);
    expect(params.showAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ id: 555 }),
      2,
      1,
      2,
      false,
      false,
      expect.any(String),
    );
  });
});

// ── Draft Room v2 toast/splash queue wiring (LS-9402) ──────────────────────

describe('useDraftWebSocket — pick toast/splash queue wiring (LS-9402)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues a splash (not a toast) for my own team pick', () => {
    const params = {
      ...makeDefaultParams(),
      enqueuePickToast: jest.fn(),
      enqueuePickSplash: jest.fn(),
    };

    renderHook(() => useDraftWebSocket(params));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, {
        draftId: 42,
        pickId: 301,
        teamId: 10, // matches makeDefaultParams()'s myTeamId
        playerId: 700,
        round: 1,
        pickNumber: 3,
        overallPick: 3,
        wasAutoPick: false,
        autoPickReason: null,
        currentPickDeadline: null,
        nextPick: { teamId: 11, round: 1, pickNumber: 4, overallPick: 4 },
      });
    });

    expect(params.enqueuePickSplash).toHaveBeenCalledTimes(1);
    expect(params.enqueuePickSplash).toHaveBeenCalledWith(
      expect.objectContaining({
        pickNumber: 3,
        round: 1,
        roundPickNumber: 3,
      }),
    );
    expect(params.enqueuePickToast).not.toHaveBeenCalled();
  });

  it('enqueues a toast (not a splash) for another team pick, marking auto-picks', () => {
    const params = {
      ...makeDefaultParams(),
      enqueuePickToast: jest.fn(),
      enqueuePickSplash: jest.fn(),
    };

    renderHook(() => useDraftWebSocket(params));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, {
        draftId: 42,
        pickId: 302,
        teamId: 11, // not myTeamId (10)
        playerId: 701,
        round: 1,
        pickNumber: 4,
        overallPick: 4,
        wasAutoPick: true,
        autoPickReason: 'timer_expired',
        currentPickDeadline: null,
        nextPick: { teamId: 12, round: 1, pickNumber: 5, overallPick: 5 },
      });
    });

    expect(params.enqueuePickToast).toHaveBeenCalledTimes(1);
    expect(params.enqueuePickToast).toHaveBeenCalledWith(
      expect.objectContaining({
        pickNumber: 4,
        round: 1,
        roundPickNumber: 4,
        isAuto: true,
        teamName: 'Team A', // makeDefaultParams()'s teamNameById() stub
      }),
    );
    expect(params.enqueuePickSplash).not.toHaveBeenCalled();
  });

  it('does not throw when enqueuePickToast/enqueuePickSplash are omitted (e.g. the spectator screen)', () => {
    const params = makeDefaultParams();

    renderHook(() => useDraftWebSocket(params));

    expect(() => {
      act(() => {
        mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, {
          draftId: 42,
          pickId: 303,
          teamId: 2,
          playerId: 702,
          round: 1,
          pickNumber: 5,
          overallPick: 5,
          wasAutoPick: false,
          autoPickReason: null,
          currentPickDeadline: null,
          nextPick: { teamId: 3, round: 1, pickNumber: 6, overallPick: 6 },
        });
      });
    }).not.toThrow();
  });
});

// ── Reconnect recovery (LS-8506) ───────────────────────────────────────────

/**
 * Rollbar item 194: `Failed to refetch available players after websocket
 * reconnect` was logged with `String(e)`, flattening an `AbortError` (Apollo
 * cancelling an in-flight query on navigation) into a bare string. That
 * destroyed the underlying cause and bypassed the AbortError noise filter in
 * lib/rollbar, so a benign cancellation surfaced as a production error — and a
 * genuine failure would have been just as undiagnosable, retried zero times,
 * and invisible to the user staring at a stale player list.
 */
describe('useDraftWebSocket — reconnect refetch recovery (LS-8506)', () => {
  /** Drives the WS through connect -> drop -> reconnect. */
  function reconnect() {
    act(() => mockInstance._emit('connected'));
    act(() => mockInstance._emit('disconnected'));
    act(() => mockInstance._emit('connected'));
  }

  /** Flushes the backoff waits between retry attempts. */
  async function flushBackoff() {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
  }

  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    errorSpy = jest.spyOn(LOGGER, 'error').mockImplementation(() => undefined);
    debugSpy = jest.spyOn(LOGGER, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    debugSpy.mockRestore();
    jest.useRealTimers();
  });

  it('does not fire recovery refetches on the initial connect', () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    act(() => mockInstance._emit('connected'));

    // The initial page-load queries already fetched this data — recovering on
    // the first connect is a duplicate round-trip, and it mislabels itself as
    // reconnect recovery in any error it logs.
    expect(params.refetchAvailablePlayers).not.toHaveBeenCalled();
  });

  it('refetches available players on a genuine reconnect', async () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    reconnect();
    await flushBackoff();

    expect(params.refetchAvailablePlayers).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(params.showToast).not.toHaveBeenCalled();
  });

  it('refetches the draft queue on a genuine reconnect (LS-6787)', async () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    reconnect();
    await flushBackoff();

    // The queue is the server's first auto-pick source: without this refetch
    // the rail keeps showing players the queue already auto-drafted while
    // the user was disconnected.
    expect(params.refetchQueue).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(params.showToast).not.toHaveBeenCalled();
  });

  it('retries a failing refetch with backoff and stays quiet once it succeeds', async () => {
    const params = makeDefaultParams();
    params.refetchAvailablePlayers = jest
      .fn()
      .mockRejectedValueOnce(new Error('network hiccup'))
      .mockResolvedValue(undefined);

    renderHook(() => useDraftWebSocket(params));

    reconnect();
    await flushBackoff();

    expect(params.refetchAvailablePlayers).toHaveBeenCalledTimes(2);
    // A transient failure that recovers is not an error the user or Rollbar
    // needs to hear about.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(params.showToast).not.toHaveBeenCalled();
  });

  it('logs the underlying error object and warns the user when all retries fail', async () => {
    const cause = new Error('500 Internal Server Error');
    const params = makeDefaultParams();
    params.refetchAvailablePlayers = jest.fn().mockRejectedValue(cause);

    renderHook(() => useDraftWebSocket(params));

    reconnect();
    await flushBackoff();

    expect(params.refetchAvailablePlayers).toHaveBeenCalledTimes(3);

    // The cause must reach the log payload as the Error itself — `String(e)`
    // would drop `name`/`stack` and defeat the lib/rollbar AbortError filter.
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to refetch available players after websocket reconnect',
      { attempts: 3, error: cause },
    );

    // A stale available-players list is directly actionable by the user: they
    // can try to draft an already-taken player.
    expect(params.showToast).toHaveBeenCalledWith(
      expect.stringContaining('may be out of date'),
      'warning',
    );
  });

  it('stays silent when the refetch is aborted by navigation or unmount', async () => {
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    const params = makeDefaultParams();
    params.refetchAvailablePlayers = jest.fn().mockRejectedValue(abortError);

    renderHook(() => useDraftWebSocket(params));

    reconnect();
    await flushBackoff();

    // Cancellation is expected browser behaviour, not a failure: no retry, no
    // error-level log, no user-facing warning.
    expect(params.refetchAvailablePlayers).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(params.showToast).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith(
      'Refetch of available players cancelled after websocket reconnect',
      { error: abortError },
    );
  });

  it('cancels pending retries on unmount', async () => {
    const params = makeDefaultParams();
    params.refetchAvailablePlayers = jest
      .fn()
      .mockRejectedValue(new Error('network hiccup'));

    const { unmount } = renderHook(() => useDraftWebSocket(params));

    reconnect();
    // First attempt has rejected and the backoff timer is pending.
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    await flushBackoff();

    expect(params.refetchAvailablePlayers).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(params.showToast).not.toHaveBeenCalled();
  });

  /**
   * If a WS reconnect lands during the 300ms pick-notification debounce
   * window, the debounce timer must be cancelled — otherwise it fires its own
   * refetches on top of the reconnect-recovery refetches, doubling network
   * traffic on every reconnect (LDB-031). Reconnect recovery itself still
   * refetches the queue (LS-6787), so the debounce cancellation should
   * collapse what would otherwise be two calls down to one, not zero.
   */
  it('cancels the pending pick-notification debounce when a reconnect lands mid-window', async () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    act(() => mockInstance._emit('connected'));

    act(() => {
      mockInstance._emit(ClientNotificationType.DRAFT_PICK_MADE, {
        draftId: 42,
        pickId: 105,
        teamId: 20,
        playerId: 1,
        round: 1,
        pickNumber: 5,
        overallPick: 5,
        nextPick: { teamId: 10 },
        wasAutoPick: false,
        currentPickDeadline: null,
      });
    });

    // Reconnect lands before the 300ms debounce fires.
    act(() => mockInstance._emit('disconnected'));
    act(() => mockInstance._emit('connected'));

    await flushBackoff();

    // refetchQueue is called from both the debounce path and reconnect
    // recovery (LS-6787) — the debounce timer being cancelled must not
    // suppress the reconnect-recovery call, and the two paths must not
    // double up into two calls.
    expect(params.refetchQueue).toHaveBeenCalledTimes(1);
    // refetchCurrentPick is likewise called from both paths; only the
    // reconnect recovery call should have gone through.
    expect(params.refetchCurrentPick).toHaveBeenCalledTimes(1);
  });
});

describe('useDraftWebSocket — WS auth token rotation (LS-6788)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function getConstructor(): jest.Mock {
    return jest.requireMock<{ WebSocketClient: jest.Mock }>(
      '@legacy-sports/websocket-client',
    ).WebSocketClient;
  }

  it('tears down the stale socket and opens a new one when the auth token rotates', async () => {
    const params = makeDefaultParams();
    const { rerender } = renderHook((p) => useDraftWebSocket(p), {
      initialProps: params,
    });

    await act(async () => {
      await Promise.resolve();
    });

    const staleInstance = mockInstance;
    expect(getConstructor()).toHaveBeenCalledTimes(1);
    expect(getConstructor()).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: 'test-token' }),
    );

    // A long-running draft's access token is rotated in the background well
    // before the WS is ever forced to reconnect by a network drop.
    rerender({ ...params, token: 'rotated-token' });

    await act(async () => {
      await Promise.resolve();
    });

    expect(staleInstance.dispose).toHaveBeenCalledTimes(1);
    expect(getConstructor()).toHaveBeenCalledTimes(2);
    expect(getConstructor()).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: 'rotated-token' }),
    );
    expect(mockInstance.connect).toHaveBeenCalledTimes(1);
  });
});

// ── BFCache restoration recovery (LS-6792) ─────────────────────────────────

/**
 * iOS Safari and Android Chrome can restore a page from the BFCache
 * (back-forward cache) with the previous WebSocket object still reporting
 * `readyState === OPEN` even though the underlying connection is dead. A
 * plain reconnect attempt no-ops against that stale state, so the user is
 * left silently disconnected with duplicate/stale notification handlers.
 * `pagehide`/`pageshow` (with `event.persisted`) must force a real
 * close + reopen and drive the existing reconnect-refetch recovery.
 */
describe('useDraftWebSocket — BFCache restoration recovery (LS-6792)', () => {
  function dispatchPageLifecycleEvent(
    type: 'pagehide' | 'pageshow',
    persisted: boolean,
  ) {
    const event = new Event(type);
    Object.defineProperty(event, 'persisted', { value: persisted });
    act(() => {
      window.dispatchEvent(event);
    });
  }

  /** Flushes the backoff waits between retry attempts. */
  async function flushBackoff() {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disconnects the socket on pagehide when persisted is true', () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    dispatchPageLifecycleEvent('pagehide', true);

    expect(mockInstance.disconnect).toHaveBeenCalled();
  });

  it('does not touch the socket on pagehide when persisted is false', () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    dispatchPageLifecycleEvent('pagehide', false);

    expect(mockInstance.disconnect).not.toHaveBeenCalled();
  });

  it('forces close + reopen on pageshow when persisted is true, even if the cached socket looks open', () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    // Simulate a stale-but-"connected" socket surviving the freeze, then
    // being restored from the BFCache.
    act(() => mockInstance._emit('connected'));
    mockInstance.connect.mockClear();
    mockInstance.disconnect.mockClear();

    dispatchPageLifecycleEvent('pageshow', true);

    expect(mockInstance.disconnect).toHaveBeenCalled();
    expect(mockInstance.connect).toHaveBeenCalled();
  });

  it('does not touch the socket on pageshow when persisted is false (ordinary navigation)', () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    dispatchPageLifecycleEvent('pageshow', false);

    expect(mockInstance.disconnect).not.toHaveBeenCalled();
    expect(mockInstance.connect).not.toHaveBeenCalled();
  });

  it('a BFCache restore drives the existing reconnect-refetch recovery once the fresh handshake completes', async () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    act(() => mockInstance._emit('connected'));

    dispatchPageLifecycleEvent('pageshow', true);
    // The client itself emits `disconnected` -> `connected` once the forced
    // close + reopen completes — mirroring what WebSocketClient does in
    // response to disconnect()/connect().
    act(() => mockInstance._emit('disconnected'));
    act(() => mockInstance._emit('connected'));
    await flushBackoff();

    expect(params.refetchAvailablePlayers).toHaveBeenCalledTimes(1);
    expect(params.refetchDraft).toHaveBeenCalled();
    expect(params.refetchCurrentPick).toHaveBeenCalled();
  });

  it('removes the pagehide/pageshow listeners on unmount', () => {
    const params = makeDefaultParams();
    const { unmount } = renderHook(() => useDraftWebSocket(params));

    unmount();
    mockInstance.disconnect.mockClear();
    mockInstance.connect.mockClear();

    dispatchPageLifecycleEvent('pageshow', true);
    dispatchPageLifecycleEvent('pagehide', true);

    expect(mockInstance.disconnect).not.toHaveBeenCalled();
    expect(mockInstance.connect).not.toHaveBeenCalled();
  });
});

describe('useDraftWebSocket — heartbeat (LS-8880)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests a fast heartbeat interval so a dead draft socket is detected quickly', () => {
    const params = makeDefaultParams();

    renderHook(() => useDraftWebSocket(params));

    // Matches DRAFT_HEARTBEAT_MS in useDraftWebSocket.ts (15s) — far below
    // WebSocketClient's general-purpose default so a zombie draft connection
    // is caught in seconds, not minutes.
    expect(mockInstance.setHeartbeatInterval).toHaveBeenCalledWith(15_000);
  });
});

// ── Presence re-sync on reconnect (LDB-028) ────────────────────────────────

/**
 * `userJoined`/`userLeft` events that fire while the client is disconnected
 * are missed entirely, so `onlineTeamIds` can go stale after a reconnect. The
 * server pushes a fresh USER_LIST on every new connection, but that push is
 * best-effort — this asserts the client also explicitly re-requests one so
 * presence recovers even if the server-side push is dropped, instead of
 * staying stale until the next full page mount.
 */
describe('useDraftWebSocket — presence re-sync on reconnect (LDB-028)', () => {
  function reconnect() {
    act(() => mockInstance._emit('connected'));
    act(() => mockInstance._emit('disconnected'));
    act(() => mockInstance._emit('connected'));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not request a user list on the initial connect', () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    act(() => mockInstance._emit('connected'));

    expect(mockInstance.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'requestUserList' }),
    );
  });

  it('sends a draft-scoped requestUserList message on a genuine reconnect (LS-10160)', () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));

    reconnect();

    expect(mockInstance.send).toHaveBeenCalledWith({
      type: 'requestUserList',
      draftId: params.draftId,
    });
  });
});

// ── Draft-keyed realtime channel (LS-10160) ────────────────────────────────

/**
 * The draft room joins the draft-keyed channel by draftId. Draft-room events
 * are delivered on that channel only (LS-10080), so the hook never falls back
 * to the league channel: with no draftId yet it stays socket-less until one
 * resolves, and auction drafts stay socket-less.
 */
describe('useDraftWebSocket — draft-keyed channel (LS-10160)', () => {
  function getConstructor(): jest.Mock {
    return jest.requireMock<{ WebSocketClient: jest.Mock }>(
      '@legacy-sports/websocket-client',
    ).WebSocketClient;
  }

  async function flushDeferredConnect() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the socket with draftId + viewContext "draft" when a draftId is available', async () => {
    const params = makeDefaultParams();
    renderHook(() => useDraftWebSocket(params));
    await flushDeferredConnect();

    expect(getConstructor()).toHaveBeenCalledTimes(1);
    const options = (
      getConstructor().mock.calls as unknown[][]
    )[0][0] as Record<string, unknown>;
    expect(options).toMatchObject({ draftId: 42, viewContext: 'draft' });
    expect(options.leagueId).toBeUndefined();
    expect(mockInstance.connect).toHaveBeenCalledTimes(1);
  });

  it('opens the draft socket even when no leagueId is present', async () => {
    const params = { ...makeDefaultParams(), leagueId: null };
    renderHook(() => useDraftWebSocket(params));
    await flushDeferredConnect();

    expect(getConstructor()).toHaveBeenLastCalledWith(
      expect.objectContaining({ draftId: 42, viewContext: 'draft' }),
    );
    expect(mockInstance.connect).toHaveBeenCalledTimes(1);
  });

  it('never joins the league channel, and waits for a draftId before connecting (LS-10080)', async () => {
    const params: Parameters<typeof useDraftWebSocket>[0] = {
      ...makeDefaultParams(),
      draftId: null,
    };
    const { rerender } = renderHook(
      (p: Parameters<typeof useDraftWebSocket>[0]) => useDraftWebSocket(p),
      { initialProps: params },
    );
    await flushDeferredConnect();

    for (const [options] of getConstructor().mock.calls as unknown[][]) {
      expect(options).not.toHaveProperty('leagueId', 1);
      expect(options).not.toMatchObject({ viewContext: 'league' });
    }
    expect(mockInstance.connect).not.toHaveBeenCalled();

    rerender({ ...params, draftId: 42 });
    await flushDeferredConnect();

    expect(getConstructor()).toHaveBeenLastCalledWith(
      expect.objectContaining({ draftId: 42, viewContext: 'draft' }),
    );
    expect(mockInstance.connect).toHaveBeenCalledTimes(1);
  });

  it('keeps auction drafts socket-less even with a draftId', async () => {
    const params = { ...makeDefaultParams(), isAuctionDraft: true };
    renderHook(() => useDraftWebSocket(params));
    await flushDeferredConnect();

    expect(mockInstance.connect).not.toHaveBeenCalled();
  });
});
