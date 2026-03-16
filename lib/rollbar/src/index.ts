/**
 * Default export for Node.js/Lambda environments.
 * For React Native and Web, import from specific entry points:
 * - @legacy-sports/rollbar/native for React Native
 * - @legacy-sports/rollbar/web for Web
 */

export * from './lib/types';
export { rollbar } from './lib/rollbar.node';

import { registerGlobalErrorCapture } from '@legacy-sports/logging/server';
import { rollbar } from './lib/rollbar.node';

export const initRollbar = (config: import('./lib/types').RollbarConfig) => {
  rollbar.init(config);
  registerGlobalErrorCapture((error) => {
    rollbar.captureError(error);
  });
};

export const captureError = (
  error: Error,
  context?: Record<string, unknown>,
  severity?: import('./lib/types').RollbarSeverity,
) => {
  return rollbar.captureError(error, context, severity);
};

export const captureWarning = (
  error: Error,
  context?: Record<string, unknown>,
) => {
  return rollbar.captureError(error, context, 'warning');
};

export const captureInfo = (
  error: Error,
  context?: Record<string, unknown>,
) => {
  return rollbar.captureError(error, context, 'info');
};

export const addBreadcrumb = (
  message: string,
  data?: Record<string, unknown>,
  level?: 'info' | 'warning' | 'error',
) => {
  return rollbar.addBreadcrumb({ message, data, level });
};

export const withRollbar = <TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult | Promise<TResult>,
): ((...args: TArgs) => TResult | Promise<TResult>) => {
  return rollbar.withRollbar(handler);
};

export const getRollbarConfigFromEnv = () => {
  return rollbar.getRollbarConfigFromEnv();
};
