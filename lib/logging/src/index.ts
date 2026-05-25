import { createConsoleLogger } from './lib/factories';

// Export console-only logger (safe for all non-server environments)
export const LOGGER = createConsoleLogger();

// Export safe components (no file system dependencies)
export { Logger } from './lib/Logger';
export { createConsoleLogger, createCustomLogger } from './lib/factories';
export { ConsoleOutputDestination } from './lib/destinations';
// Mobile-only destination — safe to re-export from the web/node entry because
// it lazy-requires `expo-file-system` only on construction (which never
// happens outside the mobile bundle).
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
