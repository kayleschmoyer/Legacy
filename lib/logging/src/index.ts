import { createConsoleLogger } from './lib/factories';

// Export console-only logger (safe for all non-server environments)
export const LOGGER = createConsoleLogger();

// Export safe components (no file system dependencies)
export { Logger } from './lib/Logger';
export { createConsoleLogger, createCustomLogger } from './lib/factories';
export { ConsoleOutputDestination } from './lib/destinations';
// Mobile-only destination. This is the web/node entry — it intentionally
// re-exports the non-native stub (DeviceFileOutputDestination.ts, always a
// no-op). Mobile builds use index.native.ts which re-exports the real
// DeviceFileOutputDestination.native.ts via Metro's platform extension priority.
export {
  DeviceFileOutputDestination,
  type DeviceFileOutputDestinationOptions,
} from './lib/destinations/DeviceFileOutputDestination';
export type {
  ILogger,
  LoggerConfig,
  LogEntry,
  LogLevel,
  LogArgs,
  OutputDestination,
} from './lib/types';
