/**
 * React Native entry point for @legacy-sports/rollbar
 * Import from '@legacy-sports/rollbar/native' in React Native code
 */

export * from './lib/types';
export { sentry } from './lib/rollbar.native';

// Re-export convenience functions matching the legacy Sentry API for drop-in replacement
import { sentry } from './lib/rollbar.native';

export const initSentry = (config: import('./lib/types').RollbarConfig) => {
  return sentry.init(config);
};

export const captureError = (
  error: Error,
  context?: Record<string, unknown>,
  severity?: import('./lib/types').RollbarSeverity,
) => {
  return sentry.captureError(error, context, severity);
};

export const captureWarning = (
  error: Error,
  context?: Record<string, unknown>,
) => {
  return sentry.captureError(error, context, 'warning');
};

export const captureInfo = (
  error: Error,
  context?: Record<string, unknown>,
) => {
  return sentry.captureError(error, context, 'info');
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
