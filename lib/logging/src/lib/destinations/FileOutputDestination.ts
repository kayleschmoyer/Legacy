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
      // Use CLI_INVOKE_DIR if set (by ls-cli.ps1), otherwise use process.cwd()
      const baseDir = process.env['CLI_INVOKE_DIR'] || process.cwd();
      const fullPath = path.isAbsolute(this.filePath)
        ? this.filePath
        : path.resolve(baseDir, this.filePath);
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
