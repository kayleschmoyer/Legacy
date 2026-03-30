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

// Global error handlers (only in Node.js environment).
// LOGGER.error() automatically forwards to Rollbar via RollbarOutputDestination
// (added when initRollbar() runs), so no separate _globalErrorCapture callback
// is needed — that caused double-reporting (LS-1948).
const isNode = typeof process !== 'undefined' && !!process.versions?.node;
if (isNode && typeof process !== 'undefined') {
  process.on('uncaughtException', (error) => {
    LOGGER.error('Uncaught Exception', error);
  });

  process.on('unhandledRejection', (reason) => {
    const error =
      reason instanceof Error
        ? reason
        : new Error(
            typeof reason === 'string'
              ? reason
              : typeof reason === 'number' || typeof reason === 'boolean'
                ? String(reason)
                : typeof reason === 'object' && reason !== null
                  ? JSON.stringify(reason)
                  : reason === null || reason === undefined
                    ? String(reason)
                    : '[Unknown rejection reason]',
          );

    LOGGER.error('Promise rejected', error);
  });
}
