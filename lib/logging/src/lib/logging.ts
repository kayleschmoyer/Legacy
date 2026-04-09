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
  addDestination(filePath: string): void;
}

// Check if we're in a Node.js environment
const isNode =
  typeof process !== 'undefined' && process.versions && process.versions.node;

// Get the directory where the CLI was invoked from (set by ls-cli.ps1)
// Fall back to process.cwd() if not set
const invokeDir =
  isNode && typeof process !== 'undefined'
    ? process.env.CLI_INVOKE_DIR || process.cwd()
    : '';

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
  private additionalLogFiles: string[] = [];

  private shouldLog(level: string): boolean {
    return LOG_LEVELS[level] >= currentLogLevel;
  }

  addDestination(filePath: string): void {
    if (!isNode) {
      console.warn('addDestination is only supported in Node.js environments');
      return;
    }
    this.additionalLogFiles.push(filePath);
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

  private writeToFile(level: string, message: string, ...args: LogArgs): void {
    if (!isNode) return;

    const logFile = getEnvVarOptional(EnvironmentVariable.LOG_LOCATION);
    const filesToWrite = logFile
      ? [logFile, ...this.additionalLogFiles]
      : this.additionalLogFiles;

    if (filesToWrite.length === 0) return;

    try {
      // Use import() for dynamic imports in Node.js environments
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js built-in conditional import
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js built-in conditional import
      const path = require('path') as typeof import('path');

      const formattedMessage =
        this.formatMessage(level, message, ...args) + '\n';

      for (const file of filesToWrite) {
        // Resolve relative to the invoke directory, not current process directory
        const fullPath = path.isAbsolute(file)
          ? file
          : path.resolve(invokeDir, file);

        // Ensure directory exists
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.appendFileSync(fullPath, formattedMessage, 'utf8');
      }
    } catch (error) {
      // Write to stderr instead of using console.error to avoid recursion
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`Failed to write to log file: ${String(error)}\n`);
      } else {
        console.error('Failed to write to log file:', error);
      }
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

// Note: global uncaughtException/unhandledRejection handlers live in
// lib/logging/src/index.ts (the primary entry point) to avoid duplicate
// handler registration. Do NOT add process.on listeners here.
