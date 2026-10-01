import type { ILogger } from './types';

/**
 * Minimal slice of `NodeJS.Process` this module needs — lets tests pass an
 * `EventEmitter` instead of mutating the real `process` listeners.
 */
export type WarningEmitter = Pick<
  NodeJS.Process,
  'on' | 'removeListener' | 'removeAllListeners'
>;

/**
 * Route Node `process` `'warning'` events through the logger at WARN.
 *
 * Node's built-in `'warning'` listener prints to stderr, which the Lambda
 * runtime's JSON log format records at level ERROR. That is how the AWS SDK's
 * `NodeVersionSupportWarning` flooded ERROR-filtered CloudWatch views on every
 * graphql cold start (LS-10338). Replacing the default listener keeps process
 * warnings visible but at the level they actually belong to.
 *
 * Returns a disposer that detaches the listener again.
 */
export function routeProcessWarnings(
  logger: ILogger,
  proc: WarningEmitter = process,
): () => void {
  // Drop Node's default stderr printer so each warning is emitted exactly once,
  // through the logger, instead of once at WARN and once more at ERROR.
  proc.removeAllListeners('warning');

  const listener = (warning: Error): void => {
    logger.warn(`${warning.name}: ${warning.message}`, warning);
  };
  proc.on('warning', listener);

  return () => {
    proc.removeListener('warning', listener);
  };
}
