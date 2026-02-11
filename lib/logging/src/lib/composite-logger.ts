import { ConsoleLogger } from './console-logger';
import { FileLogger } from './file-logger';
import { type ILogger, type LogArgs, type OutputDestination } from './types';

// Composite logger that combines console and file logging
// Used in server/Node.js environments where file logging is desired
export class CompositeLogger implements ILogger {
  private consoleLogger: ConsoleLogger;
  private fileLogger: FileLogger;
  private isNode: boolean;

  constructor() {
    this.consoleLogger = new ConsoleLogger();
    this.fileLogger = new FileLogger();
    this.isNode = typeof process !== 'undefined' && !!process.versions?.node;
  }

  // Stub implementation - CompositeLogger doesn't support dynamic destinations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addDestination(_destination: OutputDestination): void {
    // No-op: CompositeLogger doesn't support dynamic destinations
  }

  // Stub implementation - CompositeLogger doesn't support dynamic destinations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeDestination(_destination: OutputDestination): void {
    // No-op: CompositeLogger doesn't support dynamic destinations
  }

  // Stub implementation - CompositeLogger doesn't support dynamic destinations
  clearDestinations(): void {
    // No-op: CompositeLogger doesn't support dynamic destinations
  }

  // Stub implementation - CompositeLogger doesn't support dynamic destinations
  getDestinations(): OutputDestination[] {
    return []; // CompositeLogger doesn't support dynamic destinations
  }

  debug(message: string, ...args: LogArgs): void {
    this.consoleLogger.debug(message, ...args);
    if (this.isNode) {
      this.fileLogger.writeToFile('debug', message, ...args);
    }
  }

  info(message: string, ...args: LogArgs): void {
    this.consoleLogger.info(message, ...args);
    if (this.isNode) {
      this.fileLogger.writeToFile('info', message, ...args);
    }
  }

  warn(message: string, ...args: LogArgs): void {
    this.consoleLogger.warn(message, ...args);
    if (this.isNode) {
      this.fileLogger.writeToFile('warn', message, ...args);
    }
  }

  error(message: string, ...args: LogArgs): void {
    this.consoleLogger.error(message, ...args);
    if (this.isNode) {
      this.fileLogger.writeToFile('error', message, ...args);
    }
  }

  fatal(message: string, ...args: LogArgs): void {
    this.consoleLogger.fatal(message, ...args);
    if (this.isNode) {
      this.fileLogger.writeToFile('fatal', message, ...args);
    }
  }
}
