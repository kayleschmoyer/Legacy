import { LOGGER } from '@legacy-sports/logging';
import { getMessageFromError } from '@legacy-sports/utils';

export function handleError(err: unknown): void {
  const message = getMessageFromError(err);

  // TODO(LS-324): Replace with better error handling solution
  LOGGER.error('Error occurred:', message);
}
