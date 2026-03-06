import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import {
  formatLogEntry,
  type ILogger,
  LOG_LEVELS,
  type LogArgs,
  type LogEntry,
  type LogLevel,
  type OutputDestination,
  shouldLog,
} from './types';
import { EnvironmentVariable } from '../EnvironmentVariable';

// Console-only logger - safe for all platforms (web, mobile, server)
export class ConsoleLogger implements ILogger {
  private currentLogLevel: LogLevel;

  constructor() {
    const logLevel = getEnvVarOptional(EnvironmentVariable.LOG_LEVEL) || 'info';
    this.currentLogLevel =
      logLevel.toLowerCase() in LOG_LEVELS ? logLevel.toLowerCase() : 'info';
  }

  // Stub implementation - ConsoleLogger doesn't support dynamic destinations
  addDestination(_destination: OutputDestination): void {
    // No-op: ConsoleLogger doesn't support dynamic destinations
  }

  // Stub implementation - ConsoleLogger doesn't support dynamic destinations
  removeDestination(_destination: OutputDestination): void {
    // No-op: ConsoleLogger doesn't support dynamic destinations
  }

  // Stub implementation - ConsoleLogger doesn't support dynamic destinations
  clearDestinations(): void {
    // No-op: ConsoleLogger doesn't support dynamic destinations
  }

  // Stub implementation - ConsoleLogger doesn't support dynamic destinations
  getDestinations(): OutputDestination[] {
    return []; // ConsoleLogger doesn't support dynamic destinations
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    ...args: LogArgs
  ): string {
    const entry: LogEntry = {
      level,
      message,
      args,
      timestamp: new Date(),
    };
    return formatLogEntry(entry);
  }

  debug(message: string, ...args: LogArgs): void {
    if (!shouldLog('debug', this.currentLogLevel)) return;
    const formattedMessage = this.formatMessage('debug', message, ...args);
    console.debug(formattedMessage);
  }

  info(message: string, ...args: LogArgs): void {
    if (!shouldLog('info', this.currentLogLevel)) return;
    const formattedMessage = this.formatMessage('info', message, ...args);
    console.info(formattedMessage);
  }

  warn(message: string, ...args: LogArgs): void {
    if (!shouldLog('warn', this.currentLogLevel)) return;
    const formattedMessage = this.formatMessage('warn', message, ...args);
    console.warn(formattedMessage);
  }

  error(message: string, ...args: LogArgs): void {
    if (!shouldLog('error', this.currentLogLevel)) return;
    const formattedMessage = this.formatMessage('error', message, ...args);
    console.error(formattedMessage);
  }

  fatal(message: string, ...args: LogArgs): void {
    if (!shouldLog('fatal', this.currentLogLevel)) return;
    const formattedMessage = this.formatMessage('fatal', message, ...args);
    console.error(formattedMessage);
  }
}
