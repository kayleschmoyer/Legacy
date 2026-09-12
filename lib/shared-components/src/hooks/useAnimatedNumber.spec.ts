import { act, renderHook } from '@testing-library/react';
import { useAnimatedNumber } from './useAnimatedNumber';

const mockUseReducedMotion = jest.fn<boolean, []>();
jest.mock('./useReducedMotion', () => ({
  useReducedMotion: (): boolean => mockUseReducedMotion(),
}));

/**
 * Drives `requestAnimationFrame` off Jest's fake timers so a tween can be
 * stepped deterministically: each queued frame runs on the next timer tick,
 * and `Date.now()` advances with the fake clock the hook reads.
 */
function installFrameClock() {
  const originalRaf = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;
  let nextHandle = 1;
  const handles = new Map<number, ReturnType<typeof setTimeout>>();

  global.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const handle = nextHandle++;
    handles.set(
      handle,
      setTimeout(() => {
        handles.delete(handle);
        callback(Date.now());
      }, 16),
    );
    return handle;
  };

  global.cancelAnimationFrame = ((handle: number): void => {
    const timer = handles.get(handle);
    if (timer) clearTimeout(timer);
    handles.delete(handle);
  }) as typeof global.cancelAnimationFrame;

  return () => {
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCancel;
  };
}

describe('useAnimatedNumber', () => {
  let restoreFrameClock: () => void;

  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
    jest.useFakeTimers();
    restoreFrameClock = installFrameClock();
  });

  afterEach(() => {
    restoreFrameClock();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('starts at the initial value without animating or reporting a delta', () => {
    const onDelta = jest.fn();
    const { result } = renderHook(() => useAnimatedNumber(87.5, { onDelta }));

    // Mounting a scoreboard is not a score change — a fresh matchup must not
    // count up from zero or announce a phantom increase.
    expect(result.current.current).toBe(87.5);
    expect(result.current.delta).toBeNull();
    expect(onDelta).not.toHaveBeenCalled();
  });

  it('tweens toward a higher value and lands exactly on it', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, { durationMs: 100 }),
      { initialProps: { value: 100 } },
    );

    rerender({ value: 110 });

    // Part-way through the tween the displayed value is between the two, not
    // already replaced — this is the jarring instant swap the ticket reports.
    act(() => {
      jest.advanceTimersByTime(48);
    });
    expect(result.current.current).toBeGreaterThan(100);
    expect(result.current.current).toBeLessThan(110);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.current).toBe(110);
  });

  it('reports the signed increase once per change', () => {
    const onDelta = jest.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, { durationMs: 100, onDelta }),
      { initialProps: { value: 100 } },
    );

    rerender({ value: 106.5 });

    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith(6.5);
    expect(result.current.delta).toBeCloseTo(6.5);
  });

  it('clears the delta after the badge window elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, { durationMs: 100 }),
      { initialProps: { value: 10 } },
    );

    rerender({ value: 17 });
    expect(result.current.delta).toBeCloseTo(7);

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.delta).toBeNull();
  });

  it('does not report a negative delta when a score is corrected downward', () => {
    const onDelta = jest.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, { durationMs: 100, onDelta }),
      { initialProps: { value: 50 } },
    );

    // Stat re-scoring can revise a score down; that is a correction, not a
    // "+N" increment, so no badge and no callback.
    rerender({ value: 44 });

    expect(onDelta).not.toHaveBeenCalled();
    expect(result.current.delta).toBeNull();

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current.current).toBe(44);
  });

  it('snaps to the new value under prefers-reduced-motion but still reports the delta', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const onDelta = jest.fn();
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, { durationMs: 500, onDelta }),
      { initialProps: { value: 20 } },
    );

    rerender({ value: 27 });

    // No frames are needed — the value is already final.
    expect(result.current.current).toBe(27);
    // The delta still fires so non-motion affordances are unaffected.
    expect(onDelta).toHaveBeenCalledWith(7);
  });

  it('snaps to the new value when disabled', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, { disabled: true }),
      { initialProps: { value: 3 } },
    );

    rerender({ value: 9 });

    expect(result.current.current).toBe(9);
  });

  it('retargets mid-tween when the score changes again', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useAnimatedNumber(value, { durationMs: 100 }),
      { initialProps: { value: 0 } },
    );

    rerender({ value: 50 });
    act(() => {
      jest.advanceTimersByTime(32);
    });

    // A second scoring event lands before the first tween settles — the final
    // displayed value must be the newest score, not the abandoned target.
    rerender({ value: 80 });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.current).toBe(80);
  });
});
