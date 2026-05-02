/**
 * useDraftWebSocket — focused regression tests for LS-3823
 *
 * Verifies that the "Draft Complete!" banner becomes visible after draft
 * completion even when the last-pick WS event is missed (e.g. transient
 * WebSocket disconnect), by ensuring handleDraftCompleted calls refetchDraft()
 * so the Apollo cache is hydrated with draftCompletedAt.
 */

import { act, renderHook } from '@testing-library/react';
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
