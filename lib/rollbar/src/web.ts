/**
 * Web browser entry point for @legacy-sports/rollbar
 * Import from '@legacy-sports/rollbar/web' in web code
 */

export * from './lib/types';
export { sentry } from './lib/rollbar.web';

// Re-export convenience functions matching the legacy Sentry API for drop-in replacement
import { sentry } from './lib/rollbar.web';

export const initSentry = (config: import('./lib/types').RollbarConfig) => {
  return sentry.init(config);
};

export const captureError = (
  error: Error,
  context?: Record<string, unknown>,
) => {
  return sentry.captureError(error, context);
};

export const addBreadcrumb = (
  message: string,
  data?: Record<string, unknown>,
  level?: 'info' | 'warning' | 'error',
) => {
  return sentry.addBreadcrumb({ message, data, level });
};

export const withSentry = <TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult | Promise<TResult>,
): ((...args: TArgs) => TResult | Promise<TResult>) => {
  return sentry.withSentry(handler);
};

export const getSentryConfigFromEnv = () => {
  return sentry.getSentryConfigFromEnv();
};
