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

function renderLazy(factory: () => Promise<{ default: React.ComponentType }>) {
  const LazyComponent = lazyWithRetry(factory);
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
});
