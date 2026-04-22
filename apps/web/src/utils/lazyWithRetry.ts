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
  return React.lazy(() =>
    factory()
      .then((module) => {
        // Successful load: clear any prior retry flag so future chunk failures
        // (e.g. after another deployment) can trigger a fresh reload.
        sessionStorage.removeItem(RELOAD_KEY);
        return module;
      })
      .catch((error: unknown) => {
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
      }),
  );
}
