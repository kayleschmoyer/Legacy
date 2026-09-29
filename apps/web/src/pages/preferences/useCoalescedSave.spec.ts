import { act, renderHook } from '@testing-library/react';
import { useCoalescedSave } from './useCoalescedSave';

describe('useCoalescedSave', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('collapses a burst of changes into one save of the final values', () => {
    const save = jest.fn();
    const { result } = renderHook(() =>
      useCoalescedSave<{ a?: number; b?: boolean }>(save, 300),
    );
    act(() => {
      result.current.queue({ a: 1 });
      jest.advanceTimersByTime(100);
      result.current.queue({ a: 2, b: true });
      jest.advanceTimersByTime(100);
      result.current.queue({ a: 3 });
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.hasPending()).toBe(true);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ a: 3, b: true });
    expect(result.current.hasPending()).toBe(false);
  });

  it('flushes a pending patch on unmount', () => {
    const save = jest.fn();
    const { result, unmount } = renderHook(() =>
      useCoalescedSave<{ a?: number }>(save, 300),
    );
    act(() => result.current.queue({ a: 7 }));
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ a: 7 });
  });

  it('does not save when nothing was queued', () => {
    const save = jest.fn();
    const { unmount } = renderHook(() => useCoalescedSave(save, 300));
    unmount();
    expect(save).not.toHaveBeenCalled();
  });
});
