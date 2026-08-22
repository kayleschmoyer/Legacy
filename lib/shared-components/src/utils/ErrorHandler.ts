import { LOGGER } from '@legacy-sports/logging';
import { getMessageFromError } from '@legacy-sports/utils';

// The first arg becomes the Rollbar report's title, so it must carry the
// actual error detail rather than a static label — RollbarOutputDestination
// only recovers a specific message from an Error-typed arg, and otherwise
// falls back to this message.
export function handleError(err: unknown): void {
  const message = getMessageFromError(err);
  const errorObj = err instanceof Error ? err : new Error(message);

  LOGGER.error(message, errorObj);
}
