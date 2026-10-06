import { renderHook } from '@testing-library/react';
import type { AppStateStatus } from 'react-native';
import { useAppForeground } from './useAppForeground.native';

type ChangeListener = (state: AppStateStatus) => void;

const mockListeners = new Set<ChangeListener>();
const mockRemove = jest.fn();
const mockAppState = { currentState: 'active' as AppStateStatus };

jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockAppState.currentState;
    },
    addEventListener: (_type: 'change', listener: ChangeListener) => {
      mockListeners.add(listener);
      return {
        remove: () => {
          mockRemove();
          mockListeners.delete(listener);
        },
      };
    },
  },
}));

function emit(state: AppStateStatus) {
  mockAppState.currentState = state;
  mockListeners.forEach((listener) => listener(state));
}

describe('useAppForeground (native, LS-10593)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockListeners.clear();
    mockRemove.mockClear();
    mockAppState.currentState = 'active';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the time spent in the background when the app becomes active', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    emit('background');
    jest.advanceTimersByTime(12_000);
    emit('active');

    expect(onForeground).toHaveBeenCalledTimes(1);
    expect(onForeground).toHaveBeenCalledWith(12_000);
  });

  it('measures from the first non-active state (inactive -> background -> active)', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    emit('inactive');
    jest.advanceTimersByTime(1_000);
    emit('background');
    jest.advanceTimersByTime(4_000);
    emit('active');

    expect(onForeground).toHaveBeenCalledWith(5_000);
  });

  it('does not fire for an active -> active change', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    emit('active');

    expect(onForeground).not.toHaveBeenCalled();
  });

  it('treats mounting while backgrounded as already away', () => {
    mockAppState.currentState = 'background';
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    jest.advanceTimersByTime(3_000);
    emit('active');

    expect(onForeground).toHaveBeenCalledWith(3_000);
  });

  describe('onBackground (LS-10625)', () => {
    it('fires once on the transition into background', () => {
      const onBackground = jest.fn();
      renderHook(() => useAppForeground(jest.fn(), onBackground));

      emit('background');
      emit('background');

      expect(onBackground).toHaveBeenCalledTimes(1);
    });

    it('does not fire for the transient inactive state', () => {
      const onBackground = jest.fn();
      renderHook(() => useAppForeground(jest.fn(), onBackground));

      emit('inactive');
      emit('active');

      expect(onBackground).not.toHaveBeenCalled();
    });

    it('fires again on the next background after returning to active', () => {
      const onBackground = jest.fn();
      renderHook(() => useAppForeground(jest.fn(), onBackground));

      emit('background');
      emit('active');
      emit('background');

      expect(onBackground).toHaveBeenCalledTimes(2);
    });

    it('fires on mount when the app is already backgrounded', () => {
      mockAppState.currentState = 'background';
      const onBackground = jest.fn();
      renderHook(() => useAppForeground(jest.fn(), onBackground));

      expect(onBackground).toHaveBeenCalledTimes(1);
    });
  });

  it('removes the AppState subscription on unmount', () => {
    const onForeground = jest.fn();
    const { unmount } = renderHook(() => useAppForeground(onForeground));

    unmount();
    emit('background');
    emit('active');

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(onForeground).not.toHaveBeenCalled();
  });
});
