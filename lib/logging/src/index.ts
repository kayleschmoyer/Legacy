import { createConsoleLogger } from './lib/factories';

// Export console-only logger (safe for all non-server environments)
export const LOGGER = createConsoleLogger();

// Export safe components (no file system dependencies)
export { Logger } from './lib/Logger';
export { createConsoleLogger, createCustomLogger } from './lib/factories';
export { ConsoleOutputDestination } from './lib/destinations';
export type {
  ILogger,
  LoggerConfig,
  LogEntry,
  LogLevel,
  LogArgs,
  OutputDestination,
} from './lib/types';
