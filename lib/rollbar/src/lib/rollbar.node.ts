/**
 * Node.js/Lambda Rollbar implementation
 * Uses the rollbar npm package for server-side error tracking
 */

import Rollbar from 'rollbar';
import { LOGGER } from '@legacy-sports/logging';
import { RollbarBreadcrumb, RollbarConfig, RollbarInterface } from './types';
import { sanitizeSentryContext } from './sanitize-context';

class NodeRollbarImplementation implements RollbarInterface {
  private rollbar: Rollbar | null = null;
  /** In-memory breadcrumb log (Rollbar telemetry handles this internally but we keep compat). */
  private breadcrumbs: RollbarBreadcrumb[] = [];

  init(config: RollbarConfig): void {
    try {
      this.rollbar = new Rollbar({
        accessToken: config.accessToken,
        environment: config.environment,
        captureUncaught: config.captureUncaught ?? true,
        captureUnhandledRejections: config.captureUnhandledRejections ?? true,
        verbose: config.verbose ?? false,
        payload: {
          code_version: config.release,
        },
      });
      LOGGER.info('Rollbar initialized for Node.js environment', {
        environment: config.environment,
        accessToken: config.accessToken ? 'SET' : 'NOT_SET',
        release: config.release ?? 'NOT_SET',
      });
    } catch (error) {
      LOGGER.error('Failed to initialize Rollbar', error as Error);
    }
  }

  captureError(error: Error, context?: Record<string, unknown>): void {
    try {
      if (!this.rollbar) {
        LOGGER.warn('Rollbar not initialized, skipping error capture', {
          error: error.message,
        });
        return;
      }
      const safeContext = context ? sanitizeSentryContext(context) : undefined;
      this.rollbar.error(error, safeContext ?? {});
    } catch (captureError) {
      LOGGER.error('Failed to capture error in Rollbar', captureError as Error);
      LOGGER.error('Original error was:', error);
    }
  }

  addBreadcrumb(breadcrumb: RollbarBreadcrumb): void {
    // Rollbar handles breadcrumbs via its internal telemetry system.
    // We store them locally for compatibility and attach to next error report.
    this.breadcrumbs.push(breadcrumb);
    if (this.rollbar) {
      this.rollbar.log(breadcrumb.message, breadcrumb.data ?? {});
    }
  }

  withSentry<TArgs extends unknown[], TResult>(
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

  getSentryConfigFromEnv(): RollbarConfig | null {
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
export const sentry = new NodeRollbarImplementation();
