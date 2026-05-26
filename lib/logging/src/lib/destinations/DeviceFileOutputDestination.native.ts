import { type LogEntry, type LogLevel, type OutputDestination } from '../types';

// Lazily require expo-file-system/legacy so that simply importing this module
// (e.g. via the package barrel) does not pull the Expo module into Jest's
// resolver for tests that have nothing to do with device logging.
//
// esbuild isolation for lambda bundles is now handled by the platform-split
// approach: index.ts imports DeviceFileOutputDestination (no .native suffix),
// so esbuild sees the non-native stub (DeviceFileOutputDestination.ts) while
// Metro resolves this .native.ts file for Android/iOS targets.
//
// We define only the subset of the expo-file-system/legacy API we actually
// use rather than typing it as `typeof import('expo-file-system/legacy')`.
// The `typeof import()` form causes ts-jest to resolve the entire Expo type
// graph during compilation, consuming ~2 GB of heap and OOMing CI DB tests.
interface FileSystemModule {
  documentDirectory: string | null;
  getInfoAsync(
    uri: string,
  ): Promise<{ exists: boolean; [key: string]: unknown }>;
  readAsStringAsync(uri: string): Promise<string>;
  writeAsStringAsync(uri: string, contents: string): Promise<void>;
  makeDirectoryAsync(
    uri: string,
    options?: { intermediates?: boolean },
  ): Promise<void>;
  readDirectoryAsync(uri: string): Promise<string[]>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}
let cachedFs: FileSystemModule | null = null;
function loadFileSystem(): FileSystemModule {
  if (!cachedFs) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- expo-file-system/legacy is CJS-only; dynamic import() is async and unusable in a sync loadFileSystem() call
    cachedFs = require('expo-file-system/legacy') as FileSystemModule;
  }
  return cachedFs;
}

const LOG_DIR_NAME = 'logs';
const FILE_PREFIX = 'legacy-sports-';
const FILE_SUFFIX = '.log';
const DEFAULT_RETENTION_DAYS = 7;
const FILENAME_DATE_RE = /^legacy-sports-(\d{4}-\d{2}-\d{2})\.log$/;

export interface DeviceFileOutputDestinationOptions {
  /** Override the document directory (used by tests). */
  documentDirectory?: string | null;
  /** Override "now" used to compute today's filename (used by tests). */
  now?: () => Date;
  /** Days of history to retain. Defaults to 7. */
  retentionDays?: number;
}

function isoDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Mobile-only log destination that appends NDJSON entries to a daily-rotated
 * file under expo-file-system's document directory. Only registered when the
 * user is an admin and has explicitly enabled the device-log preference.
 */
export class DeviceFileOutputDestination implements OutputDestination {
  private readonly baseDir: string | null;
  private readonly now: () => Date;
  private readonly retentionDays: number;

  constructor(options: DeviceFileOutputDestinationOptions = {}) {
    const docDir =
      options.documentDirectory !== undefined
        ? options.documentDirectory
        : loadFileSystem().documentDirectory;
    this.baseDir = docDir ? `${docDir}${LOG_DIR_NAME}/` : null;
    this.now = options.now ?? (() => new Date());
    this.retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  }

  /** Absolute path to today's log file. */
  getCurrentLogFilePath(): string | null {
    if (!this.baseDir) return null;
    return `${this.baseDir}${FILE_PREFIX}${isoDate(this.now())}${FILE_SUFFIX}`;
  }

  /** Absolute path to the logs directory. */
  getLogDirectory(): string | null {
    return this.baseDir;
  }

  shouldLog(_level: LogLevel): boolean {
    return this.baseDir !== null;
  }

  write(entry: LogEntry): void {
    const filePath = this.getCurrentLogFilePath();
    if (!filePath) return;
    void this.appendEntry(filePath, entry);
  }

  private async appendEntry(filePath: string, entry: LogEntry): Promise<void> {
    try {
      await this.ensureDirectory();
      const line =
        JSON.stringify({
          level: entry.level,
          timestamp: entry.timestamp.toISOString(),
          message: entry.message,
          args: entry.args,
        }) + '\n';

      const fs = loadFileSystem();
      const info = await fs.getInfoAsync(filePath);
      if (!info.exists) {
        await fs.writeAsStringAsync(filePath, line);
        return;
      }

      // The legacy expo-file-system API does not expose an append primitive
      // (no `appendStringAsync`, no `{ append: true }` on `writeAsStringAsync`)
      // so we read+rewrite. Daily rotation + 7-day retention bounds each
      // file to a single day of entries, which keeps the working set small
      // enough that this is acceptable for an admin-only diagnostic path.
      const existing = await fs.readAsStringAsync(filePath);
      await fs.writeAsStringAsync(filePath, existing + line);
    } catch {
      // Swallow — logging must never crash the host. Console-destination
      // remains the source of truth for diagnostics.
    }
  }

  private async ensureDirectory(): Promise<void> {
    if (!this.baseDir) return;
    const info = await loadFileSystem().getInfoAsync(this.baseDir);
    if (!info.exists) {
      await loadFileSystem().makeDirectoryAsync(this.baseDir, {
        intermediates: true,
      });
    }
  }

  /**
   * Delete log files older than `retentionDays`. Safe to call on every app
   * start. Resolves silently on any filesystem error.
   */
  async cleanupOldFiles(): Promise<void> {
    if (!this.baseDir) return;
    try {
      const dirInfo = await loadFileSystem().getInfoAsync(this.baseDir);
      if (!dirInfo.exists) return;

      const entries = await loadFileSystem().readDirectoryAsync(this.baseDir);
      const today = this.now();
      const cutoff = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() - this.retentionDays + 1,
        ),
      );

      await Promise.all(
        entries.map(async (name) => {
          const match = FILENAME_DATE_RE.exec(name);
          if (!match) return;
          const fileDate = new Date(`${match[1]}T00:00:00Z`);
          if (fileDate < cutoff) {
            await loadFileSystem().deleteAsync(`${this.baseDir}${name}`, {
              idempotent: true,
            });
          }
        }),
      );
    } catch {
      // Best-effort cleanup.
    }
  }
}
