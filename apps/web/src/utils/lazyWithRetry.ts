import React from 'react';

const RELOAD_KEY = 'chunk-load-reload-attempted';

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
        sessionStorage.removeItem(RELOAD_KEY);
        return module;
      })
      .catch((error: unknown) => {
        window.removeEventListener('vite:preloadError', handlePreloadError);
        const alreadyRetried = sessionStorage.getItem(RELOAD_KEY) === 'true';
        if (!alreadyRetried) {
          sessionStorage.setItem(RELOAD_KEY, 'true');
          window.location.reload();
          // Never-settling promise keeps React suspended while the reload fires.
          return new Promise<never>((_resolve) => {
            return;
          });
        }
        // Second failure: clear the flag so future navigations can retry again,
        // then let the error bubble to the nearest ErrorBoundary.
        sessionStorage.removeItem(RELOAD_KEY);
        throw error;
      });
  });
}
