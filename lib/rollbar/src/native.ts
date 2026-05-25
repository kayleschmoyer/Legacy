/**
 * React Native entry point for @legacy-sports/rollbar
 * Import from '@legacy-sports/rollbar/native' in React Native code
 */

export * from './lib/types';
export { rollbar } from './lib/rollbar.native';

import { rollbar } from './lib/rollbar.native';

export const initRollbar = (config: import('./lib/types').RollbarConfig) => {
  return rollbar.init(config);
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
): ((...args: TArgs) => Promise<TResult>) => {
  return rollbar.withRollbar(handler);
};

export const getRollbarConfigFromEnv = () => {
  return rollbar.getRollbarConfigFromEnv();
};
