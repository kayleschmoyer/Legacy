import { renderHook } from '@testing-library/react';
import { ClientNotificationType } from '@legacy-sports/utils';
import { useLeagueWebSocket } from './useLeagueWebSocket';
import { useLeagueWebSocketClient } from '../context/LeagueWebSocketContext';

jest.mock('../context/LeagueWebSocketContext', () => ({
  useLeagueWebSocketClient: jest.fn(),
}));

const mockUseLeagueWebSocketClient =
  useLeagueWebSocketClient as jest.MockedFunction<
    typeof useLeagueWebSocketClient
  >;

/**
 * Minimal fake WebSocketClient: `on` records handlers keyed by event name and
 * returns an unsubscribe fn; `_emit` invokes them, mirroring the real client's
 * emitter contract that useLeagueWebSocket subscribes to.
 */
function makeMockClient() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(handler);
      return () => {
        handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
      };
    }),
    _emit(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };
}

describe('useLeagueWebSocket', () => {
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    jest.resetAllMocks();
    mockClient = makeMockClient();
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: mockClient as never,
      connected: false,
    });
  });

  it('does not fire onReconnect on the initial connect', () => {
    const onReconnect = jest.fn();
    renderHook(() => useLeagueWebSocket({ onReconnect }));

    mockClient._emit('connected');

    expect(onReconnect).not.toHaveBeenCalled();
  });

  // Reconnect-after-drop: onReconnect fires only when a 'connected' event
  // follows a prior 'connected' (i.e. the socket dropped and came back), which
  // is what LeagueWSPageHandler wires to refetchLeague(). See LS-7625.
  it('fires onReconnect when the socket reconnects (connected after a prior connect)', () => {
    const onReconnect = jest.fn();
    renderHook(() => useLeagueWebSocket({ onReconnect }));

    mockClient._emit('connected'); // initial connect — no reconnect
    mockClient._emit('connected'); // reconnect after a drop

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('fires onDraftStarted when a DRAFT_STARTED notification arrives', () => {
    const onDraftStarted = jest.fn();
    renderHook(() => useLeagueWebSocket({ onDraftStarted }));

    mockClient._emit(ClientNotificationType.DRAFT_STARTED);

    expect(onDraftStarted).toHaveBeenCalledTimes(1);
  });

  it('passes the notification payload (including matchupId) to onMatchupStatsComplete', () => {
    const onMatchupStatsComplete = jest.fn();
    renderHook(() => useLeagueWebSocket({ onMatchupStatsComplete }));

    const notification = {
      type: 'matchup-stats-complete',
      leagueId: 1,
      matchupId: 42,
      completedAt: '2026-01-01T00:00:00.000Z',
    };
    mockClient._emit(
      ClientNotificationType.MATCHUP_STATS_COMPLETE,
      notification,
    );

    expect(onMatchupStatsComplete).toHaveBeenCalledWith(notification);
  });

  it('fires onMatchupScoreUpdated when a MATCHUP_SCORE_UPDATED notification arrives', () => {
    const onMatchupScoreUpdated = jest.fn();
    renderHook(() => useLeagueWebSocket({ onMatchupScoreUpdated }));

    const payload = {
      type: ClientNotificationType.MATCHUP_SCORE_UPDATED,
      leagueId: 7,
      matchupId: 42,
      team1Score: 49,
      team2Score: 31,
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    mockClient._emit(ClientNotificationType.MATCHUP_SCORE_UPDATED, payload);

    expect(onMatchupScoreUpdated).toHaveBeenCalledTimes(1);
    expect(onMatchupScoreUpdated).toHaveBeenCalledWith(payload);
  });

  it('does not subscribe when there is no client', () => {
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    const onReconnect = jest.fn();

    expect(() =>
      renderHook(() => useLeagueWebSocket({ onReconnect })),
    ).not.toThrow();
    expect(onReconnect).not.toHaveBeenCalled();
  });
});
