// Shared logging types and interfaces

// Type for log arguments
export type LogArgs = (string | number | boolean | object | null | undefined)[];

// Log levels with numeric values for comparison
export const LOG_LEVELS: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export type LogLevel = keyof typeof LOG_LEVELS;

// Log entry interface
export interface LogEntry {
  level: LogLevel;
  message: string;
  args: LogArgs;
  timestamp: Date;
}

// Output destination interface - plugins implement this
export interface OutputDestination {
  write(entry: LogEntry): void;
  shouldLog?(level: LogLevel): boolean;
}

// Logger configuration
export interface LoggerConfig {
  outputDestinations: OutputDestination[];
  minimumLevel?: LogLevel;
}

// Define the main logger interface
export interface ILogger {
  debug(message: string, ...args: LogArgs): void;
  info(message: string, ...args: LogArgs): void;
  warn(message: string, ...args: LogArgs): void;
  error(message: string, ...args: LogArgs): void;
  fatal(message: string, ...args: LogArgs): void;
}

// Utility functions
export function shouldLog(level: LogLevel, minimumLevel: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minimumLevel];
}

export function formatLogEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const formattedArgs =
    entry.args.length > 0
      ? ' ' +
        entry.args
          .map((arg) => {
            if (typeof arg === 'string') {
              return arg;
            } else if (typeof arg === 'number' || typeof arg === 'boolean') {
              // eslint-disable-next-line @typescript-eslint/no-base-to-string
              return String(arg);
            } else if (typeof arg === 'object' && arg !== null) {
              return JSON.stringify(arg, null, 2);
            } else if (arg === null || arg === undefined) {
              // eslint-disable-next-line @typescript-eslint/no-base-to-string
              return String(arg);
            } else {
              return '[Unknown Type]';
            }
          })
          .join(' ')
      : '';
  return `[${timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${formattedArgs}`;
}
