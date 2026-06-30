import { LOGGER } from '@legacy-sports/logging';

/**
 * Registers a global JS error handler for the React Native runtime.
 *
 * React's ErrorBoundary only catches render-time errors. Errors thrown in
 * async callbacks, setTimeout, or unhandled promise rejections escape the
 * component tree and crash the app on native. ErrorUtils.setGlobalHandler is
 * the Hermes/JSC equivalent of window.onerror.
 *
 * Rollbar's captureUncaught/captureUnhandledRejections hooks are disabled
 * because the browser SDK wires them via window.onerror (absent under Hermes,
 * crashes on init — LS-1948). This function fills that gap by forwarding to
 * LOGGER.error, which auto-routes to Rollbar via RollbarOutputDestination.
 */
export function installGlobalErrorCapture(): void {
  const prev = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    LOGGER.error(
      'Uncaught JS error',
      error instanceof Error ? error : new Error(String(error)),
      { isFatal: isFatal ?? false },
    );

    if (__DEV__) {
      // Keep the Metro red box working in development
      prev(error, isFatal);
    }
  });
}
