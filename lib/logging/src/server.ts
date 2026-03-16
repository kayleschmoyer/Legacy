import { createServerLogger } from './lib/factories.server';

// Export the server logger (console + file) for server environments
export const LOGGER = createServerLogger();

// Export all components for advanced usage
export { Logger } from './lib/Logger';
export { createConsoleLogger, createCustomLogger } from './lib/factories';
export { createServerLogger } from './lib/factories.server';
export { ConsoleOutputDestination } from './lib/destinations';
export { FileOutputDestination } from './lib/destinations/server';
export type {
  ILogger,
  LoggerConfig,
  LogEntry,
  LogLevel,
  LogArgs,
  OutputDestination,
} from './lib/types';

// Callback registered by error-tracking libraries (e.g. rollbar, sentry) at
// init time. Avoids making logging depend on those packages (which would create
// a circular dependency since they already depend on logging).
type ErrorCaptureFn = (error: Error) => void;
let _globalErrorCapture: ErrorCaptureFn | null = null;

/**
 * Register a function to be called alongside LOGGER.error whenever an
 * uncaught exception or unhandled rejection occurs. Intended for use by
 * error-tracking libraries (rollbar, sentry) so process crashes are always
 * reported even if the crash happens before the lambda handler runs.
 *
 * Call with `null` to unregister.
 */
export function registerGlobalErrorCapture(fn: ErrorCaptureFn | null): void {
  _globalErrorCapture = fn;
}

// Global error handlers (only in Node.js environment)
const isNode = typeof process !== 'undefined' && !!process.versions?.node;
if (isNode && typeof process !== 'undefined') {
  process.on('uncaughtException', (error) => {
    LOGGER.error('Uncaught Exception', error.message, error.stack);
    _globalErrorCapture?.(error);
  });

  process.on('unhandledRejection', (reason) => {
    let reasonString: string;
    if (reason instanceof Error) {
      reasonString = reason.message;
    } else if (typeof reason === 'string') {
      reasonString = reason;
    } else if (typeof reason === 'number' || typeof reason === 'boolean') {
      reasonString = String(reason);
    } else if (typeof reason === 'object' && reason !== null) {
      reasonString = JSON.stringify(reason);
    } else if (reason === null || reason === undefined) {
      reasonString = String(reason);
    } else {
      reasonString = '[Unknown rejection reason]';
    }

    const error = reason instanceof Error ? reason : new Error(reasonString);

    LOGGER.error('Promise rejected', reasonString);
    _globalErrorCapture?.(error);
  });
}
