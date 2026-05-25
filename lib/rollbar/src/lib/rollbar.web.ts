/**
 * Web browser Rollbar implementation
 * Uses the rollbar npm package for browser error tracking
 */

import Rollbar from 'rollbar';
import { LOGGER } from '@legacy-sports/logging';
import {
  RollbarBreadcrumb,
  RollbarConfig,
  RollbarInterface,
  RollbarSeverity,
} from './types';
import { RollbarOutputDestination } from './RollbarOutputDestination';
import { sanitizeContext } from './sanitize-context';

/** Maximum number of breadcrumbs retained in memory. Oldest entries are dropped when the buffer is full. */
const MAX_BREADCRUMBS = 100;

class WebRollbarImplementation implements RollbarInterface {
  private rollbar: Rollbar | null = null;
  private breadcrumbs: RollbarBreadcrumb[] = [];
  private rollbarDestination: RollbarOutputDestination | null = null;
  /** Errors already reported to Rollbar — used by withRollbar to skip double-reporting. */
  private reportedErrors = new WeakSet<Error>();

  init(config: RollbarConfig): void {
    try {
      // Clamp captureRate into [0, 1]. undefined means "send everything".
      const rawRate = config.captureRate;
      const captureRate =
        typeof rawRate === 'number' && Number.isFinite(rawRate)
          ? Math.min(1, Math.max(0, rawRate))
          : 1;
      this.rollbar = new Rollbar({
        accessToken: config.accessToken,
        environment: config.environment,
        // Default to false: browser window.onerror / onunhandledrejection are already
        // handled by React ErrorBoundary → LOGGER.error → RollbarOutputDestination.
        // Letting Rollbar's own hooks run too caused double-reporting (LS-1948).
        captureUncaught: config.captureUncaught ?? false,
        captureUnhandledRejections: config.captureUnhandledRejections ?? false,
        verbose: config.verbose ?? false,
        maxItems: config.maxItems ?? 50,
        itemsPerMinute: config.itemsPerMinute ?? 25,
        payload: {
          code_version: config.release,
        },
        // Filter out browser-noise errors that are not actionable:
        // - AbortError: thrown by fetch() when a request is cancelled on
        //   navigation or component unmount (LS-502). This is expected browser
        //   behaviour, not a bug.
        // - ResizeObserver loop: a benign browser warning, not an app error.
        // - "Failed to fetch": transient network errors caused by connectivity
        //   drops, browser extension interference, or tab backgrounding (LS-900).
        //   Apollo RetryLink already retries these; logging them is noise.
        // - "WebSocket error" / "WebSocket closed": transient network errors on
        //   the WebSocket connection (LS-978 / LS-993). Browsers do not expose
        //   error details for WebSocket onerror events. The WebSocketClient
        //   auto-reconnects; logging these is noise.
        // - "Cross-Origin-Opener-Policy": Google Identity Services popup flow
        //   generates repeated COOP warnings when polling window.closed on the
        //   Google accounts popup (LS-1480). These are browser-level warnings
        //   from Google's own script, not actionable from our side. Auth still
        //   completes via postMessage fallback. Without this filter, the COOP
        //   spam exhausts maxItems/itemsPerMinute and silently drops real errors.
        checkIgnore: (_isUncaught: boolean, args: unknown[]) => {
          // Client-side sampling: drop (1 - captureRate) of items before they
          // reach Rollbar. Rollbar.js has no built-in sample-rate option, so
          // we implement it here. captureRate === 1 means "send everything",
          // 0 means "drop everything". Applied BEFORE the noise filters so
          // sampling doesn't waste budget on ignored-anyway errors.
          if (captureRate < 1 && Math.random() >= captureRate) {
            return true;
          }
          const err = args[0];
          if (err instanceof Error && err.name === 'AbortError') {
            return true;
          }
          if (err instanceof Error && err.message === 'Failed to fetch') {
            return true;
          }
          if (err instanceof Error && err.message === 'WebSocket error') {
            return true;
          }
          if (err instanceof Error && err.message === 'WebSocket closed') {
            return true;
          }
          if (typeof err === 'string' && err.includes('ResizeObserver loop')) {
            return true;
          }
          if (
            typeof err === 'string' &&
            err.includes('Cross-Origin-Opener-Policy')
          ) {
            return true;
          }
          if (
            err instanceof Error &&
            err.message.includes('Cross-Origin-Opener-Policy')
          ) {
            return true;
          }
          return false;
        },
      });
      LOGGER.info('Rollbar initialized for Web environment', {
        environment: config.environment,
        accessToken: config.accessToken ? 'SET' : 'NOT_SET',
        release: config.release ?? 'NOT_SET',
      });

      // Route all LOGGER.error / LOGGER.fatal calls to Rollbar automatically.
      if (this.rollbarDestination) {
        LOGGER.removeDestination(this.rollbarDestination);
      }
      this.rollbarDestination = new RollbarOutputDestination(
        this.captureError.bind(this),
      );
      LOGGER.addDestination(this.rollbarDestination);
    } catch (error) {
      LOGGER.error(
        'Failed to initialize Rollbar',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  captureError(
    error: Error,
    context?: Record<string, unknown>,
    severity: RollbarSeverity = 'error',
  ): void {
    try {
      if (!this.rollbar) {
        LOGGER.warn('Rollbar not initialized, skipping error capture', {
          error: error.message,
        });
        return;
      }
      const safeContext = context ? sanitizeContext(context) : undefined;
      const breadcrumbContext =
        this.breadcrumbs.length > 0
          ? { breadcrumbs: this.breadcrumbs.slice() }
          : {};
      this.breadcrumbs = [];
      const payload = {
        ...breadcrumbContext,
        ...(safeContext ?? {}),
      };
      switch (severity) {
        case 'warning':
          this.rollbar.warning(error, payload);
          break;
        case 'info':
          this.rollbar.info(error, payload);
          break;
        default:
          this.rollbar.error(error, payload);
      }
      this.reportedErrors.add(error);
    } catch (captureError) {
      LOGGER.error(
        'Failed to capture error in Rollbar',
        captureError instanceof Error
          ? captureError
          : new Error(String(captureError)),
      );
      LOGGER.error('Original error was:', error);
    }
  }

  addBreadcrumb(breadcrumb: RollbarBreadcrumb): void {
    // Buffer breadcrumbs locally; they are attached to the next captureError call.
    // Do NOT call rollbar.log() here — each log() counts as a rated item and
    // causes "item per minute limit reached" when breadcrumbs are added frequently.
    // Ring buffer: drop the oldest entry when the cap is reached to prevent
    // unbounded memory growth in long-running web sessions (LS-939).
    if (this.breadcrumbs.length >= MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
    this.breadcrumbs.push(breadcrumb);
  }

  withRollbar<TArgs extends unknown[], TResult>(
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      try {
        const result = await handler(...args);
        return result;
      } catch (error) {
        if (error instanceof Error) {
          if (!this.reportedErrors.has(error)) {
            this.captureError(error, {
              handler: handler.name,
              args: args.length,
            });
          }
        } else {
          this.captureError(new Error(String(error)), {
            handler: handler.name,
            args: args.length,
          });
        }
        throw error;
      }
    };
  }

  getRollbarConfigFromEnv(): RollbarConfig | null {
    // process.env.VITE_ROLLBAR_ACCESS_TOKEN is statically replaced by Vite's
    // `define` config at build time (vite.config.mts).  The bare
    // ROLLBAR_ACCESS_TOKEN fallback is kept for test/SSR environments.
    const accessToken =
      process.env['VITE_ROLLBAR_ACCESS_TOKEN'] ||
      process.env['ROLLBAR_ACCESS_TOKEN'];

    const environment = process.env['NODE_ENV'] || 'development';

    if (!accessToken) {
      LOGGER.warn(
        'ROLLBAR_ACCESS_TOKEN not set, Rollbar will not be initialized',
      );
      return null;
    }

    const release =
      process.env['VITE_COMMIT_SHA'] ||
      process.env['VITE_APP_VERSION'] ||
      undefined;

    // Client-side sample rate (LS-2447). Statically replaced by Vite's
    // `define` config at build time like the other VITE_* vars above.
    const rawCaptureRate = process.env.VITE_ROLLBAR_CAPTURE_RATE;
    const trimmedCaptureRate = rawCaptureRate?.trim();
    let captureRate: number | undefined;
    if (trimmedCaptureRate !== undefined && trimmedCaptureRate !== '') {
      const parsed = Number(trimmedCaptureRate);
      if (Number.isFinite(parsed)) {
        captureRate = Math.min(1, Math.max(0, parsed));
      }
    }

    return {
      accessToken,
      environment,
      captureUncaught: true,
      captureUnhandledRejections: true,
      verbose: environment === 'development',
      release,
      captureRate,
    };
  }
}

// Export singleton instance
export const rollbar = new WebRollbarImplementation();
