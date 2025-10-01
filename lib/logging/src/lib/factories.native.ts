import { Logger } from './Logger';
import { ConsoleOutputDestination } from './destinations';

// Factory function to create a console-only logger (safe for all platforms)
export function createConsoleLogger(): Logger {
  return new Logger({
    outputDestinations: [new ConsoleOutputDestination()],
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
