import { renderHook } from '@testing-library/react';

// Load the web implementation by its explicit filename: the mobile jest
// project prefers `.native.ts`, so a bare `./useAppForeground` import would
// test the AppState variant there instead (covered by
// useAppForeground.native.spec.ts).
const { useAppForeground } = jest.requireActual<
  typeof import('./useAppForeground')
>('./useAppForeground.ts');

describe('useAppForeground (web, LS-10593)', () => {
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    jest.useFakeTimers();
    visibility = 'visible';
    jest
      .spyOn(document, 'visibilityState', 'get')
      .mockImplementation(() => visibility);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function setVisibility(next: DocumentVisibilityState) {
    visibility = next;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('reports how long the page was hidden when it becomes visible again', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    setVisibility('hidden');
    jest.advanceTimersByTime(7_000);
    setVisibility('visible');

    expect(onForeground).toHaveBeenCalledTimes(1);
    expect(onForeground).toHaveBeenCalledWith(7_000);
  });

  it('does not fire on a visible -> visible change with no prior hide', () => {
    const onForeground = jest.fn();
    renderHook(() => useAppForeground(onForeground));

    setVisibility('visible');

    expect(onForeground).not.toHaveBeenCalled();
  });

  it('calls the latest callback without re-registering the listener', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useAppForeground(cb), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    setVisibility('hidden');
    setVisibility('visible');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes its listener on unmount', () => {
    const onForeground = jest.fn();
    const { unmount } = renderHook(() => useAppForeground(onForeground));

    setVisibility('hidden');
    unmount();
    setVisibility('visible');

    expect(onForeground).not.toHaveBeenCalled();
  });
});
