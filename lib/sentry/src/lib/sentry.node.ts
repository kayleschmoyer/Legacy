/**
 * Node.js/Lambda Sentry implementation
 * Uses @sentry/node for server-side error tracking
 */

import * as Sentry from '@sentry/node';
import { LOGGER } from '@legacy-sports/logging';
import { SentryInterface, SentryConfig, SentryBreadcrumb } from './types';

class NodeSentryImplementation implements SentryInterface {
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
          // Add Node.js specific integrations
        ],
      });
      LOGGER.info('Sentry initialized for Node.js environment', {
        environment: config.environment,
        dsn: config.dsn ? 'SET' : 'NOT_SET',
        release: config.release || 'NOT_SET',
      });
    } catch (error) {
      LOGGER.error('Failed to initialize Sentry', error as Error);
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
      LOGGER.error('Failed to capture error in Sentry', captureError as Error);
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
    const dsn = process.env.SENTRY_DSN;
    const environment =
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

    if (!dsn) {
      LOGGER.warn('SENTRY_DSN not set, Sentry will not be initialized');
      return null;
    }

    // Build release string from available version info
    const release =
      process.env.SENTRY_RELEASE ||
      process.env.APP_VERSION ||
      process.env.COMMIT_SHA ||
      undefined;

    return {
      dsn,
      environment,
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
        ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
        : 0.1,
      debug: process.env.SENTRY_DEBUG === 'true',
      release,
    };
  }
}

// Export singleton instance
export const sentry = new NodeSentryImplementation();
