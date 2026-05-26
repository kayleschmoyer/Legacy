import type { LogEntry, LogLevel, OutputDestination } from '../types';

export interface DeviceFileOutputDestinationOptions {
  documentDirectory?: string | null;
  now?: () => Date;
  retentionDays?: number;
}

/**
 * Server/web stub — always a no-op. The real implementation lives in
 * DeviceFileOutputDestination.native.ts and is resolved by Metro for
 * mobile targets. esbuild (lambda bundles) and web bundlers see this stub
 * instead, avoiding a pull of expo-file-system into non-mobile bundles.
 */
export class DeviceFileOutputDestination implements OutputDestination {
  constructor(_options: DeviceFileOutputDestinationOptions = {}) {
    // no-op on non-native platforms
  }

  getCurrentLogFilePath(): string | null {
    return null;
  }
  getLogDirectory(): string | null {
    return null;
  }
  shouldLog(_level: LogLevel): boolean {
    return false;
  }
  write(_entry: LogEntry): void {
    // no-op on non-native platforms
  }
  async cleanupOldFiles(): Promise<void> {
    // no-op on non-native platforms
  }
}
