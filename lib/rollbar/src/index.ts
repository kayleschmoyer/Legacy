/**
 * Default export for Node.js/Lambda environments.
 * For React Native and Web, import from specific entry points:
 * - @legacy-sports/rollbar/native for React Native
 * - @legacy-sports/rollbar/web for Web
 */

export * from './lib/types';
export { sentry } from './lib/rollbar.node';

// Re-export convenience functions matching the legacy Sentry API for drop-in replacement
import { registerGlobalErrorCapture } from '@legacy-sports/logging';
import { sentry } from './lib/rollbar.node';

export const initSentry = (config: import('./lib/types').RollbarConfig) => {
  sentry.init(config);
  registerGlobalErrorCapture((error) => {
    sentry.captureError(error);
  });
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
