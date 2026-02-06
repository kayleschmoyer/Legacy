/**
 * Web Sentry implementation
 * Uses @sentry/browser for web error tracking
 */

import * as Sentry from '@sentry/browser';
import { LOGGER } from '@legacy-sports/logging';
import { SentryInterface, SentryConfig, SentryBreadcrumb } from './types';

class WebSentryImplementation implements SentryInterface {
  init(config: SentryConfig): void {
    try {
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        tracesSampleRate: config.tracesSampleRate || 0.1,
        debug: config.debug || false,
        beforeSend: config.beforeSend,
        release: config.release,
        integrations: [
          // Add web-specific integrations as needed
        ],
      });
      LOGGER.info('Sentry initialized for Web environment', {
        environment: config.environment,
        dsn: config.dsn ? 'SET' : 'NOT_SET',
        release: config.release || 'NOT_SET',
      });
    } catch (error) {
      LOGGER.error(
        'Failed to initialize Sentry',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  captureError(error: Error, context?: Record<string, any>): void {
    try {
      if (context) {
        Sentry.withScope((scope) => {
          Object.keys(context).forEach((key) => {
            scope.setContext(key, context[key]);
          });
          Sentry.captureException(error);
        });
      } else {
        Sentry.captureException(error);
      }
    } catch (captureError) {
      LOGGER.error(
        'Failed to capture error in Sentry',
        captureError instanceof Error
          ? captureError
          : new Error(String(captureError)),
      );
      LOGGER.error('Original error was:', error);
    }
  }

  addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    Sentry.addBreadcrumb({
      message: breadcrumb.message,
      data: breadcrumb.data,
      level: breadcrumb.level || 'info',
      timestamp: Date.now() / 1000,
    });
  }

  withSentry<TArgs extends any[], TResult>(
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

  getSentryConfigFromEnv(): SentryConfig | null {
    // In web, we get config from build-time environment variables
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
    const environment = process.env.NODE_ENV || 'development';

    if (!dsn) {
      LOGGER.warn('SENTRY_DSN not set, Sentry will not be initialized');
      return null;
    }

    // Build release string from available version info
    const release =
      process.env.VITE_COMMIT_SHA ||
      process.env.VITE_APP_VERSION ||
      process.env.NEXT_PUBLIC_COMMIT_SHA ||
      undefined;

    return {
      dsn,
      environment,
      tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
        ? parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE)
        : 0.1,
      debug: process.env.NODE_ENV === 'development',
      release,
    };
  }
}

// Export singleton instance
export const sentry = new WebSentryImplementation();
