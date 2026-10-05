import { act, renderHook } from '@testing-library/react';
import { useScreenWakeLock } from './useScreenWakeLock';

type Sentinel = { released: boolean; release: jest.Mock };

function installWakeLock() {
  const sentinels: Sentinel[] = [];
  const request = jest.fn(() => {
    const sentinel: Sentinel = {
      released: false,
      release: jest.fn(() => {
        sentinel.released = true;
        return Promise.resolve();
      }),
    };
    sentinels.push(sentinel);
    return Promise.resolve(sentinel);
  });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });
  return { request, sentinels };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

const flush = () => act(async () => Promise.resolve());

describe('useScreenWakeLock (LS-10593)', () => {
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    setVisibility('visible');
  });

  it('acquires a screen wake lock while active and releases it on unmount', async () => {
    const { request, sentinels } = installWakeLock();
    setVisibility('visible');
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    unmount();
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it('does nothing while inactive', async () => {
    const { request } = installWakeLock();
    renderHook(() => useScreenWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('re-acquires after the browser releases the lock on hide', async () => {
    const { request, sentinels } = installWakeLock();
    setVisibility('visible');
    renderHook(() => useScreenWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    // Page hidden: the browser drops the lock.
    sentinels[0].released = true;
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('is a no-op where the Wake Lock API is unavailable', () => {
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow();
  });
});
