/**
 * React Native entry point for @legacy-sports/sentry
 * Import from '@legacy-sports/sentry/native' in React Native code
 */

export * from './lib/types';
export { sentry } from './lib/sentry.native';

// Re-export convenience functions that match the old API for backward compatibility
import { sentry } from './lib/sentry.native';

export const initSentry = (config: import('./lib/types').SentryConfig) => {
  return sentry.init(config);
};

export const captureError = (error: Error, context?: Record<string, any>) => {
  return sentry.captureError(error, context);
};

export const addBreadcrumb = (
  message: string,
  data?: Record<string, any>,
  level?: 'info' | 'warning' | 'error',
) => {
  return sentry.addBreadcrumb({ message, data, level });
};

export const withSentry = <TArgs extends any[], TResult>(
  handler: (...args: TArgs) => TResult | Promise<TResult>,
): ((...args: TArgs) => TResult | Promise<TResult>) => {
  return sentry.withSentry(handler);
};

export const getSentryConfigFromEnv = () => {
  return sentry.getSentryConfigFromEnv();
};
