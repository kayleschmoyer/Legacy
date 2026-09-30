import { act, renderHook } from '@testing-library/react';
import { useRetryingSave } from './useRetryingSave';

type Patch = { a?: number; b?: boolean };

const OPTIONS = { maxAutoRetries: 2, baseDelayMs: 100 };

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useRetryingSave (LS-7082)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stays idle and reports success when the save goes through', async () => {
    const send = jest.fn().mockResolvedValue({});
    const onSaved = jest.fn();
    const { result } = renderHook(() =>
      useRetryingSave<Patch>(send, { ...OPTIONS, onSaved }),
    );

    act(() => result.current.save({ a: 1 }));
    await flushPromises();

    expect(send).toHaveBeenCalledWith({ a: 1 });
    expect(result.current.status).toBe('idle');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('flags a failed save and retries it with exponential backoff', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({});
    const onSaved = jest.fn();
    const { result } = renderHook(() =>
      useRetryingSave<Patch>(send, { ...OPTIONS, onSaved }),
    );

    act(() => result.current.save({ a: 1 }));
    await flushPromises();
    expect(result.current.status).toBe('retrying');
    expect(onSaved).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(99));
    expect(send).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1));
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('retrying');

    // Second retry waits twice as long.
    act(() => jest.advanceTimersByTime(199));
    expect(send).toHaveBeenCalledTimes(2);
    act(() => jest.advanceTimersByTime(1));
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith({ a: 1 });
    expect(result.current.status).toBe('idle');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('gives up after the automatic retries and retries on demand', async () => {
    const send = jest.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useRetryingSave<Patch>(send, OPTIONS));

    act(() => result.current.save({ b: true }));
    await flushPromises();
    act(() => jest.advanceTimersByTime(100));
    await flushPromises();
    act(() => jest.advanceTimersByTime(200));
    await flushPromises();

    expect(send).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('failed');

    act(() => jest.advanceTimersByTime(60_000));
    expect(send).toHaveBeenCalledTimes(3);

    send.mockResolvedValue({});
    act(() => result.current.retryNow());
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(4);
    expect(send).toHaveBeenLastCalledWith({ b: true });
    expect(result.current.status).toBe('idle');
  });

  it('merges a newer edit into the unsaved patch and ignores the superseded attempt', async () => {
    const rejects: Array<(e: Error) => void> = [];
    const send = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise((_, reject) => rejects.push(reject)),
      )
      .mockResolvedValue({});
    const onSaved = jest.fn();
    const { result } = renderHook(() =>
      useRetryingSave<Patch>(send, { ...OPTIONS, onSaved }),
    );

    act(() => result.current.save({ a: 1 }));
    act(() => result.current.save({ b: true }));
    expect(send).toHaveBeenLastCalledWith({ a: 1, b: true });

    // The first (stale) attempt failing late must not flag an error.
    await act(async () => {
      rejects[0](new Error('late'));
      await Promise.resolve();
    });
    await flushPromises();
    expect(result.current.status).toBe('idle');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('retries immediately when the browser comes back online', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({});
    const { result } = renderHook(() => useRetryingSave<Patch>(send, OPTIONS));

    act(() => result.current.save({ a: 2 }));
    await flushPromises();
    expect(result.current.status).toBe('retrying');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('idle');
  });

  it('does nothing on "online" when there is nothing unsaved', () => {
    const send = jest.fn().mockResolvedValue({});
    renderHook(() => useRetryingSave<Patch>(send, OPTIONS));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('cancels a pending retry on unmount', async () => {
    const send = jest.fn().mockRejectedValue(new Error('offline'));
    const { result, unmount } = renderHook(() =>
      useRetryingSave<Patch>(send, OPTIONS),
    );
    act(() => result.current.save({ a: 1 }));
    await flushPromises();
    unmount();
    act(() => jest.advanceTimersByTime(10_000));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
