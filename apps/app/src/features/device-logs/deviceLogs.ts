import { Share } from 'react-native';
import { DeviceFileOutputDestination, LOGGER } from '@legacy-sports/logging';

export const DEVICE_LOGS_PREF_KEY = 'enable_device_logs';
const SHARE_MAX_CHARS = 200_000;

/**
 * Raised by `shareCurrentLogFile` when the share request cannot be fulfilled
 * (logging disabled, file not yet written for today, etc.). Distinct from
 * generic `Error` so callers can differentiate user-actionable failures from
 * unexpected ones in catch blocks and analytics.
 */
export class DeviceLogShareError extends Error {
  constructor(
    message: string,
    public readonly reason: 'disabled' | 'missing-file',
  ) {
    super(message);
    this.name = 'DeviceLogShareError';
  }
}

let activeDestination: DeviceFileOutputDestination | null = null;

export function isDeviceLoggingEnabled(): boolean {
  return activeDestination !== null;
}

/** Register the device-file destination. Idempotent. */
export async function enableDeviceLogging(): Promise<void> {
  if (activeDestination) return;
  const dest = new DeviceFileOutputDestination();
  // Best-effort startup cleanup of >7-day-old files.
  await dest.cleanupOldFiles();
  LOGGER.addDestination(dest);
  activeDestination = dest;
}

/** Unregister the device-file destination. Existing files preserved. */
export function disableDeviceLogging(): void {
  if (!activeDestination) return;
  LOGGER.removeDestination(activeDestination);
  activeDestination = null;
}

export function getCurrentLogFilePath(): string | null {
  return activeDestination?.getCurrentLogFilePath() ?? null;
}

/**
 * Open the OS share sheet with today's log content. Reads the file via
 * expo-file-system (lazy-required to avoid pulling the Expo module into
 * non-mobile tests) and shares the contents via React Native's `Share`
 * API. Only the tail of the file (last `SHARE_MAX_CHARS`) is shared via the
 * `message` field — we intentionally do not pass the file `url` even on iOS,
 * because that would attach the *full* file and bypass the truncation, which
 * could leak sensitive log data beyond the diagnostic window the admin
 * expects to share.
 */
export async function shareCurrentLogFile(): Promise<void> {
  const filePath = activeDestination?.getCurrentLogFilePath();
  if (!filePath) {
    throw new DeviceLogShareError(
      'Device logging is not enabled — no log file to share.',
      'disabled',
    );
  }

  // Indirect identifier defeats esbuild's static `require()` resolution so
  // the lambda bundles don't try to pull react-native. See the matching
  // comment in DeviceFileOutputDestination.native.ts for the full rationale
  // behind the eslint-disable — it's a narrowly-scoped approved exception.
  const moduleId = ['expo-file-system', 'legacy'].join('/');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require(moduleId) as {
    getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
    readAsStringAsync: (uri: string) => Promise<string>;
  };

  const info = await FileSystem.getInfoAsync(filePath);
  if (!info.exists) {
    throw new DeviceLogShareError(
      'No log file exists yet for today.',
      'missing-file',
    );
  }

  const contents = await FileSystem.readAsStringAsync(filePath);
  const truncated =
    contents.length > SHARE_MAX_CHARS
      ? contents.slice(-SHARE_MAX_CHARS)
      : contents;

  await Share.share({
    message: truncated,
    title: 'Legacy Sports device log',
  });
}
