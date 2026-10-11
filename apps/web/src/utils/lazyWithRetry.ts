import React from 'react';

const RELOAD_KEY = 'chunk-load-reload-attempted';

// Set by the 'pagehide' listener below. `pagehide` fires on *this* document
// the moment the browser commits to navigating away from it (new-document
// navigation, tab close, or back/forward). Module-scoped and never reset:
// once a document starts unloading it never becomes active again, so
// there's nothing to reset for.
let pageIsUnloading = false;
// Set by the 'beforeunload' listener below. `pagehide` alone is too late on
// WebKit: when a new-document navigation (e.g. Playwright's `page.goto()` or
// a typed URL) starts its provisional load, WebKit stops every in-flight
// load of the *current* document right away, long before the new page
// commits and `pagehide` fires. A lazy chunk still downloading at that
// moment rejects while the old document is visible and not yet unloading,
// which used to look like a stale-chunk 404 and trigger
// `window.location.reload()`. That reload is itself a navigation to the
// current URL, and it interrupts the navigation the user actually asked for
// (LS-11061: Mobile Safari "Navigation to /games/season-draft/create is
// interrupted by another navigation to /profile/settings").
// `beforeunload` fires before WebKit cancels those loads, so it closes that
// window.
let navigationAwayStarted = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    pageIsUnloading = true;
  });
  window.addEventListener('beforeunload', (event) => {
    navigationAwayStarted = true;
    // An unsaved-changes guard (useUnsavedChangesGuard, EliteDraftBoard,
    // LeagueScoringEditor) can cancel the unload, so the user may stay on
    // this document. Re-check once every listener has run and clear the
    // flag if the unload was cancelled, so a later genuine stale-chunk 404
    // still gets its recovery reload.
    // A cancelling handler either calls preventDefault() or sets
    // `returnValue` to a non-empty string (its spec default is '').
    setTimeout(() => {
      if (
        event.defaultPrevented ||
        (typeof event.returnValue === 'string' && event.returnValue !== '')
      ) {
        navigationAwayStarted = false;
      }
    }, 0);
  });
}

/**
 * Heuristic for "this chunk import rejected because the user navigated away
 * mid-load", as opposed to "the chunk genuinely 404'd after a deploy".
 *
 * Browsers don't give a reliable, consistent error signature for a dynamic
 * import cancelled by navigation (Chromium and WebKit both throw a plain
 * TypeError with engine-specific wording, occasionally an AbortError), so
 * this leans on out-of-band signals instead of the rejection's shape:
 *
 *  - `pageIsUnloading`: the 'pagehide' listener above already fired, meaning
 *    a navigation away from this document is in progress.
 *  - `navigationAwayStarted`: the 'beforeunload' listener above fired and
 *    nothing cancelled the unload. This covers WebKit, which cancels the
 *    chunk fetch before 'pagehide'.
 *  - `document.visibilityState === 'hidden'`: covers engines/timings where
 *    visibility flips before 'pagehide' is observed.
 *  - `DOMException` named 'AbortError': the rare case where the browser does
 *    surface an explicit abort signature for the cancelled request.
 *
 * A backgrounded-but-not-navigating tab (e.g. the user alt-tabbed) can also
 * read as "hidden" here, which means a genuine stale-chunk 404 in a
 * backgrounded tab is deliberately left unhandled rather than reloaded out
 * from under the user — the next navigation attempt in that route re-runs
 * `factory()` and gets another chance to detect a real 404 once the tab is
 * foregrounded again.
 */
function isLikelyNavigationAbort(error: unknown): boolean {
  if (pageIsUnloading || navigationAwayStarted) {
    return true;
  }
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'
  ) {
    return true;
  }
  return error instanceof DOMException && error.name === 'AbortError';
}

// sessionStorage can throw (private browsing, quota exceeded); this flag is
// best-effort recovery bookkeeping, not correctness-critical, so failures to
// read/write it are silently ignored rather than breaking the reload flow.
function getReloadFlag(): string | null {
  try {
    return sessionStorage.getItem(RELOAD_KEY);
  } catch {
    return null;
  }
}

function setReloadFlag(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, 'true');
  } catch {
    // Ignore — best-effort.
  }
}

function removeReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // Ignore — best-effort.
  }
}

/**
 * Wraps React.lazy() to recover from stale-chunk 404s after a new deployment.
 *
 * When the browser has a long-lived tab open and the app redeploys, old chunk
 * URLs (content-hashed by Vite) no longer exist on the CDN. React.lazy()
 * dynamic imports then 404, which propagates as an unhandled rejection and
 * eventually surfaces as "Uncaught Error: Missing theme." from Tamagui because
 * React aborts the render tree before ThemeProvider finishes mounting.
 *
 * Strategy: on the first chunk-load failure per browser session, reload the
 * page (which fetches fresh HTML → fresh chunk URLs). A sessionStorage flag
 * prevents reload loops if the chunk is genuinely absent even after a refresh.
 *
 * That reload must NOT fire when the import instead rejected because the
 * user navigated away mid-load (see `isLikelyNavigationAbort` above) — doing
 * so yanks the user back to the page they just left, interrupting the
 * navigation they actually wanted.
 */
export function lazyWithRetry<T extends React.ComponentType>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(() => {
    // Suppress CSS-only preload errors from Vite's chunk-loading runtime.
    //
    // When Playwright (Chromium) serves a production build via `vite preview`,
    // Vite's runtime creates `<link rel="preload" as="style" crossOrigin="">` for
    // lazy-chunk CSS. Chromium's CORS preflight for that preload link fires
    // `onerror` even when the server sends `Access-Control-Allow-Origin: *`.
    // This triggers the `vite:preloadError` cancelable event on `window`.
    //
    // Canceling it (event.preventDefault()) tells Vite NOT to rethrow the error,
    // which lets `factory()` resolve normally. Vite has a separate stylesheet-
    // injection mechanism (`<link rel="stylesheet">`) that runs independently of
    // the preload, so the CSS still loads — just slightly later.
    //
    // JS module 404s (stale-chunk scenario) are NOT suppressed: their error
    // message does not contain "preload CSS", so they still trigger the reload
    // flow below.
    const handlePreloadError = (event: Event) => {
      const err = (event as CustomEvent & { payload?: unknown }).payload;
      if (err instanceof Error && err.message.includes('preload CSS')) {
        event.preventDefault();
      }
    };
    window.addEventListener('vite:preloadError', handlePreloadError);

    return factory()
      .then((module) => {
        window.removeEventListener('vite:preloadError', handlePreloadError);
        // Successful load: clear any prior retry flag so future chunk failures
        // (e.g. after another deployment) can trigger a fresh reload.
        removeReloadFlag();
        return module;
      })
      .catch((error: unknown) => {
        window.removeEventListener('vite:preloadError', handlePreloadError);
        if (isLikelyNavigationAbort(error)) {
          // Not a stale-chunk 404 — the user navigated away mid-load. Let
          // the navigation they actually wanted proceed instead of yanking
          // them back to the page they just left.
          throw error;
        }
        const alreadyRetried = getReloadFlag() === 'true';
        if (!alreadyRetried) {
          setReloadFlag();
          window.location.reload();
          // Never-settling promise keeps React suspended while the reload fires.
          return new Promise<never>((_resolve) => {
            return;
          });
        }
        // Second failure: clear the flag so future navigations can retry again,
        // then let the error bubble to the nearest ErrorBoundary.
        removeReloadFlag();
        throw error;
      });
  });
}
