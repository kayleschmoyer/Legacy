import { getEnvVarOptional } from '@legacy-sports/env-utilities';
import {
  formatLogEntry,
  type LogArgs,
  type LogEntry,
  type LogLevel,
} from './types';
import { EnvironmentVariable } from '../EnvironmentVariable';

// File logger module - Node.js only, contains fs and path dependencies
export class FileLogger {
  private logFile: string | undefined;

  constructor() {
    this.logFile = getEnvVarOptional(EnvironmentVariable.LOG_LOCATION);
  }

  writeToFile(level: LogLevel, message: string, ...args: LogArgs): void {
    // Only operate if we have a log file configured
    if (!this.logFile) return;

    try {
      // Use require() for Node.js built-ins - this module should only be used in Node.js
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js built-in conditional import
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js built-in conditional import
      const path = require('path') as typeof import('path');

      const fullPath = path.resolve(process.cwd(), this.logFile);

      const entry: LogEntry = {
        level,
        message,
        args,
        timestamp: new Date(),
      };
      const formattedMessage = formatLogEntry(entry) + '\n';

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
}
