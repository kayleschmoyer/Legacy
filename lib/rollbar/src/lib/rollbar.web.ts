/**
 * Web browser Rollbar implementation
 * Uses the rollbar npm package for browser error tracking
 */

import Rollbar from 'rollbar';
import { LOGGER } from '@legacy-sports/logging';
import { RollbarBreadcrumb, RollbarConfig, RollbarInterface } from './types';
import { sanitizeSentryContext } from './sanitize-context';

class WebRollbarImplementation implements RollbarInterface {
  private rollbar: Rollbar | null = null;
  private breadcrumbs: RollbarBreadcrumb[] = [];

  init(config: RollbarConfig): void {
    try {
      this.rollbar = new Rollbar({
        accessToken: config.accessToken,
        environment: config.environment,
        captureUncaught: config.captureUncaught ?? true,
        captureUnhandledRejections: config.captureUnhandledRejections ?? true,
        verbose: config.verbose ?? false,
        // 0 = unlimited; prevents "item per minute limit reached" when errors
        // or breadcrumbs are reported in bursts.
        maxItems: config.maxItems ?? 0,
        payload: {
          code_version: config.release,
        },
      });
      LOGGER.info('Rollbar initialized for Web environment', {
        environment: config.environment,
        accessToken: config.accessToken ? 'SET' : 'NOT_SET',
        release: config.release ?? 'NOT_SET',
      });
    } catch (error) {
      LOGGER.error(
        'Failed to initialize Rollbar',
        error instanceof Error ? error : new Error(String(error)),
      );
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
      const breadcrumbContext =
        this.breadcrumbs.length > 0
          ? { breadcrumbs: this.breadcrumbs.slice() }
          : {};
      this.breadcrumbs = [];
      this.rollbar.error(error, {
        ...breadcrumbContext,
        ...(safeContext ?? {}),
      });
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
    this.breadcrumbs.push(breadcrumb);
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

    return {
      accessToken,
      environment,
      captureUncaught: true,
      captureUnhandledRejections: true,
      verbose: environment === 'development',
      release,
    };
  }
}

// Export singleton instance
export const sentry = new WebRollbarImplementation();
