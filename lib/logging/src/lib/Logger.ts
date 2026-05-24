import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import {
  type ILogger,
  type LogArgs,
  type LogEntry,
  type LoggerConfig,
  type LogLevel,
  type OutputDestination,
  shouldLog,
} from './types';
import { EnvironmentVariable } from '../EnvironmentVariable';

export class Logger implements ILogger {
  private config: LoggerConfig;
  private minimumLevel: LogLevel;

  constructor(config: LoggerConfig) {
    this.config = config;

    // Get minimum log level from environment or config
    const envLogLevel =
      getEnvVarOptional(EnvironmentVariable.LOG_LEVEL) || 'info';
    this.minimumLevel = config.minimumLevel || envLogLevel;
  }

  // Method to add additional output destinations at runtime
  addDestination(destination: LoggerConfig['outputDestinations'][0]): void {
    this.config.outputDestinations.push(destination);
  }

  // Method to remove a specific output destination
  removeDestination(destination: LoggerConfig['outputDestinations'][0]): void {
    const index = this.config.outputDestinations.indexOf(destination);
    if (index > -1) {
      this.config.outputDestinations.splice(index, 1);
    }
  }

  // Method to clear all output destinations
  clearDestinations(): void {
    this.config.outputDestinations = [];
  }

  // Method to get current destinations (for inspection)
  getDestinations(): OutputDestination[] {
    return [...this.config.outputDestinations];
  }

  setLevel(level: string): void {
    this.minimumLevel = level;
  }

  private logToDestinations(
    level: LogLevel,
    message: string,
    ...args: LogArgs
  ): void {
    // Check if we should log at this level
    if (!shouldLog(level, this.minimumLevel)) {
      return;
    }

    // Create log entry
    const entry: LogEntry = {
      level,
      message,
      args,
      timestamp: new Date(),
    };

    // Send to all configured output destinations
    this.config.outputDestinations.forEach((destination) => {
      try {
        // Check if destination has its own level filter
        if (destination.shouldLog && !destination.shouldLog(level)) {
          return;
        }

        destination.write(entry);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
          return;
        }
        try {
          console.error(`Error writing to log destination:`, error);
        } catch {
          // Swallow EPIPE from the fallback write as well
        }
      }
    });
  }

  debug(message: string, ...args: LogArgs): void {
    this.logToDestinations('debug', message, ...args);
  }

  info(message: string, ...args: LogArgs): void {
    this.logToDestinations('info', message, ...args);
  }

  warn(message: string, ...args: LogArgs): void {
    this.logToDestinations('warn', message, ...args);
  }

  error(message: string, ...args: LogArgs): void {
    this.logToDestinations('error', message, ...args);
  }

  fatal(message: string, ...args: LogArgs): void {
    this.logToDestinations('fatal', message, ...args);
  }
}
