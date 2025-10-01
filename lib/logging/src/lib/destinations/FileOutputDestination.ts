import * as fs from 'fs';
import * as path from 'path';
import {
  formatLogEntry,
  type LogEntry,
  type OutputDestination,
} from '../types';

// File output destination - Node.js only, contains fs and path dependencies
export class FileOutputDestination implements OutputDestination {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  write(entry: LogEntry): void {
    try {
      const fullPath = path.resolve(process.cwd(), this.filePath);
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
