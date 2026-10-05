import { renderHook } from '@testing-library/react-native';
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

  it('fires onRosterUpdate when a ROSTER_UPDATE notification arrives', () => {
    const onRosterUpdate = jest.fn();
    renderHook(() => useLeagueWebSocket({ onRosterUpdate }));

    mockClient._emit(ClientNotificationType.ROSTER_UPDATE);

    expect(onRosterUpdate).toHaveBeenCalledTimes(1);
  });

  // LS-6316 / FLD-011: matchup scoring previously had no WS handler at all —
  // the matchups list only ever refreshed via manual pull-to-refresh.
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

  // LS-10593: an open league screen never noticed the commissioner starting
  // the draft — DRAFT_STARTED arrived on the league socket but had no handler.
  it.each([
    [ClientNotificationType.DRAFT_STARTED],
    [ClientNotificationType.DRAFT_PAUSED],
    [ClientNotificationType.DRAFT_RESUMED],
  ])('fires onDraftStatusChanged when a %s notification arrives', (event) => {
    const onDraftStatusChanged = jest.fn();
    renderHook(() => useLeagueWebSocket({ onDraftStatusChanged }));

    mockClient._emit(event, { type: event, leagueId: 7, draftId: 3 });

    expect(onDraftStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe when there is no client', () => {
    mockUseLeagueWebSocketClient.mockReturnValue({
      client: null,
      connected: false,
    });
    const onMatchupScoreUpdated = jest.fn();

    expect(() =>
      renderHook(() => useLeagueWebSocket({ onMatchupScoreUpdated })),
    ).not.toThrow();
    expect(onMatchupScoreUpdated).not.toHaveBeenCalled();
  });
});
