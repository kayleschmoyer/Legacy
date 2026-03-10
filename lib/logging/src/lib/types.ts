// Shared logging types and interfaces

/**
 * Safely encode a string for console output, handling emojis and special characters.
 * This prevents encoding issues in Windows PowerShell and other terminals.
 */
export function safeEncodeForConsole(str: string): string {
  // For Node.js environments, use Buffer to properly encode UTF-8
  if (typeof Buffer !== 'undefined') {
    try {
      // Convert to Buffer and back to ensure proper UTF-8 encoding
      return Buffer.from(str, 'utf8').toString('utf8');
    } catch {
      // Fallback: just return the string
      return str;
    }
  }
  // For browser/mobile environments, return as-is
  return str;
}

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
  addDestination(destination: OutputDestination): void;
  removeDestination(destination: OutputDestination): void;
  clearDestinations(): void;
  getDestinations(): OutputDestination[];
}

// Utility functions
export function shouldLog(level: LogLevel, minimumLevel: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minimumLevel];
}

/**
 * JSON.stringify replacer that converts Error instances to plain objects with
 * their name, message, and stack preserved (normally lost during serialization).
 */
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

function serializeArg(arg: LogArgs[number]): string {
  if (typeof arg === 'string') {
    return arg;
  } else if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  } else if (arg instanceof Error) {
    // Direct Error argument — extract stack before serializing
    return JSON.stringify(errorReplacer('', arg), null, 2);
  } else if (typeof arg === 'object' && arg !== null) {
    // Plain object — use replacer so nested Errors (e.g. { error }) are preserved
    return JSON.stringify(arg, errorReplacer, 2);
  } else if (arg === null || arg === undefined) {
    return String(arg);
  } else {
    return '[Unknown Type]';
  }
}

export function formatLogEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const formattedArgs =
    entry.args.length > 0 ? ' ' + entry.args.map(serializeArg).join(' ') : '';
  const formattedMessage = `[${timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${formattedArgs}`;
  // Apply emoji-safe encoding for console output
  return safeEncodeForConsole(formattedMessage);
}
