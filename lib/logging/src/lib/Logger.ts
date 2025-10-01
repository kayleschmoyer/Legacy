import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import {
  type ILogger,
  type LogArgs,
  type LogEntry,
  type LoggerConfig,
  type LogLevel,
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
        console.error(`Error writing to log destination:`, error);
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
