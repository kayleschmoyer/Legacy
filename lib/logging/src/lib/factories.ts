import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { Logger } from './Logger';
import {
  ConsoleOutputDestination,
  FileOutputDestination,
} from './destinations';
import { EnvironmentVariable } from '../EnvironmentVariable';

// Factory function to create a console-only logger (safe for all platforms)
export function createConsoleLogger(): Logger {
  return new Logger({
    outputDestinations: [new ConsoleOutputDestination()],
  });
}

// Factory function to create a logger with console + file output (Node.js only)
export function createServerLogger(logFilePath?: string): Logger {
  const destinations = [new ConsoleOutputDestination()];

  // Add file destination if we have a file path (either passed or from environment)
  const filePath =
    logFilePath || getEnvVarOptional(EnvironmentVariable.LOG_LOCATION);
  if (filePath) {
    destinations.push(new FileOutputDestination(filePath));
  }

  return new Logger({
    outputDestinations: destinations,
  });
}

// Factory function to create a custom logger with specific destinations
export function createCustomLogger(
  ...destinations: ConstructorParameters<typeof Logger>[0]['outputDestinations']
): Logger {
  return new Logger({
    outputDestinations: destinations,
  });
}
