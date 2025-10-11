/**
 * React Native Sentry implementation
 * Uses @sentry/react-native for mobile error tracking
 */

import * as Sentry from '@sentry/react-native';
import { LOGGER } from '@legacy-sports/logging';
import { SentryInterface, SentryConfig, SentryBreadcrumb } from './types';

class ReactNativeSentryImplementation implements SentryInterface {
  init(config: SentryConfig): void {
    try {
      Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        tracesSampleRate: config.tracesSampleRate || 0.1,
        debug: config.debug || false,
        beforeSend: config.beforeSend,
        integrations: [
          // Add React Native specific integrations as needed
          // Note: ReactNativeTracing might need different import or setup
        ],
      });
      LOGGER.info('Sentry initialized for React Native environment', {
        environment: config.environment,
        dsn: config.dsn ? 'SET' : 'NOT_SET',
      });
    } catch (error) {
      LOGGER.error('Failed to initialize Sentry', error);
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
      LOGGER.error('Failed to capture error in Sentry', captureError);
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
    // For React Native, we don't wrap with error boundaries here
    // Instead, we just add error capturing to the function
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
    // In React Native, we might get config from different sources
    // This could be from build-time environment variables or runtime config
    const isDev = process.env.NODE_ENV === 'development';
    const dsn =
      process.env.SENTRY_DSN || (isDev ? null : 'your-production-dsn');
    const environment = isDev ? 'development' : 'production';

    if (!dsn) {
      LOGGER.warn('SENTRY_DSN not set, Sentry will not be initialized');
      return null;
    }

    return {
      dsn,
      environment,
      tracesSampleRate: 0.1, // Lower sample rate for mobile
      debug: isDev,
    };
  }
}

// Export singleton instance
export const sentry = new ReactNativeSentryImplementation();
