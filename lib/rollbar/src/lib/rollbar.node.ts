/**
 * Node.js/Lambda Rollbar implementation
 * Uses the rollbar npm package for server-side error tracking
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

class NodeRollbarImplementation implements RollbarInterface {
  private rollbar: Rollbar | null = null;
  /** In-memory breadcrumb log (Rollbar telemetry handles this internally but we keep compat). */
  private breadcrumbs: RollbarBreadcrumb[] = [];
  private rollbarDestination: RollbarOutputDestination | null = null;

  init(config: RollbarConfig): void {
    try {
      this.rollbar = new Rollbar({
        accessToken: config.accessToken,
        environment: config.environment,
        captureUncaught: config.captureUncaught ?? true,
        captureUnhandledRejections: config.captureUnhandledRejections ?? true,
        verbose: config.verbose ?? false,
        maxItems: config.maxItems ?? 50,
        itemsPerMinute: config.itemsPerMinute ?? 25,
        payload: {
          code_version: config.release,
        },
      });
      LOGGER.info('Rollbar initialized for Node.js environment', {
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
      LOGGER.error('Failed to initialize Rollbar', error as Error);
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
    } catch (captureError) {
      LOGGER.error('Failed to capture error in Rollbar', captureError as Error);
      LOGGER.error('Original error was:', error);
    }
  }

  addBreadcrumb(breadcrumb: RollbarBreadcrumb): void {
    // Buffer breadcrumbs locally; they are attached to the next captureError call.
    // Do NOT call rollbar.log() here — each log() counts as a rated item and
    // causes "item per minute limit reached" when breadcrumbs are added frequently.
    // Ring buffer: drop the oldest entry when the cap is reached to prevent
    // unbounded memory growth in long-running Lambdas or web sessions (LS-939).
    if (this.breadcrumbs.length >= MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
    this.breadcrumbs.push(breadcrumb);
  }

  withRollbar<TArgs extends unknown[], TResult>(
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ): (...args: TArgs) => TResult | Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      try {
        const result = await handler(...args);
        return result;
      } catch (error) {
        this.captureError(error as Error, {
          handler: handler.name,
          args: args.length,
        });
        throw error;
      }
    };
  }

  getRollbarConfigFromEnv(): RollbarConfig | null {
    const accessToken = process.env['ROLLBAR_ACCESS_TOKEN'];
    const environment =
      process.env['ROLLBAR_ENVIRONMENT'] ||
      process.env['NODE_ENV'] ||
      'development';

    if (!accessToken) {
      LOGGER.warn(
        'ROLLBAR_ACCESS_TOKEN not set, Rollbar will not be initialized',
      );
      return null;
    }

    const release =
      process.env['ROLLBAR_RELEASE'] ||
      process.env['APP_VERSION'] ||
      process.env['COMMIT_SHA'] ||
      undefined;

    return {
      accessToken,
      environment,
      captureUncaught: true,
      captureUnhandledRejections: true,
      verbose: process.env['ROLLBAR_VERBOSE'] === 'true',
      release,
    };
  }
}

// Export singleton instance
export const rollbar = new NodeRollbarImplementation();
