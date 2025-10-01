import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import {
  formatLogEntry,
  type ILogger,
  LOG_LEVELS,
  type LogArgs,
  type LogEntry,
  type LogLevel,
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
