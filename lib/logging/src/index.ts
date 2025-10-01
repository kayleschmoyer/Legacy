import { createServerLogger } from './lib/factories';

// Export the server logger (console + file) for server environments
export const LOGGER = createServerLogger();

// Export all components for advanced usage
export { Logger } from './lib/Logger';
export {
  createConsoleLogger,
  createServerLogger,
  createCustomLogger,
} from './lib/factories';
export {
  ConsoleOutputDestination,
  FileOutputDestination,
} from './lib/destinations';
export type {
  ILogger,
  LoggerConfig,
  LogEntry,
  LogLevel,
  LogArgs,
  OutputDestination,
} from './lib/types';

// Global error handlers (only in Node.js environment)
const isNode = typeof process !== 'undefined' && !!process.versions?.node;
if (isNode && typeof process !== 'undefined') {
  process.on('uncaughtException', (error) => {
    LOGGER.error('Uncaught Exception', error.message, error.stack);
  });

  process.on('unhandledRejection', (reason) => {
    let reasonString: string;
    if (reason instanceof Error) {
      reasonString = reason.message;
    } else if (typeof reason === 'string') {
      reasonString = reason;
    } else if (typeof reason === 'number' || typeof reason === 'boolean') {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      reasonString = String(reason);
    } else if (typeof reason === 'object' && reason !== null) {
      reasonString = JSON.stringify(reason);
    } else if (reason === null || reason === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      reasonString = String(reason);
    } else {
      reasonString = '[Unknown rejection reason]';
    }

    LOGGER.error('Promise rejected', reasonString);
  });
}
