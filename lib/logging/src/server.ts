import { createServerLogger } from './lib/factories.server';
import { installGlobalErrorHandlers } from './lib/global-error-handlers';
import { routeProcessWarnings } from './lib/process-warnings';

// Export the server logger (console + file) for server environments
export const LOGGER = createServerLogger();

// Export all components for advanced usage
export { Logger } from './lib/Logger';
export { createConsoleLogger, createCustomLogger } from './lib/factories';
export { createServerLogger } from './lib/factories.server';
export { ConsoleOutputDestination } from './lib/destinations';
export { FileOutputDestination } from './lib/destinations/server';
export { emitMetric } from './lib/metrics';
export { routeProcessWarnings } from './lib/process-warnings';
export {
  installGlobalErrorHandlers,
  FATAL_EXIT_GRACE_MS,
} from './lib/global-error-handlers';
export type {
  ILogger,
  LoggerConfig,
  LogEntry,
  LogLevel,
  LogArgs,
  OutputDestination,
} from './lib/types';
export type {
  EmitMetricOptions,
  MetricDimensions,
  MetricUnit,
} from './lib/metrics';

// Global error handlers (only in Node.js environment).
// LOGGER.error() automatically forwards to Rollbar via RollbarOutputDestination
// (added when initRollbar() runs), so no separate _globalErrorCapture callback
// is needed — that caused double-reporting (LS-1948).
const isNode = typeof process !== 'undefined' && !!process.versions?.node;
if (isNode && typeof process !== 'undefined') {
  // Log, then exit non-zero — a log-only listener makes crashes exit 0
  // (LS-10565). See installGlobalErrorHandlers for the Lambda carve-out.
  installGlobalErrorHandlers(LOGGER);

  // Node prints process warnings (e.g. the AWS SDK NodeVersionSupportWarning)
  // to stderr, which Lambda's JSON log format records at ERROR. Route them
  // through LOGGER at WARN instead (LS-10338).
  routeProcessWarnings(LOGGER);
}
