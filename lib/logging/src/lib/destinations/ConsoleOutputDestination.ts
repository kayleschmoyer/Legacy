import {
  formatLogEntry,
  type LogEntry,
  type OutputDestination,
} from '../types';

// Console output destination - safe for all platforms
export class ConsoleOutputDestination implements OutputDestination {
  write(entry: LogEntry): void {
    const formattedMessage = formatLogEntry(entry);

    try {
      switch (entry.level) {
        case 'debug':
          console.debug(formattedMessage);
          break;
        case 'info':
          console.info(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'error':
        case 'fatal':
          console.error(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    } catch (error) {
      // EPIPE means the pipe consumer (e.g. test runner, shell pipe) closed — not a real error
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') {
        throw error;
      }
    }
  }
}
