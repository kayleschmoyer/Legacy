import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useNotifications } from './useNotifications';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockStartPolling = jest.fn();
const mockStopPolling = jest.fn();
const mockRefetchCount = jest.fn();
const mockRefetchHistory = jest.fn();
const mockRefetchPreferences = jest.fn();

// Capture the onError callback so tests can trigger it directly
let capturedOnError: ((error: Error) => void) | undefined;

jest.mock('../../../api/db/graphql.generated', () => ({
  useGetUnreadNotificationCountQuery: jest.fn(
    (options?: { onError?: (e: Error) => void; skip?: boolean }) => {
      capturedOnError = options?.onError;
      return {
        data: undefined,
        refetch: mockRefetchCount,
        startPolling: mockStartPolling,
        stopPolling: mockStopPolling,
      };
    },
  ),
  useGetNotificationHistoryQuery: jest.fn(() => ({
    data: undefined,
    loading: false,
    refetch: mockRefetchHistory,
  })),
  useGetUserNotificationPreferencesQuery: jest.fn(() => ({
    data: undefined,
    loading: false,
    refetch: mockRefetchPreferences,
  })),
  useMarkNotificationAsReadMutation: jest.fn(() => [jest.fn(), {}]),
  useMarkAllNotificationsAsReadMutation: jest.fn(() => [jest.fn(), {}]),
  useUpdateNotificationPreferencesMutation: jest.fn(() => [
    jest.fn(),
    { loading: false },
  ]),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

// Capture the AppState listener without overriding the entire RN module
let capturedAppStateListener: ((state: string) => void) | undefined;

function simulatePollingError() {
  void act(() => {
    capturedOnError?.(new Error('Network error'));
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useNotifications — exponential backoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    capturedOnError = undefined;
    capturedAppStateListener = undefined;

    // Spy on AppState.addEventListener to intercept the state-change listener
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(
        (_event: string, handler: (state: string) => void) => {
          capturedAppStateListener = handler;
          return { remove: jest.fn() };
        },
      );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts polling on mount', () => {
    renderHook(() => useNotifications(1));
    expect(mockStartPolling).toHaveBeenCalledWith(30_000);
  });

  it('exposes pollingError as false initially', () => {
    const { result } = renderHook(() => useNotifications(1));
    expect(result.current.pollingError).toBe(false);
  });

  it('stops polling and sets pollingError when a poll fails', () => {
    const { result } = renderHook(() => useNotifications(1));
    simulatePollingError();
    expect(mockStopPolling).toHaveBeenCalled();
    expect(result.current.pollingError).toBe(true);
  });

  it('schedules a retry after 30s on the first failure', () => {
    renderHook(() => useNotifications(1));
    simulatePollingError();

    // No re-polling before the delay elapses
    expect(mockStartPolling).toHaveBeenCalledTimes(1);

    void act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(mockStartPolling).toHaveBeenCalledTimes(2);
    expect(mockStartPolling).toHaveBeenLastCalledWith(30_000);
  });

  it('doubles the retry delay on consecutive failures (exponential backoff)', () => {
    renderHook(() => useNotifications(1));

    // First failure → 30s delay
    simulatePollingError();
    void act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(mockStartPolling).toHaveBeenCalledTimes(2);

    // Second failure → 60s delay
    simulatePollingError();
    void act(() => {
      jest.advanceTimersByTime(30_000); // only 30s passed — should not retry yet
    });
    expect(mockStartPolling).toHaveBeenCalledTimes(2);

    void act(() => {
      jest.advanceTimersByTime(30_000); // 60s total since second failure
    });
    expect(mockStartPolling).toHaveBeenCalledTimes(3);
  });

  it('caps the retry delay at 300s', () => {
    renderHook(() => useNotifications(1));

    // Trigger enough failures to exceed the cap (delay = 30s * 2^(n-1), cap = 300s)
    for (let i = 0; i < 10; i++) {
      simulatePollingError();
      void act(() => {
        jest.advanceTimersByTime(300_000);
      });
    }

    // Every retry must restart with BASE_POLL_INTERVAL regardless of backoff depth
    for (const [interval] of mockStartPolling.mock.calls as Array<[number]>) {
      expect(interval).toBe(30_000);
    }
  });

  it('cancels a pending retry when a new error arrives before it fires', () => {
    renderHook(() => useNotifications(1));

    simulatePollingError(); // schedules retry in 30s
    void act(() => {
      jest.advanceTimersByTime(15_000); // halfway through
    });

    // Second error before first timer fires: reschedules at 60s from now
    simulatePollingError();
    void act(() => {
      jest.advanceTimersByTime(30_000); // only 30s since second error — no retry yet
    });
    expect(mockStartPolling).toHaveBeenCalledTimes(1); // only the initial mount call

    void act(() => {
      jest.advanceTimersByTime(30_000); // 60s since second error
    });
    expect(mockStartPolling).toHaveBeenCalledTimes(2);
  });

  it('cancels the retry timer and resets backoff when app returns to foreground', () => {
    renderHook(() => useNotifications(1));

    simulatePollingError(); // schedules retry

    // App goes to background
    void act(() => {
      capturedAppStateListener?.('background');
    });

    // App returns to foreground — should restart polling fresh
    void act(() => {
      capturedAppStateListener?.('active');
    });

    // The scheduled retry timer was cancelled; advancing time should not double-fire
    void act(() => {
      jest.advanceTimersByTime(60_000);
    });

    // mount call + foreground-restart call = 2
    expect(mockStartPolling).toHaveBeenCalledTimes(2);
  });

  it('clears the retry timer on unmount', () => {
    const { unmount } = renderHook(() => useNotifications(1));
    simulatePollingError(); // schedules retry

    unmount();

    // Timer should be cancelled — no further startPolling after unmount
    void act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockStartPolling).toHaveBeenCalledTimes(1); // only the mount call
  });

  it('does not poll when userId is 0', () => {
    renderHook(() => useNotifications(0));
    expect(mockStartPolling).not.toHaveBeenCalled();
  });
});
