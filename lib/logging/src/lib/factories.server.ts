import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { Logger } from './Logger';
import { ConsoleOutputDestination } from './destinations';
import { FileOutputDestination } from './destinations/server';
import { EnvironmentVariable } from '../EnvironmentVariable';

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
