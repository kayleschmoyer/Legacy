import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from '../EnvironmentVariable';

// Type for log arguments
type LogArgs = (string | number | boolean | object | null | undefined)[];

// Define a universal logger interface
interface Logger {
  debug(message: string, ...args: LogArgs): void;
  info(message: string, ...args: LogArgs): void;
  warn(message: string, ...args: LogArgs): void;
  error(message: string, ...args: LogArgs): void;
  fatal(message: string, ...args: LogArgs): void;
}

// Get log level from environment or default to 'info'
const logLevel = getEnvVarOptional(EnvironmentVariable.LOG_LEVEL) || 'info';

// Log levels with numeric values for comparison
const LOG_LEVELS: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const currentLogLevel = LOG_LEVELS[logLevel.toLowerCase()] || LOG_LEVELS.info;

// Mobile-specific logger that only uses console (no file system operations)
class MobileLogger implements Logger {
  private shouldLog(level: string): boolean {
    return LOG_LEVELS[level] >= currentLogLevel;
  }

  private formatMessage(
    level: string,
    message: string,
    ...args: LogArgs
  ): string {
    const timestamp = new Date().toISOString();
    const formattedArgs =
      args.length > 0
        ? ' ' +
          args
            .map((arg) => {
              if (typeof arg === 'string') {
                return arg;
              } else if (typeof arg === 'number' || typeof arg === 'boolean') {
                return String(arg);
              } else if (typeof arg === 'object' && arg !== null) {
                return JSON.stringify(arg, null, 2);
              } else if (arg === null || arg === undefined) {
                return String(arg);
              } else {
                return '[Unknown Type]';
              }
            })
            .join(' ')
        : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('debug')) return;

    const formattedMessage = this.formatMessage('debug', message, ...args);
    console.debug(formattedMessage);
  }

  info(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('info')) return;

    const formattedMessage = this.formatMessage('info', message, ...args);
    console.info(formattedMessage);
  }

  warn(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('warn')) return;

    const formattedMessage = this.formatMessage('warn', message, ...args);
    console.warn(formattedMessage);
  }

  error(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('error')) return;

    const formattedMessage = this.formatMessage('error', message, ...args);
    console.error(formattedMessage);
  }

  fatal(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('fatal')) return;

    const formattedMessage = this.formatMessage('fatal', message, ...args);
    console.error(formattedMessage);
  }
}

export const LOGGER = new MobileLogger();
