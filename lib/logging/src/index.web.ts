import { createConsoleLogger } from './lib/factories.web';

// Export console-only logger for web environments
export const LOGGER = createConsoleLogger();

// Export safe components for web (no file system dependencies)
export { Logger } from './lib/Logger';
export { createConsoleLogger, createCustomLogger } from './lib/factories.web';
export { ConsoleOutputDestination } from './lib/destinations';
export type {
  ILogger,
  LoggerConfig,
  LogEntry,
  LogLevel,
  LogArgs,
  OutputDestination,
} from './lib/types';
