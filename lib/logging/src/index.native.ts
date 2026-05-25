import { createConsoleLogger } from './lib/factories.native';

// Export console-only logger for mobile/web environments
export const LOGGER = createConsoleLogger();

// Export safe components for mobile/web (no file system dependencies)
export { Logger } from './lib/Logger';
export {
  createConsoleLogger,
  createCustomLogger,
} from './lib/factories.native';
export { ConsoleOutputDestination } from './lib/destinations';
export {
  DeviceFileOutputDestination,
  type DeviceFileOutputDestinationOptions,
} from './lib/destinations/DeviceFileOutputDestination.native';
export type {
  ILogger,
  LoggerConfig,
  LogEntry,
  LogLevel,
  LogArgs,
  OutputDestination,
} from './lib/types';
