/**
 * React Native Rollbar implementation
 * Uses the rollbar npm package for mobile error tracking
 * (@rollbar/react-native can be used for deeper integration in the future)
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
import { DEFAULT_DEDUPE_WINDOW_MS, RollbarDeduper } from './dedupe';

/** Maximum number of breadcrumbs retained in memory. Oldest entries are dropped when the buffer is full. */
const MAX_BREADCRUMBS = 100;

/** Hermes release-build frame filename, e.g. `address at index.android.bundle`. */
const HERMES_FRAME_FILENAME = /^address at (.+\.(?:js)?bundle)$/;

interface RollbarFrame {
  filename?: string;
}

interface RollbarTracePayload {
  body?: {
    trace?: { frames?: RollbarFrame[] };
    trace_chain?: { frames?: RollbarFrame[] }[];
  };
}

/**
 * Rewrites Hermes frame filenames (`address at index.android.bundle`) to the
 * `minified_url` the CI sourcemap upload is keyed by
 * (`app://android/index.android.bundle`, see
 * .github/actions/rollbar-sourcemap-upload), so Rollbar can apply the uploaded
 * Hermes sourcemap. Without this every release crash stays an unreadable
 * bytecode offset (LS-9249).
 */
export function rewriteHermesFrameFilenames(
  payload: RollbarTracePayload,
): void {
  const traces = [
    ...(payload.body?.trace ? [payload.body.trace] : []),
    ...(payload.body?.trace_chain ?? []),
  ];
  for (const trace of traces) {
    for (const frame of trace.frames ?? []) {
      const match = frame.filename?.match(HERMES_FRAME_FILENAME);
      if (match) {
        const bundle = match[1];
        const os = bundle.includes('android') ? 'android' : 'ios';
        frame.filename = `app://${os}/${bundle}`;
      }
    }
  }
}

class ReactNativeRollbarImplementation implements RollbarInterface {
  private rollbar: Rollbar | null = null;
  private breadcrumbs: RollbarBreadcrumb[] = [];
  private rollbarDestination: RollbarOutputDestination | null = null;
  /** Errors already reported to Rollbar — used by withRollbar to skip double-reporting. */
  private reportedErrors = new WeakSet<Error>();
  /**
   * Collapses bursts of identical items, keyed by `severity + ' ' + message`,
   * so one repeating client-side error (a websocket give-up loop, a GraphQL
   * error burst) can't exhaust the `maxItems` / `itemsPerMinute` budget and
   * trip Rollbar's own "ignoring errors until reset" notices, masking
   * whatever real errors follow in the same session (LS-8764). Mirrors the
   * Node implementation's de-duplication (LS-8343), which this platform
   * never had.
   */
  private deduper = new RollbarDeduper();

  init(config: RollbarConfig): void {
    try {
      this.deduper.configure(config.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS);
      this.rollbar = new Rollbar({
        accessToken: config.accessToken,
        environment: config.environment,
        // Default to false: React Native's ErrorBoundary → LOGGER.error →
        // RollbarOutputDestination already forwards errors. Letting Rollbar's own
        // hooks run too caused double-reporting (LS-1948).
        captureUncaught: config.captureUncaught ?? false,
        captureUnhandledRejections: config.captureUnhandledRejections ?? false,
        verbose: config.verbose ?? false,
        maxItems: config.maxItems ?? 50,
        itemsPerMinute: config.itemsPerMinute ?? 25,
        payload: {
          code_version: config.release,
          // Symbolicate release crashes against the Hermes sourcemap CI
          // uploads under the same version (LS-9249).
          client: {
            javascript: {
              source_map_enabled: true,
              code_version: config.release,
            },
          },
        },
        transform: (payload) => {
          rewriteHermesFrameFilenames(payload);
        },
      });
      LOGGER.info('Rollbar initialized for React Native environment', {
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
      const { report, suppressed } = this.deduper.apply(
        `${severity} ${error.message}`,
        Date.now(),
      );
      if (!report) {
        // Collapsed into an already-reported item this window; drop silently
        // so it doesn't count against Rollbar's maxItems/itemsPerMinute budget.
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
        ...(suppressed > 0 ? { suppressedSinceLastReport: suppressed } : {}),
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
    // unbounded memory growth in long-running mobile sessions (LS-939).
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
    // Expo inlines `EXPO_PUBLIC_*` env vars into the JS bundle at build time
    // (https://docs.expo.dev/guides/environment-variables/). We deliberately
    // do NOT fall back to the bare `ROLLBAR_ACCESS_TOKEN` here: that name is
    // the server-side (post_server_item) token used by Lambdas, and pulling
    // it into the client bundle would expose privileged credentials. The
    // client token is sourced from EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN, which
    // apps/app/app.config.js aliases from VITE_ROLLBAR_ACCESS_TOKEN
    // (post_client_item) at config-load time.
    const isDev = process.env['NODE_ENV'] === 'development';
    const accessToken = process.env['EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN'] || '';
    const environment = isDev ? 'development' : 'production';

    if (!accessToken) {
      const message =
        'EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN not set, Rollbar will not be initialized';
      if (isDev) {
        LOGGER.debug(message);
      } else {
        LOGGER.warn(message);
      }
      return null;
    }

    // Prefer the commit SHA (unique per build, like web's VITE_COMMIT_SHA) over
    // the package version, which stays `0.0.1` across every build — sharing it
    // meant each build's sourcemap upload overwrote the last (LS-9249).
    const release =
      process.env['EXPO_PUBLIC_COMMIT_SHA'] ||
      process.env['EXPO_PUBLIC_APP_VERSION'] ||
      undefined;

    return {
      accessToken,
      environment,
      // Keep Rollbar's own global error hooks OFF on React Native. The `rollbar`
      // browser SDK wires these via browser-only globals
      // (window.onerror / addEventListener('unhandledrejection')) that don't
      // exist under Hermes — enabling them throws "undefined is not a function"
      // from captureUnhandledRejections during init (LS-1948). Errors are
      // already forwarded via ErrorBoundary → LOGGER.error → RollbarOutputDestination.
      captureUncaught: false,
      captureUnhandledRejections: false,
      verbose: isDev,
      release,
    };
  }
}

// Export singleton instance
export const rollbar = new ReactNativeRollbarImplementation();
