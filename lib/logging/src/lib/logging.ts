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

// Check if we're in a Node.js environment
const isNode =
  typeof process !== 'undefined' && process.versions && process.versions.node;

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

// Create a universal logger that works in both browser and Node.js
class UniversalLogger implements Logger {
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
            .map((arg) =>
              typeof arg === 'object' && arg !== null
                ? JSON.stringify(arg, null, 2)
                : String(arg)
            )
            .join(' ')
        : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
  }

  private writeToFile(level: string, message: string, ...args: LogArgs): void {
    if (!isNode) return;

    const logFile = getEnvVarOptional(EnvironmentVariable.LOG_LOCATION);
    if (!logFile) return;

    try {
      // Dynamic imports for Node.js modules to avoid bundling issues
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
      const path = require('path') as typeof import('path');
      const fullPath = path.resolve(process.cwd(), logFile);
      const formattedMessage =
        this.formatMessage(level, message, ...args) + '\n';

      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.appendFileSync(fullPath, formattedMessage);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  debug(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('debug')) return;

    const formattedMessage = this.formatMessage('debug', message, ...args);
    console.debug(formattedMessage);
    this.writeToFile('debug', message, ...args);
  }

  info(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('info')) return;

    const formattedMessage = this.formatMessage('info', message, ...args);
    console.info(formattedMessage);
    this.writeToFile('info', message, ...args);
  }

  warn(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('warn')) return;

    const formattedMessage = this.formatMessage('warn', message, ...args);
    console.warn(formattedMessage);
    this.writeToFile('warn', message, ...args);
  }

  error(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('error')) return;

    const formattedMessage = this.formatMessage('error', message, ...args);
    console.error(formattedMessage);
    this.writeToFile('error', message, ...args);
  }

  fatal(message: string, ...args: LogArgs): void {
    if (!this.shouldLog('fatal')) return;

    const formattedMessage = this.formatMessage('fatal', message, ...args);
    console.error(formattedMessage);
    this.writeToFile('fatal', message, ...args);
  }
}

export const LOGGER = new UniversalLogger();

// Global error handlers (only in Node.js environment)
if (isNode && typeof process !== 'undefined') {
  process.on('uncaughtException', (error) => {
    LOGGER.error('Uncaught Exception', error.message, error.stack);
  });

  process.on('unhandledRejection', (reason) => {
    LOGGER.error(
      'Promise rejected',
      reason instanceof Error ? reason.message : String(reason)
    );
  });
}
