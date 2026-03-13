import { LOGGER } from '@legacy-sports/logging';

// Simple error message extraction function - browser compatible
function getMessageFromError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return 'An unknown error occurred';
}

export function handleError(err: unknown): void {
  const message = getMessageFromError(err);

  // Log the error
  LOGGER.error('Error occurred:', message);
}
