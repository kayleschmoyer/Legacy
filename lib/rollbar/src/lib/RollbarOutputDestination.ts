/**
 * An OutputDestination that automatically forwards error/fatal log entries to
 * Rollbar. Added to LOGGER when a Rollbar implementation calls init(), so
 * callers no longer need to invoke both LOGGER.error() and captureError().
 *
 * Re-entrant calls are suppressed: if captureError() itself logs at error/fatal
 * level (e.g. on failure), those internal log entries are not forwarded again.
 */

import { type LogEntry, type OutputDestination } from '@legacy-sports/logging';

type CaptureErrorFn = (error: Error, context?: Record<string, unknown>) => void;

export class RollbarOutputDestination implements OutputDestination {
  private captureErrorFn: CaptureErrorFn;
  /** Prevents re-entrant calls when captureError() itself logs an error. */
  private capturing = false;

  constructor(captureError: CaptureErrorFn) {
    this.captureErrorFn = captureError;
  }

  shouldLog(level: string): boolean {
    return level === 'error' || level === 'fatal';
  }

  write(entry: LogEntry): void {
    if (this.capturing) return;
    this.capturing = true;
    try {
      // Use the first Error argument if present; synthesise one from the
      // message otherwise so every error/fatal log reaches Rollbar.
      const errorArg = entry.args.find(
        (arg): arg is Error => arg instanceof Error,
      );
      const error = errorArg ?? new Error(entry.message);

      const context: Record<string, unknown> = {
        logLevel: entry.level,
        logMessage: entry.message,
      };

      const otherArgs = entry.args.filter((arg) => !(arg instanceof Error));
      if (otherArgs.length > 0) {
        context['logArgs'] = otherArgs;
      }

      this.captureErrorFn(error, context);
    } finally {
      this.capturing = false;
    }
  }
}
