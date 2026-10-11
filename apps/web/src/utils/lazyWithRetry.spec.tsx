import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { lazyWithRetry } from './lazyWithRetry';

const RELOAD_KEY = 'chunk-load-reload-attempted';

class CaughtErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div>error-boundary: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

function renderLazy(
  factory: () => Promise<{ default: React.ComponentType }>,
  wrap: typeof lazyWithRetry = lazyWithRetry,
) {
  const LazyComponent = wrap(factory);
  return render(
    <CaughtErrorBoundary>
      <React.Suspense fallback={<div>loading</div>}>
        <LazyComponent />
      </React.Suspense>
    </CaughtErrorBoundary>,
  );
}

describe('lazyWithRetry', () => {
  const originalVisibilityState = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState',
  );

  function setVisibilityState(value: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => value,
    });
  }

  // jsdom's `Location` is spec-locked to a non-configurable own property, so
  // `window.location.reload` can't be spied on directly. Instead these tests
  // observe the two things `lazyWithRetry` does immediately before calling
  // it — setting the sessionStorage retry flag and returning a
  // never-settling promise (so the Suspense fallback stays up) — as proof
  // the reload branch, rather than the abort-rethrow branch, was taken.
  // `window.location.reload()` itself is a real call in these tests; jsdom
  // logs a "not implemented: navigation" console error for it, and React
  // logs caught errors via console.error even when an ErrorBoundary handles
  // them — both are suppressed here rather than asserted on.
  beforeEach(() => {
    sessionStorage.clear();
    setVisibilityState('visible');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalVisibilityState) {
      Object.defineProperty(
        document,
        'visibilityState',
        originalVisibilityState,
      );
    }
    jest.restoreAllMocks();
  });

  it('reloads the page on a genuine stale-chunk 404 (visible tab, no navigation away)', async () => {
    const factory = jest
      .fn()
      .mockRejectedValue(
        new TypeError('Failed to fetch dynamically imported module'),
      );

    renderLazy(factory);

    await waitFor(() =>
      expect(sessionStorage.getItem(RELOAD_KEY)).toBe('true'),
    );
    // The reload path returns a never-settling promise: the component stays
    // suspended rather than rendering the ErrorBoundary's fallback.
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText(/error-boundary/)).not.toBeInTheDocument();
  });

  it('does NOT reload when the import rejects because the tab is hidden (navigating away)', async () => {
    setVisibilityState('hidden');
    const factory = jest
      .fn()
      .mockRejectedValue(
        new TypeError('Failed to fetch dynamically imported module'),
      );

    renderLazy(factory);

    await waitFor(() =>
      expect(screen.getByText(/error-boundary/)).toBeInTheDocument(),
    );
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it('does NOT reload when the import rejects with an AbortError', async () => {
    const factory = jest
      .fn()
      .mockRejectedValue(
        new DOMException('The operation was aborted.', 'AbortError'),
      );

    renderLazy(factory);

    await waitFor(() =>
      expect(screen.getByText(/error-boundary/)).toBeInTheDocument(),
    );
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it('bubbles the error to the ErrorBoundary on a second genuine failure instead of reloading forever', async () => {
    sessionStorage.setItem(RELOAD_KEY, 'true');
    const factory = jest
      .fn()
      .mockRejectedValue(
        new TypeError('Failed to fetch dynamically imported module'),
      );

    renderLazy(factory);

    await waitFor(() =>
      expect(screen.getByText(/error-boundary/)).toBeInTheDocument(),
    );
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it('resolves normally and clears any stale retry flag on success', async () => {
    sessionStorage.setItem(RELOAD_KEY, 'true');
    const TestComponent = () => <div>loaded</div>;
    const factory = jest.fn().mockResolvedValue({ default: TestComponent });

    renderLazy(factory);

    await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  // The 'beforeunload' flag is module-scoped and sticky for the life of the
  // document, so these tests load a fresh module copy (with its own
  // listeners) rather than poisoning the shared import used above.
  function loadFreshLazyWithRetry(): typeof lazyWithRetry {
    let fresh: typeof lazyWithRetry | undefined;
    jest.isolateModules(() => {
      fresh =
        jest.requireActual<typeof import('./lazyWithRetry')>(
          './lazyWithRetry',
        ).lazyWithRetry;
    });
    if (!fresh) throw new Error('failed to load lazyWithRetry');
    return fresh;
  }

  async function flushTimers() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // LS-11061: WebKit cancels the in-flight chunk fetch when a new-document
  // navigation starts, before 'pagehide' and while the tab is still visible.
  // 'beforeunload' is the earliest signal, so it must suppress the reload.
  // Otherwise the reload interrupts the navigation the user asked for.
  it('does NOT reload when the import rejects after beforeunload (WebKit cancels the fetch before pagehide)', async () => {
    const fresh = loadFreshLazyWithRetry();
    window.dispatchEvent(new Event('beforeunload'));
    await flushTimers();
    const factory = jest
      .fn()
      .mockRejectedValue(new TypeError('Importing a module script failed.'));

    renderLazy(factory, fresh);

    await waitFor(() =>
      expect(screen.getByText(/error-boundary/)).toBeInTheDocument(),
    );
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it('still reloads on a stale-chunk 404 when an unsaved-changes guard cancelled the beforeunload', async () => {
    const fresh = loadFreshLazyWithRetry();
    const cancelUnload = (event: Event) => event.preventDefault();
    window.addEventListener('beforeunload', cancelUnload);
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    window.removeEventListener('beforeunload', cancelUnload);
    await flushTimers();
    const factory = jest
      .fn()
      .mockRejectedValue(
        new TypeError('Failed to fetch dynamically imported module'),
      );

    renderLazy(factory, fresh);

    await waitFor(() =>
      expect(sessionStorage.getItem(RELOAD_KEY)).toBe('true'),
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
  });
});
