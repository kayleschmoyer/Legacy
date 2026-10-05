import type { ILogger } from './types';

/**
 * Grace period between logging a fatal error and forcing the process to exit.
 * `LOGGER.error` forwards to Rollbar over HTTP; this gives that request a
 * chance to finish before a still-open handle (DB pool, server) is cut off.
 */
export const FATAL_EXIT_GRACE_MS = 2000;

/**
 * Minimal slice of `NodeJS.Process` this module needs — lets tests pass an
 * `EventEmitter` instead of mutating the real `process` listeners and exit
 * state.
 */
export type ErrorHandlerProcess = Pick<
  NodeJS.Process,
  'on' | 'removeListener' | 'exitCode' | 'env'
> & {
  exit: (code?: number) => void;
};

export interface GlobalErrorHandlerOptions {
  proc?: ErrorHandlerProcess;
  graceMs?: number;
}

/** Normalize an `unhandledRejection` reason into an `Error` for logging. */
export function toRejectionError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === 'string') return new Error(reason);
  if (typeof reason === 'number' || typeof reason === 'boolean') {
    return new Error(String(reason));
  }
  if (typeof reason === 'object' && reason !== null) {
    return new Error(JSON.stringify(reason));
  }
  if (reason === null || reason === undefined) return new Error(String(reason));
  return new Error('[Unknown rejection reason]');
}

/**
 * Log uncaught exceptions and unhandled rejections, then make the process exit
 * non-zero.
 *
 * Registering any `uncaughtException` listener disables Node's default
 * crash-with-exit-1, so a listener that only logs turns every crash into a
 * clean exit 0 — CI jobs and scripts then report green on failure (LS-10565).
 * After logging, the handler sets `process.exitCode = 1` and, outside Lambda,
 * forces `exit(1)` after a short grace period so a lingering handle cannot keep
 * a crashed process alive. The timer is unref'd: if the event loop drains first
 * the process exits on its own, still with code 1.
 *
 * Inside Lambda the Node runtime registers its own listeners that report the
 * invocation error to the Runtime API and then exit, so this handler only sets
 * `exitCode` there and never calls `exit()` — exiting early could cut off the
 * runtime's error report.
 *
 * Returns a disposer that detaches both listeners.
 */
export function installGlobalErrorHandlers(
  logger: ILogger,
  {
    proc = process,
    graceMs = FATAL_EXIT_GRACE_MS,
  }: GlobalErrorHandlerOptions = {},
): () => void {
  const isLambda = !!proc.env['AWS_LAMBDA_FUNCTION_NAME'];
  let exitScheduled = false;

  const failProcess = (): void => {
    proc.exitCode = 1;
    if (isLambda || exitScheduled) return;
    exitScheduled = true;
    const timer = setTimeout(() => proc.exit(1), graceMs);
    timer.unref?.();
  };

  const onUncaughtException = (error: Error): void => {
    logger.error('Uncaught Exception', error);
    failProcess();
  };

  const onUnhandledRejection = (reason: unknown): void => {
    logger.error('Promise rejected', toRejectionError(reason));
    failProcess();
  };

  proc.on('uncaughtException', onUncaughtException);
  proc.on('unhandledRejection', onUnhandledRejection);

  return () => {
    proc.removeListener('uncaughtException', onUncaughtException);
    proc.removeListener('unhandledRejection', onUnhandledRejection);
  };
}
