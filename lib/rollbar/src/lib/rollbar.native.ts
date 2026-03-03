/**
 * React Native Rollbar implementation
 * Uses the rollbar npm package for mobile error tracking
 * (@rollbar/react-native can be used for deeper integration in the future)
 */

import Rollbar from 'rollbar';
import { LOGGER } from '@legacy-sports/logging';
import { RollbarBreadcrumb, RollbarConfig, RollbarInterface } from './types';
import { sanitizeSentryContext } from './sanitize-context';

class ReactNativeRollbarImplementation implements RollbarInterface {
  private rollbar: Rollbar | null = null;

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
      LOGGER.info('Rollbar initialized for React Native environment', {
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
      this.rollbar.error(error, safeContext ?? {});
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
    const isDev = process.env['NODE_ENV'] === 'development';
    const accessToken = process.env['ROLLBAR_ACCESS_TOKEN'] ?? '';
    const environment = isDev ? 'development' : 'production';

    if (!accessToken) {
      LOGGER.warn(
        'ROLLBAR_ACCESS_TOKEN not set, Rollbar will not be initialized',
      );
      return null;
    }

    const release =
      process.env['APP_VERSION'] ||
      process.env['EXPO_PUBLIC_APP_VERSION'] ||
      undefined;

    return {
      accessToken,
      environment,
      captureUncaught: true,
      captureUnhandledRejections: true,
      verbose: isDev,
      release,
    };
  }
}

// Export singleton instance
export const sentry = new ReactNativeRollbarImplementation();
